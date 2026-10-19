/**
 * Base de datos local (IndexedDB vía Dexie).
 *
 * - `reportes`: espejo local de `public.reportes` más el estado de sincronización.
 * - `visitas` (v2): espejo local de `public.visitas` más el estado de sincronización.
 * - `outbox`: cola de operaciones pendientes de enviar a Supabase (reportes y visitas).
 * - `meta`: pares clave/valor del motor de sync (p. ej. fecha del último pull).
 *
 * La UI lee siempre de aquí (con `useLiveQuery`), nunca directamente de Supabase.
 */
import Dexie, { type EntityTable, type Transaction } from "dexie";
import type { Reporte, ReporteUpsert, Visita, VisitaUpsert } from "@/lib/types";
import { fechaPanama, hoyPanama } from "@/lib/vigencia";

/** Estado de sincronización de un reporte local. */
export type SyncStatus = "synced" | "pending" | "error";

/** Reporte guardado en el celular. */
export type ReporteLocal = Reporte & {
  /** `synced`: igual que en el servidor; `pending`: con cambios sin subir; `error`: el último intento falló. */
  _sync: SyncStatus;
  /**
   * URL `blob:` para previsualizar una foto aún no subida. Solo es válida en la
   * sesión en que se creó; tras recargar, regenerarla desde `outbox.foto`.
   */
  _fotoLocalUrl?: string;
};

/** Visita guardada en el celular. */
export type VisitaLocal = Visita & {
  /** `synced`: igual que en el servidor; `pending`: sin subir; `error`: el último intento falló. */
  _sync: SyncStatus;
};

/**
 * Operación de la cola. `"delete"` ya no se produce (los reportes y las visitas
 * no se borran); se conserva solo para leer entradas antiguas, que se descartan.
 */
export type OutboxOp = "upsert" | "delete";

/** Entidad a la que se refiere una entrada de la cola. */
export type OutboxEntidad = "reporte" | "visita";

/**
 * Entrada de la cola de salida.
 *
 * - Entidad `reporte` (o `entidad` ausente: entradas anteriores a la v2):
 *   `payload` es la fila de `reportes`.
 * - Entidad `visita`: `reporteId` es el `reporte_id` de la visita (así
 *   la reconciliación la trata junto con su reporte),
 *   `visitaId` su id y `visitaPayload` la fila de `visitas`; `payload` es `null`.
 */
export interface OutboxEntry {
  /** Autoincremental: define el orden de envío. */
  seq: number;
  /** Ausente = `"reporte"` (compatibilidad con las entradas de la v1). */
  entidad?: OutboxEntidad;
  reporteId: string;
  op: OutboxOp;
  /** Fila de `reportes` a enviar con `upsert`; `null` en `delete` y en las entradas de visita. */
  payload: ReporteUpsert | null;
  /** Solo entidad `visita`: id de la visita. */
  visitaId?: string;
  /** Solo entidad `visita`: fila de `visitas` a enviar con `upsert`; `null` en `delete`. */
  visitaPayload?: VisitaUpsert | null;
  /** Foto comprimida pendiente de subir a Storage (solo en `upsert`). */
  foto?: Blob;
  /** Número de intentos fallidos. */
  intentos: number;
  /** Mensaje del último error, si lo hubo. */
  lastError?: string;
  /** ISO 8601. */
  createdAt: string;
}

/** Entrada de metadatos clave/valor. */
export interface MetaEntry {
  key: string;
  value: unknown;
}

/** Fecha (Panamá) de un `created_at`, o la de hoy si no es válido. */
function fechaDeCreacion(createdAt: unknown): string {
  try {
    return typeof createdAt === "string" ? fechaPanama(createdAt) : hoyPanama();
  } catch {
    return hoyPanama();
  }
}

/**
 * Migración local a la v2: rellena `fecha_reporte` (fecha de `created_at` en
 * Panamá, igual que el backfill de la migración 003) en los reportes y en los
 * `upsert` pendientes de la cola que no la tengan.
 */
export async function rellenarFechaReporte(tx: Transaction): Promise<void> {
  await tx
    .table<ReporteLocal>("reportes")
    .toCollection()
    .modify((r) => {
      if (!r.fecha_reporte) r.fecha_reporte = fechaDeCreacion(r.created_at);
    });
  await tx
    .table<OutboxEntry>("outbox")
    .toCollection()
    .modify((e) => {
      if (e.payload && !e.payload.fecha_reporte) e.payload.fecha_reporte = fechaDeCreacion(e.payload.created_at);
    });
}

export class BrigadaDB extends Dexie {
  reportes!: EntityTable<ReporteLocal, "id">;
  visitas!: EntityTable<VisitaLocal, "id">;
  outbox!: EntityTable<OutboxEntry, "seq">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor(name = "brigada-rotary") {
    super(name);
    this.version(1).stores({
      reportes: "id, estado, updated_at, _sync",
      outbox: "++seq, reporteId",
      meta: "key",
    });
    // v2 (ola 2): tabla `visitas` y `fecha_reporte` en los reportes ya guardados.
    this.version(2)
      .stores({
        visitas: "id, reporte_id, fecha, _sync",
      })
      .upgrade(rellenarFechaReporte);
  }
}

/** Instancia única de la base local. Dexie no abre la conexión hasta el primer uso. */
export const db = new BrigadaDB();
