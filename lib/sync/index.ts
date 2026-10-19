/**
 * Contrato público del motor de sincronización.
 *
 * La UI solo usa estas funciones; nunca escribe directamente en Supabase.
 * Flujo: guardar → Dexie (`reportes` + `outbox`) → envío a Supabase cuando hay
 * señal (push) → descarga y reconciliación (pull) → cambios en vivo (Realtime).
 *
 * Disparadores (con `startSyncEngine()`, que monta `components/sync/SyncProvider`):
 * al guardar, al volver la señal, al volver a la pestaña, cada 60 s y con el
 * botón "Sincronizar ahora".
 */
import { useLiveQuery } from "dexie-react-hooks";
import { useSyncExternalStore } from "react";
import { META_ULTIMO_BRIGADISTA } from "@/lib/brigadista";
import { db, type ReporteLocal, type VisitaLocal } from "@/lib/db";
import { calcularAttendedAt } from "@/lib/report-rules";
import { getSyncClient, isOnline } from "@/lib/sync/client";
import { ejecutarExclusivo, ejecutarSync } from "@/lib/sync/engine";
import {
  mensajeDe,
} from "@/lib/sync/errors";
import { limpiarCacheFotos } from "@/lib/sync/foto";
import { contarColaReporte, encolarUpsert, encolarVisita, tieneColaVisita } from "@/lib/sync/outbox";
import { rutaFotoNueva, uuid } from "@/lib/sync/uuid";
import { getEngineState, META_LAST_SYNC, subscribeEngine } from "@/lib/sync/state";
import {
  INSUMOS,
  reporteSchema,
  totalPersonas,
  visitaSchema,
  type ReporteInput,
  type ReporteUpsert,
  type VisitaInput,
  type VisitaUpsert,
} from "@/lib/types";
import { instanteEnFechaPanama } from "@/lib/vigencia";

export { startSyncEngine } from "@/lib/sync/engine";
export { getFotoUrl } from "@/lib/sync/foto";
export { MSG_VISITA_REPORTE_INEXISTENTE } from "@/lib/sync/push";

// ---------------------------------------------------------------------------
// Tipos del contrato
// ---------------------------------------------------------------------------

export interface SaveReportResult {
  /** id del reporte guardado (generado si era nuevo). */
  id: string;
  /** `synced` si ya quedó en el servidor; `pending` si quedó en la cola local. */
  status: "synced" | "pending";
}

export interface SaveVisitaResult {
  /** id de la visita guardada (generado si era nueva). */
  id: string;
  /** `synced` si la visita (y su reporte) ya quedaron en el servidor; si no, `pending`. */
  status: "synced" | "pending";
}

export interface SyncNowResult {
  /** Operaciones enviadas con éxito en esta pasada. */
  subidos: number;
  /** Operaciones que siguen en la cola. */
  pendientes: number;
  /** Mensaje para el usuario si la pasada falló. */
  error?: string;
}

export interface SyncState {
  /** Hay conexión según el navegador. */
  online: boolean;
  /** Hay una sincronización en curso. */
  syncing: boolean;
  /** Operaciones en la cola local. */
  pendientes: number;
  /** Último error de sincronización. */
  lastError?: string;
  /** ISO 8601 de la última sincronización correcta. */
  lastSyncAt?: string;
}

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

function nuevoId(): string {
  return uuid();
}

function crearObjectUrl(blob: Blob): string | undefined {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : undefined;
}

