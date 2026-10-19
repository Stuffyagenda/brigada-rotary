/**
 * Mensaje de confirmación antes de guardar, según lo que cambió respecto al
 * reporte guardado.
 */
import type { ReporteInput } from "@/lib/types";

export type TipoCambio = "nuevo" | "ubicacion" | "formulario" | "ambos" | "sin-cambios";

export const MENSAJES_CONFIRMACION: Record<TipoCambio, string> = {
  nuevo: "¿Estás seguro de que deseas guardar este nuevo reporte?",
  ubicacion: "¿Estás seguro de cambiar la ubicación de este registro?",
  formulario: "¿Estás seguro de realizar los cambios del formulario?",
  ambos: "¿Estás seguro de cambiar la ubicación y realizar también los cambios del formulario?",
  "sin-cambios": "No se detectaron cambios en los datos. ¿Deseas guardar de todos modos?",
};

/** Tolerancia para considerar que la ubicación no cambió (grados). */
const TOLERANCIA_COORD = 0.0000001;

/**
 * Campos que no cuentan como "cambio del formulario": identificadores, fechas
 * automáticas (`fecha_reporte` sí cuenta: la elige el brigadista), auditoría, la ubicación (lat/lng y su Plus Code derivado) y los
 * campos locales de sincronización.
 */
const IGNORADOS = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "updated_by",
  "total_personas",
  "lat",
  "lng",
  "plus_code",
  "_sync",
  "_fotoLocalUrl",
]);

type Comparable = Partial<ReporteInput> & Record<string, unknown>;

/** Normaliza para comparar: undefined, null y "" son lo mismo; arrays sin orden. */
function normalizar(v: unknown): string {
  if (v === undefined || v === null || v === "") return "null";
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  return JSON.stringify(v);
}

/** Clasifica el cambio entre el reporte guardado (`previo`) y el nuevo. */
export function tipoDeCambio(
  previo: Comparable | null | undefined,
  nuevo: Comparable,
  opciones: { hayFotoNueva?: boolean } = {},
): TipoCambio {
  if (!previo) return "nuevo";

  const ubicacion =
    Math.abs(Number(previo.lat) - Number(nuevo.lat)) > TOLERANCIA_COORD ||
    Math.abs(Number(previo.lng) - Number(nuevo.lng)) > TOLERANCIA_COORD;

  const claves = new Set([...Object.keys(previo), ...Object.keys(nuevo)]);
  let formulario = Boolean(opciones.hayFotoNueva);
  for (const k of claves) {
    if (formulario) break;
    if (IGNORADOS.has(k)) continue;
    if (!(k in nuevo)) continue; // el formulario no maneja ese campo
    if (normalizar(previo[k]) !== normalizar(nuevo[k])) formulario = true;
  }

  if (ubicacion && formulario) return "ambos";
  if (ubicacion) return "ubicacion";
  if (formulario) return "formulario";
  return "sin-cambios";
}

/** Texto de confirmación para mostrar en el AlertDialog. */
export function mensajeConfirmacion(
  previo: Comparable | null | undefined,
  nuevo: Comparable,
  opciones: { hayFotoNueva?: boolean } = {},
): string {
  return MENSAJES_CONFIRMACION[tipoDeCambio(previo, nuevo, opciones)];
}
