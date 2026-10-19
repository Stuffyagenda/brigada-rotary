/**
 * Historial de atención de un reporte para la ficha: las visitas (de la más
 * reciente a la más antigua) y la atención registrada en el propio reporte.
 * Función pura, probada en historial.test.tsx.
 *
 * Al guardar una visita, `saveVisita` copia su instante a `attended_at` y sus
 * entregas al reporte (salvo que la visita sea anterior a la última atención).
 * Por eso la atención del reporte solo es un registro aparte cuando
 * `attended_at` no coincide con ninguna visita:
 * - sin visitas: es la "Atención inicial";
 * - con visitas: se coloca en su lugar cronológico. Si es la más antigua, es la
 *   "Atención inicial"; si no (visitas con fecha anterior registradas después),
 *   es la "Atención registrada en el reporte".
 * Cuando una visita ya la sustituyó, la atención original no se conserva en los
 * datos y no se muestra.
 */
import type { ReporteLocal, SyncStatus, VisitaLocal } from "@/lib/db";
import { ordenarVisitas } from "@/hooks/useVisitas";
import { fechaPanama } from "@/lib/vigencia";
import { listaEntregas } from "./format";

export type EntradaHistorial =
  | {
      tipo: "visita";
      id: string;
      /** `YYYY-MM-DD` (Panamá). */
      fecha: string;
      brigadista: string | null;
      entregas: string[];
      observaciones: string | null;
      sync: SyncStatus;
    }
  | {
      tipo: "atencion";
      id: "atencion";
      titulo: "Atención inicial" | "Atención registrada en el reporte";
      /** `YYYY-MM-DD` (Panamá) de `attended_at`. */
      fecha: string;
      entregas: string[];
      observaciones: string | null;
    };

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function textoONull(s: string | null | undefined): string | null {
  const t = s?.trim();
  return t ? t : null;
}

/** Entradas del historial, de la más reciente a la más antigua. Vacío si no hay nada que mostrar. */
export function entradasHistorial(
  r: Pick<ReporteLocal, "estado" | "attended_at" | "observaciones_atencion" | "ent_otros"> &
    Parameters<typeof listaEntregas>[0],
  visitas: readonly VisitaLocal[],
): EntradaHistorial[] {
  const ordenadas = ordenarVisitas(visitas);
  const entradas: Array<{ t: number; e: EntradaHistorial }> = ordenadas.map((v, i) => ({
    // Si `visitado_at` no es válido, se conserva el orden por fecha.
    t: instante(v.visitado_at) ?? Date.parse(`${v.fecha}T12:00:00Z`) - i,
    e: {
      tipo: "visita",
      id: v.id,
      fecha: v.fecha,
      brigadista: textoONull(v.brigadista_texto),
      entregas: listaEntregas(v),
      observaciones: textoONull(v.observaciones),
      sync: v._sync,
    },
  }));

  const atendido = r.estado === "ATENDIDO" ? instante(r.attended_at) : null;
  const sustituida = atendido !== null && entradas.some(({ t }) => t === atendido);
  if (atendido !== null && !sustituida) {
    const masAntigua = entradas.every(({ t }) => t > atendido);
    entradas.push({
      t: atendido,
      e: {
        tipo: "atencion",
        id: "atencion",
        titulo: masAntigua ? "Atención inicial" : "Atención registrada en el reporte",
        fecha: fechaPanama(new Date(atendido)),
        entregas: listaEntregas(r),
        observaciones: textoONull(r.observaciones_atencion),
      },
    });
  }

  // Orden estable: de la más reciente a la más antigua.
  return entradas
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map(({ e }) => e);
}
