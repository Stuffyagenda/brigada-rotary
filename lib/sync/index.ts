/**
 * Contrato público del motor de sincronización.
 *
 * La UI solo usa estas funciones; nunca escribe directamente en Supabase.
 * Flujo: guardar → Dexie (`reportes` + `outbox`) → envío a Supabase cuando hay
 * señal → reconciliación.
 *
 * ESTADO: implementación mínima (stub). Guarda localmente y encola, pero no
 * envía nada al servidor. TODO(sync-offline): implementar el envío, el pull,
 * Realtime y los reintentos SIN cambiar las firmas exportadas.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { useSyncExternalStore } from "react";
import { db, type OutboxEntry, type ReporteLocal } from "@/lib/db";
import { calcularAttendedAt } from "@/lib/report-rules";
import {
  reporteSchema,
  totalPersonas,
  type ReporteInput,
  type ReporteUpsert,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Tipos del contrato
// ---------------------------------------------------------------------------

export interface SaveReportResult {
  /** id del reporte guardado (generado si era nuevo). */
  id: string;
  /** `synced` si ya quedó en el servidor; `pending` si quedó en la cola local. */
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
  return crypto.randomUUID();
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
 * - Marca el reporte local como `_sync: 'pending'` y añade una entrada `upsert` al outbox.
 *
 * Se espera que el formulario haya aplicado antes `aplicarReglasGuardado`
 * (lib/report-rules.ts).
 *
 * @param input datos del formulario.
 * @param foto foto ya comprimida (`compressImage`) para subir a Storage.
 *   `null`/`undefined`: no hay foto nueva (se conserva `foto_path`).
 * @returns id del reporte y si quedó sincronizado o pendiente.
 */
export async function saveReport(input: ReporteInput, foto?: Blob | null): Promise<SaveReportResult> {
  const id = input.id ?? nuevoId();
  const ahora = new Date();
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
      foto_url: parsed.foto_url !== undefined ? parsed.foto_url : (previo?.foto_url ?? null),
      foto_path: parsed.foto_path !== undefined ? parsed.foto_path : (previo?.foto_path ?? null),
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

    const local: ReporteLocal = {
      ...payload,
      total_personas: totalPersonas(payload),
      created_by: previo?.created_by ?? null,
      updated_by: previo?.updated_by ?? null,
      _sync: "pending",
      _fotoLocalUrl: foto ? crearObjectUrl(foto) : previo?._fotoLocalUrl,
    };
    if (foto) revocarObjectUrl(previo?._fotoLocalUrl);

    await db.reportes.put(local);
    const entry: Omit<OutboxEntry, "seq"> = {
      reporteId: id,
      op: "upsert",
      payload,
      intentos: 0,
      createdAt: ahoraIso,
      ...(foto ? { foto } : {}),
    };
    await db.outbox.add(entry as OutboxEntry);
  });

  return { id, status: "pending" };
}

/**
 * Borra un reporte (solo admin; la RLS lo impide a los miembros).
 * Debe quitarlo del espejo local y encolar un `delete`.
 *
 * TODO(sync-offline): implementar.
 * @throws Error siempre, mientras no esté implementado.
 */
export async function deleteReport(id: string): Promise<void> {
  void id;
  throw new Error("No implementado");
}

/**
 * Envía la cola y descarga los cambios del servidor.
 * Se llama al guardar, al volver la señal, cada 60 s y con el botón de sincronizar.
 *
 * TODO(sync-offline): implementar. El stub no envía nada.
 */
export async function syncNow(): Promise<SyncNowResult> {
  const pendientes = await db.outbox.count();
  return { subidos: 0, pendientes, error: "La sincronización aún no está disponible." };
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

/**
 * Estado de la sincronización para el indicador de la barra superior.
 * `online` y `pendientes` ya son reales; `syncing`, `lastError` y `lastSyncAt`
 * los completará el motor de sync.
 */
export function useSyncState(): SyncState {
  const online = useOnline();
  const pendientes = useLiveQuery(() => db.outbox.count(), [], 0);
  return { online, syncing: false, pendientes };
}
