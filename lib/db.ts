/**
 * Base de datos local (IndexedDB vía Dexie).
 *
 * - `reportes`: espejo local de `public.reportes` más el estado de sincronización.
 * - `outbox`: cola de operaciones pendientes de enviar a Supabase.
 * - `meta`: pares clave/valor del motor de sync (p. ej. fecha del último pull).
 *
 * La UI lee siempre de aquí (con `useLiveQuery`), nunca directamente de Supabase.
 */
import Dexie, { type EntityTable } from "dexie";
import type { Reporte, ReporteUpsert } from "@/lib/types";

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

/** Operación de la cola. */
export type OutboxOp = "upsert" | "delete";

/** Entrada de la cola de salida. */
export interface OutboxEntry {
  /** Autoincremental: define el orden de envío. */
  seq: number;
  reporteId: string;
  op: OutboxOp;
  /** Fila a enviar con `upsert`; `null` en `delete`. */
  payload: ReporteUpsert | null;
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

export class BrigadaDB extends Dexie {
  reportes!: EntityTable<ReporteLocal, "id">;
  outbox!: EntityTable<OutboxEntry, "seq">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor(name = "brigada-rotary") {
    super(name);
    this.version(1).stores({
      reportes: "id, estado, updated_at, _sync",
      outbox: "++seq, reporteId",
      meta: "key",
    });
  }
}

/** Instancia única de la base local. Dexie no abre la conexión hasta el primer uso. */
export const db = new BrigadaDB();
