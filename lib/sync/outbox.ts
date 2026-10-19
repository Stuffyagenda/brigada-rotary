/**
 * Cola de salida (`outbox`): encolado con colapso y campos de control del motor.
 *
 * Los campos extra (`rev`, `fotoRev`, `fatal`, `nextAttemptAt`, `entidad`,
 * `visitaId`, `visitaPayload`) no están indexados, así que no requieren una
 * versión nueva del esquema Dexie.
 *
 * Entidades: las entradas sin `entidad` (o con `"reporte"`) son de reportes.
 * Las de `"visita"` llevan `reporteId` (el de su reporte), `visitaId` y
 * `visitaPayload`; el motor las envía después de cualquier entrada anterior de
 * su reporte (FK `visitas.reporte_id`).
 */
import { db, type OutboxEntidad, type OutboxEntry } from "@/lib/db";
import type { ReporteUpsert, VisitaUpsert } from "@/lib/types";

/** Entrada del outbox con los campos de control del motor de sync. */
export interface OutboxEntrySync extends OutboxEntry {
  /** Se incrementa cada vez que la entrada se reemplaza (colapso). */
  rev?: number;
  /** `rev` en la que se adjuntó la foto actual. Permite saber si la foto cambió durante un envío. */
  fotoRev?: number;
  /** Ruta en Storage asignada a `foto` al guardarla (`{reporteId}/{uuid}.jpg`). */
  fotoPath?: string;
  /** El servidor rechazó la entrada (4xx). No se reintenta automáticamente. */
  fatal?: boolean;
  /** ISO 8601: no reintentar automáticamente antes de esta fecha (backoff). */
  nextAttemptAt?: string;
}

/** Entidad de una entrada (`"reporte"` si no la indica: entradas de la v1). */
export function entidadDe(entry: Pick<OutboxEntry, "entidad">): OutboxEntidad {
  return entry.entidad ?? "reporte";
}

/** `true` si la entrada es de un reporte (incluidas las de la v1, sin `entidad`). */
export function esEntradaReporte(entry: Pick<OutboxEntry, "entidad">): boolean {
  return entidadDe(entry) === "reporte";
}

/** `true` si la entrada es de una visita. */
export function esEntradaVisita(entry: Pick<OutboxEntry, "entidad">): boolean {
  return entidadDe(entry) === "visita";
}

/**
 * Cuántas entradas propias del reporte (sin contar las de sus visitas) siguen
 * en la cola. Usar dentro de una transacción con `db.outbox`.
 */
export async function contarColaReporte(reporteId: string): Promise<number> {
  return db.outbox.where("reporteId").equals(reporteId).filter(esEntradaReporte).count();
}

/** Backoff exponencial simple: 5 s, 10 s, 20 s… hasta 5 min. */
export function backoffMs(intentos: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, intentos - 1), 5 * 60_000);
}

/** Entradas de la cola en orden de envío. */
export async function entradasOrdenadas(): Promise<OutboxEntrySync[]> {
  return (await db.outbox.orderBy("seq").toArray()) as OutboxEntrySync[];
}

/**
 * `true` si el reporte tiene operaciones sin enviar, propias o de sus visitas.
 * Usar dentro de una transacción con `db.outbox`.
 */
export async function tieneCola(reporteId: string): Promise<boolean> {
  return (await db.outbox.where("reporteId").equals(reporteId).count()) > 0;
}

/**
 * Encola un `upsert`. Debe llamarse dentro de una transacción `rw` sobre `db.outbox`.
 *
 * Colapso: si ya hay un `upsert` pendiente del mismo reporte, se reemplaza en su
 * lugar de la cola (mismo `seq`) con el payload nuevo. Si no llega foto nueva se
 * conserva la que estaba pendiente (con su ruta en `foto_path`). Las entradas
 * duplicadas que pudiera haber se fusionan en la primera.
 * @returns el payload que quedó en la cola (puede corregir `foto_path`).
 */
