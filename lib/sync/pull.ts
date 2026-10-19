/**
 * Descarga y reconciliación de reportes del servidor.
 *
 * Reglas (las mismas de la app anterior):
 * - Lo pendiente local gana: un reporte con operaciones en la cola no se pisa.
 * - Se borran del dispositivo los reportes `synced` que ya no existen en el servidor.
 * - Nunca se borra un reporte pendiente ni con error.
 * - Un reporte `synced` local más nuevo que el descargado (p. ej. por Realtime
 *   durante la descarga) no retrocede.
 */
import { db, type ReporteLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { conStatus } from "@/lib/sync/errors";
import type { Reporte } from "@/lib/types";
import { fechaPanama } from "@/lib/vigencia";

/** Tamaño de página (PostgREST limita las filas por respuesta). */
const PAGINA = 1000;

/**
 * Completa una fila del servidor: si aún no trae `fecha_reporte` (servidor sin
 * la migración 003), usa la fecha de `created_at` en Panamá, como el backfill.
 */
export function normalizarRemoto(fila: Reporte): Reporte {
  if (fila.fecha_reporte) return fila;
  let fecha: string;
  try {
    fecha = fechaPanama(fila.created_at);
  } catch {
    return fila;
  }
  return { ...fila, fecha_reporte: fecha };
}

/** Descarga todos los reportes visibles para el usuario (RLS). */
export async function descargarReportes(client: TypedSupabaseClient): Promise<Reporte[]> {
  const todos: Reporte[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error, status } = await client
      .from("reportes")
      .select("*")
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw conStatus(error, status);
    const filas = ((data ?? []) as unknown as Reporte[]).map(normalizarRemoto);
    todos.push(...filas);
    if (filas.length < PAGINA) return todos;
  }
}

/** `true` si el local está sincronizado y es más nuevo que `remoto` (no debe retroceder). */
export function masNuevoLocal(local: ReporteLocal | undefined, remoto: Pick<Reporte, "updated_at">): boolean {
  if (!local || local._sync !== "synced") return false;
  const l = Date.parse(local.updated_at);
  const r = Date.parse(remoto.updated_at);
  return Number.isFinite(l) && Number.isFinite(r) && l > r;
}

/** Aplica al espejo local la lista completa de reportes del servidor. */
export async function reconciliar(remotos: readonly Reporte[]): Promise<void> {
  await db.transaction("rw", db.reportes, db.outbox, async () => {
    const enCola = new Set((await db.outbox.toArray()).map((e) => e.reporteId));
    const idsRemotos = new Set(remotos.map((r) => r.id));
    const locales = await db.reportes.toArray();
    const porId = new Map(locales.map((l) => [l.id, l]));

    const aGuardar: ReporteLocal[] = remotos
      .filter((r) => !enCola.has(r.id) && !masNuevoLocal(porId.get(r.id), r))
      .map((r) => ({ ...r, _sync: "synced" }));
    if (aGuardar.length) await db.reportes.bulkPut(aGuardar);

    const aBorrar = locales
      .filter((l) => l._sync === "synced" && !idsRemotos.has(l.id) && !enCola.has(l.id))
      .map((l) => l.id);
    if (aBorrar.length) await db.reportes.bulkDelete(aBorrar);
  });
}

/** Descarga y reconcilia. */
export async function pullReportes(client: TypedSupabaseClient): Promise<void> {
  const remotos = await descargarReportes(client);
  await reconciliar(remotos);
}
