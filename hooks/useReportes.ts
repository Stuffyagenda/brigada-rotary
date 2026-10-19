/**
 * Lectura reactiva de los reportes locales (Dexie). La UI se actualiza sola
 * cuando el motor de sync o el formulario escriben en la base local.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, type ReporteLocal } from "@/lib/db";
import { normalizePlaceName } from "@/lib/places";
import type { Estado, NecesidadClave, Prioridad } from "@/lib/types";

/**
 * Filtros combinables. Dentro de cada filtro las opciones se suman (O); entre
 * filtros distintos se exige que se cumplan todos (Y). Un filtro vacío o
 * ausente no filtra.
 */
export interface FiltrosReporte {
  estado?: Estado[];
  prioridad?: Prioridad[];
  /** Claves de necesidad (`agua`, `lona`…): el reporte debe tener marcada alguna (`nec_<clave>`). */
  necesidades?: NecesidadClave[];
  /** Ids de club. */
  clubId?: string[];
  /**
   * Búsqueda libre en contacto, teléfono, brigadista y Plus Code
   * (sin distinguir mayúsculas ni tildes).
   */
  texto?: string;
}

function activo<T>(lista: readonly T[] | undefined): lista is readonly T[] {
  return Array.isArray(lista) && lista.length > 0;
}

/** Función pura: aplica `filtros` a `reportes` sin cambiar el orden. */
export function filtrarReportes<R extends ReporteLocal>(reportes: readonly R[], filtros?: FiltrosReporte): R[] {
  if (!filtros) return [...reportes];
  const { estado, prioridad, necesidades, clubId } = filtros;
  const texto = filtros.texto ? normalizePlaceName(filtros.texto) : "";

  return reportes.filter((r) => {
    if (activo(estado) && !estado.includes(r.estado)) return false;
    if (activo(prioridad) && !prioridad.includes(r.prioridad)) return false;
    if (activo(necesidades) && !necesidades.some((n) => r[`nec_${n}`])) return false;
    if (activo(clubId) && (r.club_id == null || !clubId.includes(r.club_id))) return false;
    if (texto) {
      const campos = [r.contacto_nombre, r.contacto_telefono, r.brigadista_texto, r.plus_code];
      if (!campos.some((c) => c && normalizePlaceName(c).includes(texto))) return false;
    }
    return true;
  });
}

export interface UseReportesResult {
  /** Reportes filtrados, del más reciente al más antiguo (`updated_at`). */
  reportes: ReporteLocal[];
  /** `true` hasta la primera lectura de IndexedDB. */
  loading: boolean;
}

/** Reportes locales filtrados, reactivos a cambios en Dexie. */
export function useReportes(filtros?: FiltrosReporte): UseReportesResult {
  const todos = useLiveQuery(() => db.reportes.orderBy("updated_at").reverse().toArray(), []);
  const clave = JSON.stringify(filtros ?? {});
  const reportes = useMemo(
    () => (todos ? filtrarReportes(todos, JSON.parse(clave) as FiltrosReporte) : []),
    [todos, clave],
  );
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