export async function encolarUpsert(
  payload: ReporteUpsert,
  foto: Blob | null | undefined,
  ahoraIso: string,
): Promise<ReporteUpsert> {
  const existentes = (await db.outbox
    .where("reporteId")
    .equals(payload.id)
    .filter((e) => e.op === "upsert" && esEntradaReporte(e))
    .sortBy("seq")) as OutboxEntrySync[];

  if (existentes.length === 0) {
    const entry: Omit<OutboxEntrySync, "seq"> = {
      reporteId: payload.id,
      op: "upsert",
      payload,
      intentos: 0,
      createdAt: ahoraIso,
      rev: 1,
      ...(foto ? { foto, fotoRev: 1, fotoPath: payload.foto_path ?? undefined } : {}),
    };
    await db.outbox.add(entry as OutboxEntry);
    return payload;
  }

  const [base, ...resto] = existentes;
  // Foto más reciente entre las entradas pendientes (si no llega una nueva).
  const conFoto = [...existentes].reverse().find((e) => e.foto);
  const rev = Math.max(...existentes.map((e) => e.rev ?? 1)) + 1;

  const siguiente: OutboxEntrySync = {
    seq: base.seq,
    reporteId: base.reporteId,
    op: "upsert",
    payload,
    intentos: 0,
    createdAt: base.createdAt,
    rev,
  };
  if (foto) {
    siguiente.foto = foto;
    siguiente.fotoRev = rev;
    siguiente.fotoPath = payload.foto_path ?? undefined;
  } else if (conFoto?.foto) {
    // Se conserva la foto pendiente y su ruta, aunque el payload nuevo traiga otra.
    siguiente.foto = conFoto.foto;
    siguiente.fotoRev = conFoto.fotoRev ?? conFoto.rev ?? 1;
    siguiente.fotoPath = conFoto.fotoPath ?? conFoto.payload?.foto_path ?? undefined;
    if (siguiente.fotoPath) siguiente.payload = { ...payload, foto_path: siguiente.fotoPath };
  }

  await db.outbox.put(siguiente);
  if (resto.length) await db.outbox.bulkDelete(resto.map((e) => e.seq));
  return siguiente.payload ?? payload;
}

/**
 * `true` si la visita tiene entradas en la cola. Usar dentro de una transacción
 * con `db.outbox`. (`visitaId` no está indexado: se busca entre las entradas de su reporte.)
 */
export async function tieneColaVisita(reporteId: string, visitaId: string): Promise<boolean> {
  return (await entradasDeVisita(reporteId, visitaId).count()) > 0;
}

function entradasDeVisita(reporteId: string, visitaId: string) {
  return db.outbox
    .where("reporteId")
    .equals(reporteId)
    .filter((e) => esEntradaVisita(e) && e.visitaId === visitaId);
}

/**
 * Encola el `upsert` de una visita. Debe llamarse dentro de una transacción `rw`
 * sobre `db.outbox`, DESPUÉS de encolar el upsert de su reporte (si lo hay).
 *
 * Colapso: varias entradas `upsert` de la misma visita quedan en una. Se
 * reemplaza en su sitio (mismo `seq`, `rev` + 1) si ese sitio sigue siendo
 * posterior a todas las entradas de su reporte; si no, pasa al final de la cola,
 * para que el motor envíe siempre antes el reporte (FK).
 */
export async function encolarVisita(payload: VisitaUpsert, ahoraIso: string): Promise<void> {
  const deLaVisita = (await entradasDeVisita(payload.reporte_id, payload.id).sortBy("seq")) as OutboxEntrySync[];
  const existentes = deLaVisita.filter((e) => e.op === "upsert");
  const ultimoReporte = Math.max(
    0,
    ...(await db.outbox.where("reporteId").equals(payload.reporte_id).filter(esEntradaReporte).toArray()).map(
      (e) => e.seq,
    ),
  );
  const rev = existentes.length ? Math.max(...existentes.map((e) => e.rev ?? 1)) + 1 : 1;
  const entry: Omit<OutboxEntrySync, "seq"> = {
    entidad: "visita",
    reporteId: payload.reporte_id,
    visitaId: payload.id,
    op: "upsert",
    payload: null,
    visitaPayload: payload,
    intentos: 0,
    createdAt: existentes[0]?.createdAt ?? ahoraIso,
    rev,
  };

  const [base, ...resto] = existentes;
  if (base && base.seq > ultimoReporte) {
    await db.outbox.put({ ...entry, seq: base.seq } as OutboxEntry);
    if (resto.length) await db.outbox.bulkDelete(resto.map((e) => e.seq));
    return;
  }
  if (existentes.length) await db.outbox.bulkDelete(existentes.map((e) => e.seq));
  await db.outbox.add(entry as OutboxEntry);
}
