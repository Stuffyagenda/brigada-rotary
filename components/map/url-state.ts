/**
 * Estado de la pantalla del mapa guardado en la URL (searchParams):
 * filtros combinables y qué muestra el panel (resumen, ficha o formulario).
 *
 * Funciones puras: se prueban sin navegador.
 */
import { filtrarReportes } from "@/hooks/useReportes";
import type { ReporteLocal } from "@/lib/db";
import {
  ESTADOS,
  INSUMO_CLAVES,
  PRIORIDADES,
  type Estado,
  type InsumoClave,
  type Prioridad,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/**
 * Una necesidad filtrable: insumo con columna propia (`nec_<clave>`) u `"otros"`
 * (= `nec_otros` con algún elemento).
 */
export type NecesidadFiltro = InsumoClave | "otros";

export interface FiltrosMapa {
  estado: Estado[];
  prioridad: Prioridad[];
  necesidad: NecesidadFiltro[];
  club: string[];
}

export const FILTROS_VACIOS: FiltrosMapa = { estado: [], prioridad: [], necesidad: [], club: [] };

/** Nombres de los parámetros en la URL. */
export const PARAM = {
  estado: "estado",
  prioridad: "prioridad",
  necesidad: "necesidad",
  club: "club",
  reporte: "reporte",
  editar: "editar",
} as const;

const NECESIDADES_VALIDAS: readonly string[] = [...INSUMO_CLAVES, "otros"];
const UUIDISH = /^[0-9a-f-]{8,64}$/i;

function lista<T extends string>(params: URLSearchParams, nombre: string, validos: readonly string[] | null): T[] {
  const crudo = params.get(nombre);
  if (!crudo) return [];
  const vistos = new Set<string>();
  for (const parte of crudo.split(",")) {
    const v = parte.trim();
    if (!v) continue;
    if (validos ? validos.includes(v) : UUIDISH.test(v)) vistos.add(v);
  }
  return [...vistos] as T[];
}

/** Lee los filtros de la URL. Ignora valores desconocidos. */
export function parseFiltros(params: URLSearchParams): FiltrosMapa {
  return {
    estado: lista<Estado>(params, PARAM.estado, ESTADOS),
    prioridad: lista<Prioridad>(params, PARAM.prioridad, PRIORIDADES),
    necesidad: lista<NecesidadFiltro>(params, PARAM.necesidad, NECESIDADES_VALIDAS),
    club: lista<string>(params, PARAM.club, null),
  };
}

/** Escribe los filtros en una copia de `params` (conserva el resto de parámetros). */
export function writeFiltros(params: URLSearchParams, filtros: FiltrosMapa): URLSearchParams {
  const out = new URLSearchParams(params);
  const pares: Array<[string, readonly string[]]> = [
    [PARAM.estado, filtros.estado],
    [PARAM.prioridad, filtros.prioridad],
    [PARAM.necesidad, filtros.necesidad],
    [PARAM.club, filtros.club],
  ];
  for (const [nombre, valores] of pares) {
    if (valores.length > 0) out.set(nombre, valores.join(","));
    else out.delete(nombre);
  }
  return out;
}

/** Filtros activos sin contar el estado (para el chip "Filtros N"). */
export function contarFiltrosExtra(f: FiltrosMapa): number {
  return f.prioridad.length + f.necesidad.length + f.club.length;
}

/** Alterna un valor dentro de una lista (sin mutarla). */
export function alternar<T>(listaActual: readonly T[], valor: T): T[] {
  return listaActual.includes(valor) ? listaActual.filter((v) => v !== valor) : [...listaActual, valor];
}

/**
 * Aplica los filtros del mapa. Dentro de cada filtro las opciones se suman (O);
 * entre filtros se exige que se cumplan todos (Y).
 * @param omitirEstado no filtra por estado (para calcular los conteos de los chips).
 */
export function aplicarFiltros<R extends ReporteLocal>(
  reportes: readonly R[],
  f: FiltrosMapa,
  { omitirEstado = false }: { omitirEstado?: boolean } = {},
): R[] {
  return filtrarReportes(reportes, {
    estado: omitirEstado ? undefined : f.estado,
    prioridad: f.prioridad,
    clubId: f.club,
    necesidades: f.necesidad,
  });
}

/** Conteo por estado. */
export function contarPorEstado(reportes: readonly Pick<ReporteLocal, "estado">[]): Record<Estado, number> {
  const out: Record<Estado, number> = { PENDIENTE: 0, ATENDIDO: 0 };
  for (const r of reportes) out[r.estado] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Panel: qué se muestra
// ---------------------------------------------------------------------------

export type VistaPanel =
  | { tipo: "resumen" }
  | { tipo: "ficha"; id: string }
  | { tipo: "formulario"; id: string | "nuevo" };

/** `?reporte=<id>` ficha; `?reporte=nuevo` formulario nuevo; `?reporte=<id>&editar=1` edición. */
export function parseVista(params: URLSearchParams): VistaPanel {
  const reporte = params.get(PARAM.reporte)?.trim();
  if (!reporte) return { tipo: "resumen" };
  if (reporte === "nuevo") return { tipo: "formulario", id: "nuevo" };
  if (params.get(PARAM.editar) === "1") return { tipo: "formulario", id: reporte };
  return { tipo: "ficha", id: reporte };
}

/** Escribe la vista en una copia de `params` (conserva los filtros). */
export function writeVista(params: URLSearchParams, vista: VistaPanel): URLSearchParams {
  const out = new URLSearchParams(params);
  out.delete(PARAM.editar);
  if (vista.tipo === "resumen") {
    out.delete(PARAM.reporte);
  } else {
    out.set(PARAM.reporte, vista.id);
    if (vista.tipo === "formulario" && vista.id !== "nuevo") out.set(PARAM.editar, "1");
  }
  return out;
}

/** `?a=1&b=2` o cadena vacía; con la ruta, lista para `history.pushState`. */
export function hrefDe(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