function revocarObjectUrl(url: string | undefined): void {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

/**
 * Guarda un reporte (nuevo o existente) en el celular y lo encola para subirlo.
 *
 * - Valida con `reporteSchema` (lanza `ZodError` si no cumple los checks del SQL).
 * - Si `input.id` falta, genera un UUID.
 * - Garantiza la coherencia estado/`attended_at` del SQL.
 * - Calcula `total_personas` localmente.
 * - Marca el reporte local como `_sync: 'pending'` y añade una entrada `upsert` al outbox
 *   (si ya había un `upsert` pendiente del mismo reporte, lo reemplaza y conserva su foto).
 * - Con señal, intenta enviarlo enseguida (hasta 8 s) y devuelve `synced` solo si
 *   el servidor lo confirmó. Nunca pierde datos: ante cualquier fallo queda `pending`.
 *
 * Se espera que el formulario haya aplicado antes `aplicarReglasGuardado`
 * (lib/report-rules.ts).
 *
 * @param input datos del formulario.
 * @param foto foto ya comprimida (`compressImage`) para subir a Storage. Su ruta
 *   (`{id}/{uuid}.jpg`) queda en `foto_path` desde este momento.
 *   `null`/`undefined`: no hay foto nueva (se conserva `foto_path`).
 * @returns id del reporte y si quedó sincronizado o pendiente.
 */
export async function saveReport(input: ReporteInput, foto?: Blob | null): Promise<SaveReportResult> {
  const id = await guardarReporteLocal(input, foto, new Date());
  const status = await intentarEnvio(async () => {
    const [enCola, guardado] = await Promise.all([contarColaReporte(id), db.reportes.get(id)]);
    return enCola === 0 && guardado?._sync === "synced";
  });
  return { id, status };
}

/**
 * Parte local de `saveReport`: valida, escribe el reporte en Dexie como
 * `pending` y encola el `upsert`, en una transacción (anidable: si se llama
 * dentro de otra transacción `rw` que incluya `reportes` y `outbox`, forma parte de ella).
 * @returns id del reporte.
 */
async function guardarReporteLocal(input: ReporteInput, foto: Blob | null | undefined, ahora: Date): Promise<string> {
  const id = input.id ?? nuevoId();
  const ahoraIso = ahora.toISOString();
  const parsed = reporteSchema.parse({
    ...input,
    id,
    attended_at: calcularAttendedAt(input.estado, input.attended_at, ahora),
  });

  await db.transaction("rw", db.reportes, db.outbox, async () => {
    const previo = await db.reportes.get(id);
    const payload: ReporteUpsert = {
      id,
      created_at: previo?.created_at ?? parsed.created_at ?? ahoraIso,
      updated_at: ahoraIso,
      fecha_reporte: parsed.fecha_reporte,
      attended_at: parsed.attended_at ?? null,
      club_id: parsed.club_id !== undefined ? parsed.club_id : (previo?.club_id ?? null),
      brigadista_texto: parsed.brigadista_texto ?? null,
      estado: parsed.estado,
      prioridad: parsed.prioridad,
      danio_vivienda: parsed.danio_vivienda,
      contacto_nombre: parsed.contacto_nombre ?? null,
      contacto_telefono: parsed.contacto_telefono ?? null,
      lat: parsed.lat,
      lng: parsed.lng,
      plus_code: parsed.plus_code ?? null,
      // La app no permite quitar una foto: un valor vacío nunca borra la que ya hay
      // (p. ej. si el formulario se abrió antes del guardado anterior).
      foto_url: parsed.foto_url || previo?.foto_url || null,
      // Con foto nueva, la ruta en Storage se fija ya aquí: el motor la sube
      // exactamente a esa ruta y los guardados posteriores la heredan.
      foto_path: foto ? rutaFotoNueva(id) : parsed.foto_path || previo?.foto_path || null,
      adultos: parsed.adultos,
      adultos_mayores: parsed.adultos_mayores,
      menores: parsed.menores,
      discapacitados: parsed.discapacitados,
      casos_medicos: parsed.casos_medicos,
      condiciones_medicas: parsed.condiciones_medicas,
      perros: parsed.perros,
      gatos: parsed.gatos,
      nec_agua: parsed.nec_agua,
      nec_kit_alimento: parsed.nec_kit_alimento,
      nec_kit_higiene: parsed.nec_kit_higiene,
      nec_lona: parsed.nec_lona,
      nec_camping: parsed.nec_camping,
      nec_toldas: parsed.nec_toldas,
      nec_colchonetas: parsed.nec_colchonetas,
      nec_otros: parsed.nec_otros,
      ent_agua: parsed.ent_agua,
      ent_kit_alimento: parsed.ent_kit_alimento,
      ent_kit_higiene: parsed.ent_kit_higiene,
      ent_lona: parsed.ent_lona,
      ent_camping: parsed.ent_camping,
      ent_toldas: parsed.ent_toldas,
      ent_colchonetas: parsed.ent_colchonetas,
      ent_otros: parsed.ent_otros,
      observaciones_atencion: parsed.observaciones_atencion ?? null,
    };

    const encolado = await encolarUpsert(payload, foto, ahoraIso);
    const local: ReporteLocal = {
      ...encolado,
      total_personas: totalPersonas(encolado),
      created_by: previo?.created_by ?? null,
      updated_by: previo?.updated_by ?? null,
      _sync: "pending",
      _fotoLocalUrl: foto ? crearObjectUrl(foto) : previo?._fotoLocalUrl,
    };
    if (foto) revocarObjectUrl(previo?._fotoLocalUrl);

    await db.reportes.put(local);
  });
  return id;
}

/**
 * Con señal, intenta enviar la cola enseguida (hasta `ESPERA_GUARDAR_MS`); los
 * datos ya están a salvo en el celular. Devuelve `synced` solo si `confirmado()`
 * lo comprueba después del intento.
 */
async function intentarEnvio(confirmado: () => Promise<boolean>): Promise<"synced" | "pending"> {
  if (!isOnline() || !getSyncClient()) return "pending";
  try {
    await conTiempoLimite(syncNow(), ESPERA_GUARDAR_MS);
  } catch {
    // Cualquier fallo deja los datos pendientes; el motor los reintentará.
  }
  return (await confirmado()) ? "synced" : "pending";
}

/** Mensaje de `saveVisita` cuando el reporte no está en el celular. */
export const MSG_VISITA_SIN_REPORTE = "No se encontró el reporte de esta visita.";

/** `true` si el instante `a` es estrictamente anterior a `b` (con `b` nulo o inválido, `false`). */
function esAnterior(a: string, b: string | null | undefined): boolean {
  if (!b) return false;
  const tb = Date.parse(b);
  return Number.isFinite(tb) && Date.parse(a) < tb;
}

function textoONull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Registra una visita (nueva entrega a una familia ya registrada) en una sola
 * operación local:
 * 1. Valida con `visitaSchema` (lanza `ZodError`: fecha futura, sin entregas ni
 *    observaciones…) y genera el id si falta.
 * 2. Guarda la visita en Dexie (`visitas`, `_sync: 'pending'`), con
 *    `visitado_at` = la fecha de la visita con la hora actual de Panamá (si la
 *    fecha es hoy, ahora mismo).
 * 3. Actualiza el reporte por la ruta de `saveReport` (queda encolado como un
 *    upsert normal): `estado = 'ATENDIDO'`, `attended_at = visitado_at`,
 *    `ent_*`/`ent_otros`/`observaciones_atencion` = los de la visita. Si la
 *    visita es anterior a la última atención del reporte, este no cambia.
 * 4. Encola la visita (`entidad: 'visita'`) después del upsert del reporte:
 *    el motor envía siempre antes el reporte (FK). Varios guardados de la misma
 *    visita quedan en una sola entrada.
 * 5. Con señal, intenta sincronizar enseguida (hasta 8 s): `synced` solo si el
 *    servidor confirmó el reporte y la visita.
 *
 * @throws Error "No se encontró el reporte de esta visita." si el reporte no está en el celular.
 * @returns id de la visita y si quedó sincronizada o pendiente.
 */
export async function saveVisita(input: VisitaInput): Promise<SaveVisitaResult> {
  const ahora = new Date();
  const id = input.id ?? nuevoId();
  const parsed = visitaSchema.parse({ ...input, id });
  const visitadoAt = parsed.visitado_at ?? instanteEnFechaPanama(parsed.fecha, ahora);

  await db.transaction("rw", db.reportes, db.outbox, db.visitas, async () => {
    const reporte = await db.reportes.get(parsed.reporte_id);
    if (!reporte) throw new Error(MSG_VISITA_SIN_REPORTE);
    const previa = await db.visitas.get(id);

    const payload: VisitaUpsert = {
      id,
      reporte_id: parsed.reporte_id,
      fecha: parsed.fecha,
      visitado_at: visitadoAt,
      brigadista_texto: textoONull(parsed.brigadista_texto),
      ent_agua: parsed.ent_agua,
      ent_kit_alimento: parsed.ent_kit_alimento,
      ent_kit_higiene: parsed.ent_kit_higiene,
      ent_lona: parsed.ent_lona,
      ent_camping: parsed.ent_camping,
      ent_toldas: parsed.ent_toldas,
      ent_colchonetas: parsed.ent_colchonetas,
      ent_otros: [...parsed.ent_otros],
      observaciones: textoONull(parsed.observaciones),
      created_at: previa?.created_at ?? ahora.toISOString(),
    };
    const visita: VisitaLocal = { ...payload, created_by: previa?.created_by ?? null, _sync: "pending" };
    await db.visitas.put(visita);

    // El reporte refleja la última entrega (ruta normal de guardado, queda en
    // la cola). Una visita con fecha anterior a la última atención ya
    // registrada (p. ej. una entrega olvidada de hace días) entra al historial
    // pero no retrocede `attended_at` ni las entregas del reporte.
    if (!esAnterior(visitadoAt, reporte.estado === "ATENDIDO" ? reporte.attended_at : null)) {
      const entregas: Partial<ReporteInput> = { ent_otros: [...visita.ent_otros] };
      for (const i of INSUMOS) entregas[i.entColumna] = visita[i.entColumna];
      await guardarReporteLocal(
        {
          ...reporte,
          ...entregas,
          estado: "ATENDIDO",
          attended_at: visitadoAt,
          observaciones_atencion: visita.observaciones,
        },
        null,
        ahora,
      );
    }

    // Después del upsert del reporte: su `seq` es mayor y el motor envía antes
    // el reporte (FK). `encolarVisita` lo garantiza también al colapsar.
    await encolarVisita(payload, ahora.toISOString());
  });

  const status = await intentarEnvio(async () => {
    const reporteId = parsed.reporte_id;
    const [visita, reporte, colaReporte, colaVisita] = await Promise.all([
      db.visitas.get(id),
      db.reportes.get(reporteId),
      contarColaReporte(reporteId),
      tieneColaVisita(reporteId, id),
    ]);
    return visita?._sync === "synced" && !colaVisita && reporte?._sync === "synced" && colaReporte === 0;
  });
  return { id, status };
}

/** Tiempo máximo que `saveReport` espera al servidor antes de responder `pending`. */
const ESPERA_GUARDAR_MS = 8_000;

function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(undefined), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Al cerrar sesión: borra del celular la copia local de los reportes y visitas
 * ya sincronizados (datos personales de las familias) para no dejarlos en un
 * celular compartido. NUNCA borra la cola (`outbox`) ni los reportes pendientes
 * o con error: se enviarán cuando alguien vuelva a iniciar sesión.
 * También olvida el último brigadista escrito, la fecha del último sync y las
 * URL de fotos en memoria. Se ejecuta en exclusiva en la cola del motor.
 * @returns cuántos reportes se borraron.
 */
export function limpiarEspejoLocal(): Promise<number> {
  return ejecutarExclusivo(async () => {
    const borrados = await db.transaction("rw", db.reportes, db.outbox, db.meta, db.visitas, async () => {
      const enCola = new Set((await db.outbox.toArray()).map((e) => e.reporteId));
      const ids = (await db.reportes.where("_sync").equals("synced").toArray())
        .filter((r) => !enCola.has(r.id))
        .map((r) => r.id);
      if (ids.length) await db.reportes.bulkDelete(ids);
      // Visitas ya sincronizadas de reportes sin cambios en cola (se vuelven a descargar).
      const visitas = (await db.visitas.where("_sync").equals("synced").toArray())
        .filter((v) => !enCola.has(v.reporte_id))
        .map((v) => v.id);
      if (visitas.length) await db.visitas.bulkDelete(visitas);
      await db.meta.bulkDelete([META_LAST_SYNC, META_ULTIMO_BRIGADISTA]);
      return ids.length;
    });
    limpiarCacheFotos();
    return borrados;
  });
}

/**
 * Envía la cola y descarga los cambios del servidor (también reintenta los
 * reportes que el servidor rechazó). Nunca lanza: los problemas vuelven en `error`.
 * Se llama al guardar, al volver la señal, cada 60 s y con el botón de sincronizar.
 */
export async function syncNow(): Promise<SyncNowResult> {
  try {
    return await ejecutarSync(true);
  } catch (err) {
    return { subidos: 0, pendientes: await db.outbox.count(), error: mensajeDe(err) };
  }
}

/**
 * Foto pendiente de subir de un reporte (la más reciente del outbox), para
 * previsualizarla tras recargar la página.
 */
export async function getFotoPendiente(reporteId: string): Promise<Blob | undefined> {
  const entries = await db.outbox.where("reporteId").equals(reporteId).toArray();
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].foto) return entries[i].foto;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Estado reactivo
// ---------------------------------------------------------------------------

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** `true` mientras el navegador reporte conexión. En el servidor, `true`. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Estado de la sincronización para el indicador de la barra superior. Reactivo. */
export function useSyncState(): SyncState {
  const online = useOnline();
  const pendientes = useLiveQuery(() => db.outbox.count(), [], 0);
  const lastSyncAt = useLiveQuery(
    async () => {
      const v = (await db.meta.get(META_LAST_SYNC))?.value;
      return typeof v === "string" ? v : undefined;
    },
    [],
    undefined,
  );
  const engine = useSyncExternalStore(subscribeEngine, getEngineState, getEngineState);
  return { online, syncing: engine.syncing, pendientes, lastError: engine.lastError, lastSyncAt };
}
