/**
 * Envío de la cola (`outbox`) a Supabase.
 *
 * Por cada entrada, en orden:
 * 1. Si trae foto, la sube a Storage en la ruta que `saveReport` ya fijó en
 *    `foto_path` (`fotos-viviendas/{reporteId}/{uuid}.jpg`, `upsert: false`) y quita
 *    el Blob de la entrada (si el upsert falla, no se vuelve a subir; si se reintenta
 *    y el archivo ya existe, cuenta como subido).
 * 2. `upsert` por `id` con `.select().single()`: la fila devuelta es la confirmación real.
 * 3. Con la fila del servidor, el reporte local queda `synced` y la entrada sale de la cola.
 *
 * Si el usuario edita el reporte mientras se envía, la entrada cambia de `rev` y
 * no se borra: se envía de nuevo en la siguiente pasada.
 */
import { db, type ReporteLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { BUCKET_FOTOS } from "@/lib/sync/client";
import { clasificarError, conStatus, mensajeDe, SyncError, type ErrorKind } from "@/lib/sync/errors";
import {
  backoffMs,
  contarColaReporte,
  entradasOrdenadas,
  esEntradaVisita,
  type OutboxEntrySync,
} from "@/lib/sync/outbox";
import { normalizarRemoto } from "@/lib/sync/pull";
import { rutaFotoNueva } from "@/lib/sync/uuid";
import type { Reporte, ReporteUpsert } from "@/lib/types";

export interface PushResult {
  /** Entradas confirmadas por el servidor. */
  subidos: number;
  /** Motivo por el que se cortó la pasada (red caída o sesión vencida). */
  stop?: Exclude<ErrorKind, "fatal">;
  /** Mensaje del último error, para mostrar al usuario. */
  error?: string;
}

/**
 * Columnas que nunca se envían: las calcula o fija el servidor.
 * `updated_at` tampoco: en el INSERT lo pone el `default now()` y en el UPDATE el
 * trigger `set_reporte_audit`, así no depende del reloj del celular.
 */
const COLUMNAS_SERVIDOR = ["total_personas", "created_by", "updated_by", "updated_at"] as const;

/** Copia del payload sin columnas que controla el servidor. */
export function payloadParaServidor(payload: ReporteUpsert): Omit<ReporteUpsert, "updated_at"> {
  const copia: Record<string, unknown> = { ...payload };
  for (const c of COLUMNAS_SERVIDOR) delete copia[c];
  // `created_at` sí se envía: en el INSERT es la hora real del registro en campo
  // (puede ser horas antes de que haya señal); en un UPDATE el trigger conserva el original.
  return copia as Omit<ReporteUpsert, "updated_at">;
}

/** Storage ya tiene el archivo (reintento tras subirlo): cuenta como éxito. */
function yaExiste(error: unknown): boolean {
  const e = error as { status?: unknown; statusCode?: unknown; message?: unknown };
  return (
    e?.status === 409 ||
    e?.statusCode === "409" ||
    (typeof e?.message === "string" && /already exists|duplicate/i.test(e.message))
  );
}

/**
 * Sube la foto pendiente a la ruta que se le asignó al guardarla y la "consolida"
 * en la entrada (quita el Blob). Devuelve la ruta en Storage.
 */
async function subirFoto(client: TypedSupabaseClient, entry: OutboxEntrySync, foto: Blob): Promise<string> {
  const path = entry.fotoPath ?? entry.payload?.foto_path ?? rutaFotoNueva(entry.reporteId);
  const { error } = await client.storage
    .from(BUCKET_FOTOS)
    .upload(path, foto, { contentType: "image/jpeg", upsert: false });
  if (error && !yaExiste(error)) throw error;

  await db.transaction("rw", db.outbox, db.reportes, async () => {
    const actual = (await db.outbox.get(entry.seq)) as OutboxEntrySync | undefined;
    // Si mientras tanto llegó otra foto, se subirá en la próxima pasada.
    if (!actual || (actual.fotoRev ?? 0) !== (entry.fotoRev ?? 0) || !actual.payload) return;
    const sinFoto: OutboxEntrySync = { ...actual, payload: { ...actual.payload, foto_path: path } };
    delete sinFoto.foto;
    delete sinFoto.fotoRev;
    delete sinFoto.fotoPath;
    await db.outbox.put(sinFoto);
    const local = await db.reportes.get(entry.reporteId);
    if (local && local.foto_path !== path) await db.reportes.update(entry.reporteId, { foto_path: path });
  });
  return path;
}

/** Envía una entrada `upsert`. Lanza el error de Supabase si falla. */
async function enviarUpsert(client: TypedSupabaseClient, entry: OutboxEntrySync): Promise<void> {
  if (!entry.payload) {
    // Entrada corrupta: no hay nada que enviar.
    await db.outbox.delete(entry.seq);
    return;
  }
  let payload = entry.payload;
  if (entry.foto) {
    const path = await subirFoto(client, entry, entry.foto);
    payload = { ...payload, foto_path: path };
  }

  const { data, error, status } = await client
    .from("reportes")
    .upsert(payloadParaServidor(payload), { onConflict: "id" })
    .select()
    .single();
  if (error) throw conStatus(error, status);
  if (!data) throw new SyncError("fatal", "El servidor no devolvió el reporte guardado.");

  const fila = data as unknown as Reporte;
  await db.transaction("rw", db.outbox, db.reportes, async () => {
    const actual = (await db.outbox.get(entry.seq)) as OutboxEntrySync | undefined;
    if (!actual) return; // Se borró mientras tanto (p. ej. deleteReport).
    if ((actual.rev ?? 1) === (entry.rev ?? 1)) await db.outbox.delete(entry.seq);
    const quedan = await contarColaReporte(entry.reporteId);
    if (quedan === 0) {
      const local: ReporteLocal = { ...normalizarRemoto(fila), _sync: "synced" };
      await db.reportes.put(local);
    }
  });
}

/** Envía una entrada `delete` heredada (la app actual borra solo con red, sin encolar). */
async function enviarDelete(client: TypedSupabaseClient, entry: OutboxEntrySync): Promise<void> {
  const { error, status } = await client.from("reportes").delete().eq("id", entry.reporteId);
  if (error) throw conStatus(error, status);
  await db.outbox.delete(entry.seq);
}

/** Registra el fallo de una entrada según su clasificación. */
async function registrarFallo(entry: OutboxEntrySync, kind: ErrorKind, mensaje: string): Promise<void> {
  if (kind === "auth") return; // No es culpa de la entrada: se espera un nuevo inicio de sesión.
  const intentos = entry.intentos + 1;
  await db.transaction("rw", db.outbox, db.reportes, async () => {
    const actual = (await db.outbox.get(entry.seq)) as OutboxEntrySync | undefined;
    if (!actual) return;
    // Si el usuario editó la entrada durante el envío, el error ya no aplica.
    if ((actual.rev ?? 1) !== (entry.rev ?? 1)) return;
    const cambios: Partial<OutboxEntrySync> = {
      intentos,
      lastError: mensaje,
      nextAttemptAt: new Date(Date.now() + backoffMs(intentos)).toISOString(),
      fatal: kind === "fatal",
    };
    await db.outbox.update(entry.seq, cambios);
    if (kind === "fatal" && actual.op === "upsert" && !esEntradaVisita(actual)) {
      await db.reportes.update(entry.reporteId, { _sync: "error" });
    }
  });
}

/**
 * Envía la cola en orden.
 * @param force `true` (manual / al guardar): ignora el backoff y reintenta las entradas con error.
 */
export async function pushOutbox(client: TypedSupabaseClient, force: boolean): Promise<PushResult> {
  const entradas = await entradasOrdenadas();
  const ahora = Date.now();
  let subidos = 0;
  let error: string | undefined;

  for (const entry of entradas) {
    // TODO(sync-visitas): enviar las entradas de visita (siempre después del
    // upsert de su reporte, por la FK). Hasta entonces se dejan intactas en la cola.
    if (esEntradaVisita(entry)) continue;
    if (!force) {
      if (entry.fatal) continue;
      if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > ahora) continue;
    }
    try {
      if (entry.op === "delete") await enviarDelete(client, entry);
      else await enviarUpsert(client, entry);
      subidos += 1;
    } catch (err) {
      const kind = clasificarError(err);
      const mensaje = mensajeDe(err);
      await registrarFallo(entry, kind, mensaje);
      if (kind === "auth") return { subidos, stop: "auth", error: mensaje };
      if (kind === "network") return { subidos, stop: "network", error: mensaje };
      error = `El servidor rechazó un reporte: ${mensaje}`;
    }
  }
  return { subidos, error };
}
