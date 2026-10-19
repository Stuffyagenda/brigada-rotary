/**
 * Lectura reactiva de los reportes locales (Dexie). La UI se actualiza sola
 * cuando el motor de sync o el formulario escriben en la base local.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type ReporteLocal } from "@/lib/db";
import { normalizePlaceName } from "@/lib/places";
import { encodePlusCode } from "@/lib/pluscode";
import { ESTADO_LABEL, type Estado, type NecesidadClave, type Prioridad, type Vigencia } from "@/lib/types";
import { vigencia as vigenciaDe } from "@/lib/vigencia";

/**
 * Filtros combinables. Dentro de cada filtro las opciones se suman (O); entre
 * filtros distintos se exige que se cumplan todos (Y). Un filtro vacío o
 * ausente no filtra.
 */
export interface FiltrosReporte {
  estado?: Estado[];
  /**
   * Vigencia de la atención (`pendiente`, `reciente`, `por-vencer`, `vencido`;
   * ver lib/vigencia.ts), calculada respecto a `ahora`. En el mapa reemplaza al
   * filtro `estado` (parámetro `vigencia` de la URL).
   */
  vigencia?: Vigencia[];
  prioridad?: Prioridad[];
  /**
   * Claves de necesidad (`agua`, `lona`…): el reporte debe tener marcada alguna
   * (`nec_<clave>`). `"otros"` coincide con cualquier elemento en `nec_otros`.
   */
  necesidades?: NecesidadFiltro[];
  /** Ids de club. */
  clubId?: string[];
  /**
   * Búsqueda libre en contacto, teléfono, brigadista, estado ("Pendiente",
   * "Atendido") y Plus Code (el guardado o, si falta, el calculado de la
   * ubicación), sin distinguir mayúsculas ni tildes.
   */
  texto?: string;
}

/** Valor de filtro de necesidad: un insumo o `"otros"` (pañales, frazadas…). */
export type NecesidadFiltro = NecesidadClave | "otros";

function tieneNecesidad(r: ReporteLocal, n: NecesidadFiltro): boolean {
  return n === "otros" ? r.nec_otros.length > 0 : r[`nec_${n}`];
}

function activo<T>(lista: readonly T[] | undefined): lista is readonly T[] {
  return Array.isArray(lista) && lista.length > 0;
}

/** Plus Code guardado o, si falta, el calculado de la ubicación. */
function plusCodeBuscable(r: ReporteLocal): string | null {
  return r.plus_code?.trim() || encodePlusCode(r.lat, r.lng);
}

/** Campos en los que busca `filtros.texto`. */
function camposBuscables(r: ReporteLocal): (string | null | undefined)[] {
  return [
    r.contacto_nombre,
    r.contacto_telefono,
    r.brigadista_texto,
    ESTADO_LABEL[r.estado],
    r.estado,
    plusCodeBuscable(r),
  ];
}

/**
 * Función pura: aplica `filtros` a `reportes` sin cambiar el orden.
 * @param ahora instante de referencia para `filtros.vigencia` (por defecto, ahora).
 */
export function filtrarReportes<R extends ReporteLocal>(
  reportes: readonly R[],
  filtros?: FiltrosReporte,
  ahora: Date = new Date(),
): R[] {
  if (!filtros) return [...reportes];
  const { estado, vigencia, prioridad, necesidades, clubId } = filtros;
  const texto = filtros.texto ? normalizePlaceName(filtros.texto) : "";

  return reportes.filter((r) => {
    if (activo(estado) && !estado.includes(r.estado)) return false;
    if (activo(vigencia) && !vigencia.includes(vigenciaDe(r, ahora))) return false;
    if (activo(prioridad) && !prioridad.includes(r.prioridad)) return false;
    if (activo(necesidades) && !necesidades.some((n) => tieneNecesidad(r, n))) return false;
    if (activo(clubId) && (r.club_id == null || !clubId.includes(r.club_id))) return false;
    if (texto && !camposBuscables(r).some((c) => c && normalizePlaceName(c).includes(texto))) return false;
    return true;
  });
}

export interface UseReportesResult {
  /** Reportes filtrados, del más reciente al más antiguo (`updated_at`). */
  reportes: ReporteLocal[];
  /** `true` hasta la primera lectura de IndexedDB. */
  loading: boolean;
}

/**
 * Reportes locales filtrados, reactivos a cambios en Dexie.
 * @param ahora referencia del filtro `vigencia`; pasar la de `useAhora()` para
 *   que se recalcule al pasar el tiempo. Sin ella se usa la hora del cálculo.
 */
export function useReportes(filtros?: FiltrosReporte, ahora?: Date): UseReportesResult {
  const todos = useLiveQuery(() => db.reportes.orderBy("updated_at").reverse().toArray(), []);
  const clave = JSON.stringify(filtros ?? {});
  const instante = ahora?.getTime();
  const reportes = useMemo(() => {
    if (!todos) return [];
    const referencia = instante === undefined ? new Date() : new Date(instante);
    return filtrarReportes(todos, JSON.parse(clave) as FiltrosReporte, referencia);
  }, [todos, clave, instante]);
  return { reportes, loading: todos === undefined };
}

export interface UseReporteResult {
  /** `undefined` si no existe (o mientras carga). */
  reporte: ReporteLocal | undefined;
  loading: boolean;
}

/** Un reporte local por id, reactivo. Con `id` vacío devuelve `undefined`. */
export function useReporte(id: string | null | undefined): UseReporteResult {
  const resultado = useLiveQuery(
    async () => ({ reporte: id ? await db.reportes.get(id) : undefined }),
    [id],
  );
  return { reporte: resultado?.reporte, loading: resultado === undefined };
}
