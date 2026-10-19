/**
 * Lectura reactiva de las visitas locales (Dexie) de un reporte: el historial
 * de la ficha se actualiza solo cuando se guarda una visita o llega del servidor.
 */
import { useLiveQuery } from "dexie-react-hooks";
import { db, type VisitaLocal } from "@/lib/db";

/**
 * Orden del historial: fecha de la visita descendente y, a igual fecha,
 * `visitado_at` descendente (la más reciente primero). Función pura.
 */
export function ordenarVisitas<V extends Pick<VisitaLocal, "fecha" | "visitado_at">>(visitas: readonly V[]): V[] {
  return [...visitas].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    const ta = Date.parse(a.visitado_at);
    const tb = Date.parse(b.visitado_at);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

export interface UseVisitasResult {
  /** Visitas del reporte, de la más reciente a la más antigua. */
  visitas: VisitaLocal[];
  /** `true` hasta la primera lectura de IndexedDB. */
  loading: boolean;
}

/** Visitas locales de un reporte, reactivas. Con `reporteId` vacío devuelve `[]`. */
export function useVisitas(reporteId: string | null | undefined): UseVisitasResult {
  const visitas = useLiveQuery(
    async () => (reporteId ? ordenarVisitas(await db.visitas.where("reporte_id").equals(reporteId).toArray()) : []),
    [reporteId],
  );
  return { visitas: visitas ?? [], loading: visitas === undefined };
}
