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
 *
 * Visitas: una entrada de visita solo se envía si no queda en la cola ninguna
 * entrada anterior (seq menor) de su reporte (FK `visitas.reporte_id`): si el
 * reporte falló o está en espera, la visita espera con él. Con la fila devuelta
 * por el servidor, la visita local queda `synced`.
 */
import { db, type ReporteLocal, type VisitaLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { BUCKET_FOTOS } from "@/lib/sync/client";
import { clasificarError, conStatus, mensajeDe, SyncError, type ErrorKind } from "@/lib/sync/errors";
import {
  backoffMs,
  contarColaReporte,
  entradasOrdenadas,
  esEntradaReporte,
  esEntradaVisita,
  tieneColaVisita,
  type OutboxEntrySync,
} from "@/lib/sync/outbox";
import { normalizarRemoto } from "@/lib/sync/pull";
import { rutaFotoNueva } from "@/lib/sync/uuid";
import type { Reporte, ReporteUpsert, Visita, VisitaUpsert } from "@/lib/types";

/** Mensaje cuando el servidor rechaza una visita porque su reporte ya no existe (FK 23503). */
export const MSG_VISITA_REPORTE_INEXISTENTE =
  "La visita no se pudo guardar: su reporte no existe en el servidor (quizá lo borró un administrador).";

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
    if (!actual) return; // La entrada ya no está en la cola (la retiró otra operación).
    if ((actual.rev ?? 1) === (entry.rev ?? 1)) await db.outbox.delete(entry.seq);
    const quedan = await contarColaReporte(entry.reporteId);
    if (quedan === 0) {
      const local: ReporteLocal = { ...normalizarRemoto(fila), _sync: "synced" };
      await db.reportes.put(local);
    }
  });
}

/** Copia de la visita con solo las columnas que se envían (`created_by` lo fija el trigger). */
export function visitaParaServidor(payload: VisitaUpsert): VisitaUpsert {
  const copia: Record<string, unknown> = { ...payload };
  delete copia.created_by;
  delete copia._sync;
  return copia as VisitaUpsert;
}

/**
 * `true` si queda en la cola alguna entrada del reporte de la visita anterior a
 * ella (pendiente, en espera o rechazada): la visita no puede ir antes (FK).
 */
async function reporteAnteriorEnCola(entry: OutboxEntrySync): Promise<boolean> {
  const n = await db.outbox
    .where("reporteId")
    .equals(entry.reporteId)
    .filter((e) => esEntradaReporte(e) && e.seq < entry.seq)
    .count();
  return n > 0;
}

/** Envía una entrada de visita. Lanza el error de Supabase si falla. */
async function enviarVisita(client: TypedSupabaseClient, entry: OutboxEntrySync): Promise<void> {
  const visitaId = entry.visitaId;
  if (!visitaId || !entry.visitaPayload) {
    // Entrada corrupta: no hay nada que enviar.
    await db.outbox.delete(entry.seq);
    return;
  }

  const { data, error, status } = await client
    .from("visitas")
    .upsert(visitaParaServidor(entry.visitaPayload!), { onConflict: "id" })
    .select()
    .single();
  if (error) {
    // FK: el reporte no está en el servidor (p. ej. el reporte no existe en el servidor). No se reintenta solo.
    if ((error as { code?: unknown }).code === "23503") throw new SyncError("fatal", MSG_VISITA_REPORTE_INEXISTENTE);
    throw conStatus(error, status);
  }
  if (!data) throw new SyncError("fatal", "El servidor no devolvió la visita guardada.");

  const fila = data as unknown as Visita;
  await db.transaction("rw", db.outbox, db.visitas, async () => {
    const actual = (await db.outbox.get(entry.seq)) as OutboxEntrySync | undefined;
    // Se retiró de la cola o se movió al final de la cola (nuevo guardado) mientras tanto.
    if (!actual) return;
    if ((actual.rev ?? 1) === (entry.rev ?? 1)) await db.outbox.delete(entry.seq);
    if (await tieneColaVisita(entry.reporteId, visitaId)) return;
    if (!(await db.visitas.get(visitaId))) return;
    const local: VisitaLocal = { ...fila, _sync: "synced" };
    await db.visitas.put(local);
  });
}

/** Registra el fallo de una entrada según su clasificación. */
async function registrarFallo(entry: OutboxEntrySync, kind: ErrorKind, mensaje: string): Promise<void> {
  if (kind === "auth") return; // No es culpa de la entrada: se espera un nuevo inicio de sesión.
  const intentos = entry.intentos + 1;
  await db.transaction("rw", db.outbox, db.reportes, db.visitas, async () => {
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
    if (kind !== "fatal" || actual.op !== "upsert") return;
    if (esEntradaVisita(actual)) {
      if (actual.visitaId) await db.visitas.update(actual.visitaId, { _sync: "error" });
    } else {
      await db.reportes.update(entry.reporteId, { _sync: "error" });
    }
  });
}

/**
 * Envía la cola en orden de `seq`. Los rechazos (fatal) marcan la entrada y la
 * pasada sigue; un fallo de red o de sesión la corta.
 * @param force `true` (manual / al guardar): ignora el backoff y reintenta las entradas con error.
 */
export async function pushOutbox(client: TypedSupabaseClient, force: boolean): Promise<PushResult> {
  const entradas = await entradasOrdenadas();
  const ahora = Date.now();
  let subidos = 0;
  let error: string | undefined;

  for (const entry of entradas) {
    const esVisita = esEntradaVisita(entry);
    if (!force) {
      if (entry.fatal) continue;
      if (entry.nextAttemptAt && Date.parse(entry.nextAttemptAt) > ahora) continue;
    }
    // FK: la visita espera a que su reporte llegue al servidor.
    if (esVisita && (await reporteAnteriorEnCola(entry))) continue;
    // Entradas `delete` heredadas de versiones anteriores: los reportes y las
    // visitas ya no se borran. Se descartan de la cola sin enviar nada.
    if ((entry.op as string) === "delete") {
      await db.outbox.delete(entry.seq);
      continue;
    }
    try {
      if (esVisita) await enviarVisita(client, entry);
      else await enviarUpsert(client, entry);
      subidos += 1;
    } catch (err) {
      const kind = clasificarError(err);
      const mensaje = mensajeDe(err);
      await registrarFallo(entry, kind, mensaje);
      if (kind === "auth") return { subidos, stop: "auth", error: mensaje };
      if (kind === "network") return { subidos, stop: "network", error: mensaje };
      error = `${esVisita ? "El servidor rechazó una visita" : "El servidor rechazó un reporte"}: ${mensaje}`;
    }
  }
  return { subidos, error };
}
