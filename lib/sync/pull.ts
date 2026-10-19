/**
 * Descarga y reconciliación de reportes del servidor.
 *
 * Reglas (las mismas de la app anterior):
 * - Lo pendiente local gana: un reporte con operaciones en la cola no se pisa.
 * - Se borran del dispositivo los reportes `synced` que ya no existen en el servidor.
 * - Nunca se borra un reporte pendiente ni con error.
 * - Un reporte `synced` local más nuevo que el descargado (p. ej. por Realtime
 *   durante la descarga) no retrocede.
 *
 * Visitas (después de los reportes), con las mismas reglas por visita: una
 * visita con entradas en la cola no se pisa, una `synced` más nueva no
 * retrocede y las `synced` que ya no están en el servidor se borran. Si el
 * servidor aún no tiene la tabla `visitas` (sin la migración 003), se omiten
 * sin romper la descarga de reportes.
 */
import { db, type ReporteLocal, type VisitaLocal } from "@/lib/db";
import type { TypedSupabaseClient } from "@/lib/supabase/client";
import { conStatus } from "@/lib/sync/errors";
import { esEntradaVisita } from "@/lib/sync/outbox";
import type { Reporte, Visita } from "@/lib/types";
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

// ---------------------------------------------------------------------------
// Visitas
// ---------------------------------------------------------------------------

/** Códigos de "la tabla no existe": PostgREST (caché de esquema) y Postgres (`undefined_table`). */
const CODIGOS_TABLA_AUSENTE = new Set(["PGRST205", "42P01"]);

/** `true` si el error indica que la tabla `visitas` no existe en el servidor (falta la migración 003). */
export function esTablaAusente(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && CODIGOS_TABLA_AUSENTE.has(code);
}

/**
 * Descarga todas las visitas visibles para el usuario (RLS), paginadas.
 * @returns `null` si la tabla no existe en el servidor.
 */
export async function descargarVisitas(client: TypedSupabaseClient): Promise<Visita[] | null> {
  const todas: Visita[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error, status } = await client
      .from("visitas")
      .select("*")
      .order("id")
      .range(desde, desde + PAGINA - 1);
    if (error) {
      if (esTablaAusente(error)) return null;
      throw conStatus(error, status);
    }
    const filas = (data ?? []) as unknown as Visita[];
    todas.push(...filas);
    if (filas.length < PAGINA) return todas;
  }
}

function instante(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/**
 * `true` si la visita local está sincronizada y es más nueva que `remota` (no
 * debe retroceder). Compara `visitado_at` y, si coincide, `created_at`.
 */
export function masNuevaLocal(
  local: VisitaLocal | undefined,
  remota: Pick<Visita, "visitado_at" | "created_at">,
): boolean {
  if (!local || local._sync !== "synced") return false;
  const lv = instante(local.visitado_at);
  const rv = instante(remota.visitado_at);
  if (Number.isFinite(lv) && Number.isFinite(rv) && lv !== rv) return lv > rv;
  const lc = instante(local.created_at);
  const rc = instante(remota.created_at);
  return Number.isFinite(lc) && Number.isFinite(rc) && lc > rc;
}

/**
 * Aplica al espejo local la lista completa de visitas del servidor. Solo guarda
 * las de reportes que existen en el celular (tras reconciliar los reportes).
 */
export async function reconciliarVisitas(remotas: readonly Visita[]): Promise<void> {
  await db.transaction("rw", db.visitas, db.reportes, db.outbox, async () => {
    const enCola = new Set(
      (await db.outbox.toArray()).filter(esEntradaVisita).map((e) => e.visitaId),
    );
    const reportes = new Set((await db.reportes.toCollection().primaryKeys()) as string[]);
    const idsRemotos = new Set(remotas.map((v) => v.id));
    const locales = await db.visitas.toArray();
    const porId = new Map(locales.map((l) => [l.id, l]));

    const aGuardar: VisitaLocal[] = remotas
      .filter((v) => reportes.has(v.reporte_id) && !enCola.has(v.id) && !masNuevaLocal(porId.get(v.id), v))
      .map((v) => ({ ...v, _sync: "synced" }));
    if (aGuardar.length) await db.visitas.bulkPut(aGuardar);

    const aBorrar = locales
      .filter((l) => l._sync === "synced" && !idsRemotos.has(l.id) && !enCola.has(l.id))
      .map((l) => l.id);
    if (aBorrar.length) await db.visitas.bulkDelete(aBorrar);
  });
}

/**
 * Descarga y reconcilia las visitas.
 * @returns `false` si el servidor aún no tiene la tabla `visitas` (no se toca nada local).
 */
export async function pullVisitas(client: TypedSupabaseClient): Promise<boolean> {
  const remotas = await descargarVisitas(client);
  if (remotas === null) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[sync] El servidor no tiene la tabla `visitas` (falta supabase/migrations/003_registro_fecha_visitas.sql); se omiten las visitas.",
      );
    }
    return false;
  }
  await reconciliarVisitas(remotas);
  return true;
}
