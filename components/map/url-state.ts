/**
 * Estado de la pantalla del mapa guardado en la URL (searchParams):
 * filtros combinables y qué muestra el panel (resumen, ficha, formulario o
 * formulario de visita).
 *
 * Funciones puras: se prueban sin navegador.
 */
import { filtrarReportes } from "@/hooks/useReportes";
import type { ReporteLocal } from "@/lib/db";
import { INSUMO_CLAVES, PRIORIDADES, type InsumoClave, type Prioridad, type Vigencia } from "@/lib/types";
import { vigencia as vigenciaDe, VIGENCIAS } from "@/lib/vigencia";

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/**
 * Una necesidad filtrable: insumo con columna propia (`nec_<clave>`) u `"otros"`
 * (= `nec_otros` con algún elemento).
 */
export type NecesidadFiltro = InsumoClave | "otros";

export interface FiltrosMapa {
  /** Vigencia de la atención (lib/vigencia.ts). Reemplaza al antiguo filtro de estado. */
  vigencia: Vigencia[];
  prioridad: Prioridad[];
  necesidad: NecesidadFiltro[];
  club: string[];
}

export const FILTROS_VACIOS: FiltrosMapa = { vigencia: [], prioridad: [], necesidad: [], club: [] };

/** Nombres de los parámetros en la URL. */
export const PARAM = {
  vigencia: "vigencia",
  /** Antiguo filtro de estado: se acepta como alias de `vigencia` (enlaces viejos). */
  estado: "estado",
  prioridad: "prioridad",
  necesidad: "necesidad",
  club: "club",
  reporte: "reporte",
  editar: "editar",
  visita: "visita",
} as const;

/** Alias del antiguo `estado=`: PENDIENTE → pendiente; ATENDIDO → las tres vigencias de atendido. */
const ALIAS_ESTADO: Record<string, readonly Vigencia[]> = {
  PENDIENTE: ["pendiente"],
  ATENDIDO: ["reciente", "por-vencer", "vencido"],
};

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

/**
 * Vigencias de la URL. Si no hay `vigencia=`, se traduce el antiguo `estado=`
 * (PENDIENTE → pendiente; ATENDIDO → reciente, por-vencer y vencido).
 */
function vigenciasDe(params: URLSearchParams): Vigencia[] {
  if (params.get(PARAM.vigencia)) return lista<Vigencia>(params, PARAM.vigencia, VIGENCIAS);
  const elegidas = new Set<Vigencia>();
  for (const estado of lista<string>(params, PARAM.estado, Object.keys(ALIAS_ESTADO))) {
    for (const v of ALIAS_ESTADO[estado]) elegidas.add(v);
  }
  // En el orden de presentación de los chips.
  return VIGENCIAS.filter((v) => elegidas.has(v));
}

/** Lee los filtros de la URL. Ignora valores desconocidos. */
export function parseFiltros(params: URLSearchParams): FiltrosMapa {
  return {
    vigencia: vigenciasDe(params),
    prioridad: lista<Prioridad>(params, PARAM.prioridad, PRIORIDADES),
    necesidad: lista<NecesidadFiltro>(params, PARAM.necesidad, NECESIDADES_VALIDAS),
    club: lista<string>(params, PARAM.club, null),
  };
}

/**
 * Escribe los filtros en una copia de `params` (conserva el resto de parámetros).
 * Siempre quita el antiguo `estado=`: su valor ya está traducido en `vigencia`.
 */
export function writeFiltros(params: URLSearchParams, filtros: FiltrosMapa): URLSearchParams {
  const out = new URLSearchParams(params);
  out.delete(PARAM.estado);
  const pares: Array<[string, readonly string[]]> = [
    [PARAM.vigencia, filtros.vigencia],
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

/** Filtros activos sin contar la vigencia (para el chip "Filtros N"). */
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
 * @param omitirVigencia no filtra por vigencia (para calcular los conteos de los chips).
 * @param ahora referencia de la vigencia (la de `useAhora()`).
 */
export function aplicarFiltros<R extends ReporteLocal>(
  reportes: readonly R[],
  f: FiltrosMapa,
  { omitirVigencia = false, ahora = new Date() }: { omitirVigencia?: boolean; ahora?: Date } = {},
): R[] {
  return filtrarReportes(
    reportes,
    {
      vigencia: omitirVigencia ? undefined : f.vigencia,
      prioridad: f.prioridad,
      clubId: f.club,
      necesidades: f.necesidad,
    },
    ahora,
  );
}

/** Conteo por vigencia respecto a `ahora`. */
export function contarPorVigencia(
  reportes: readonly Pick<ReporteLocal, "estado" | "attended_at">[],
  ahora: Date = new Date(),
): Record<Vigencia, number> {
  const out: Record<Vigencia, number> = { pendiente: 0, reciente: 0, "por-vencer": 0, vencido: 0 };
  for (const r of reportes) out[vigenciaDe(r, ahora)] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// Panel: qué se muestra
// ---------------------------------------------------------------------------

export type VistaPanel =
  | { tipo: "resumen" }
  | { tipo: "ficha"; id: string }
  | { tipo: "formulario"; id: string | "nuevo" }
  | { tipo: "visita"; id: string };

/**
 * `?reporte=<id>` ficha; `?reporte=nuevo` formulario nuevo;
 * `?reporte=<id>&editar=1` edición; `?reporte=<id>&visita=1` nueva visita.
 */
export function parseVista(params: URLSearchParams): VistaPanel {
  const reporte = params.get(PARAM.reporte)?.trim();
  if (!reporte) return { tipo: "resumen" };
  if (reporte === "nuevo") return { tipo: "formulario", id: "nuevo" };
  if (params.get(PARAM.editar) === "1") return { tipo: "formulario", id: reporte };
  if (params.get(PARAM.visita) === "1") return { tipo: "visita", id: reporte };
  return { tipo: "ficha", id: reporte };
}

/** Escribe la vista en una copia de `params` (conserva los filtros). */
export function writeVista(params: URLSearchParams, vista: VistaPanel): URLSearchParams {
  const out = new URLSearchParams(params);
  out.delete(PARAM.editar);
  out.delete(PARAM.visita);
  if (vista.tipo === "resumen") {
    out.delete(PARAM.reporte);
  } else {
    out.set(PARAM.reporte, vista.id);
    if (vista.tipo === "formulario" && vista.id !== "nuevo") out.set(PARAM.editar, "1");
    if (vista.tipo === "visita") out.set(PARAM.visita, "1");
  }
  return out;
}

/** `?a=1&b=2` o cadena vacía; con la ruta, lista para `history.pushState`. */
export function hrefDe(pathname: string, params: URLSearchParams): string {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
