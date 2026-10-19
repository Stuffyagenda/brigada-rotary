/**
 * Valores del formulario de reportes y su conversión al payload de `saveReport`.
 * Funciones puras (sin React) para poder probarlas por separado.
 */
import type { ReporteLocal } from "@/lib/db";
import { encodePlusCode, type LatLng } from "@/lib/pluscode";
import { aplicarReglasGuardado, casillasIniciales, type CasillasFormulario } from "@/lib/report-rules";
import { reporteSchema, reporteVacio, type ReporteInput } from "@/lib/types";
import { z } from "zod";

/** Lo que maneja react-hook-form: el reporte sin ubicación más las casillas que no se guardan. */
export type FormValues = Omit<ReporteInput, "lat" | "lng" | "plus_code"> &
  CasillasFormulario & {
    brigadista_texto: string;
    contacto_nombre: string;
    contacto_telefono: string;
    observaciones_atencion: string;
  };

/** Campos de texto: el formulario usa "" en lugar de null (inputs controlados por el DOM). */
const TEXTOS = ["brigadista_texto", "contacto_nombre", "contacto_telefono", "observaciones_atencion"] as const;

/** Claves del reporte que maneja el formulario (las de `reporteVacio` más id/fechas/club). */
const CLAVES_INPUT = [
  ...Object.keys(reporteVacio(0, 0)),
  "id",
  "created_at",
  "club_id",
] as const;

/** Extrae de un reporte local solo los campos de `ReporteInput` (sin `_sync`, auditoría, etc.). */
export function aInput(r: ReporteLocal): ReporteInput {
  const out: Record<string, unknown> = {};
  for (const k of CLAVES_INPUT) {
    if (k in r) out[k] = (r as unknown as Record<string, unknown>)[k];
  }
  return {
    ...reporteVacio(r.lat, r.lng),
    ...(out as Partial<ReporteInput>),
    condiciones_medicas: [...(r.condiciones_medicas ?? [])],
    nec_otros: [...(r.nec_otros ?? [])],
    ent_otros: [...(r.ent_otros ?? [])],
  };
}

export interface ValoresInicialesOpciones {
  /** Nombre del perfil, usado como brigadista en reportes nuevos. */
  brigadista?: string | null;
  /** Club del perfil, usado en reportes nuevos. */
  clubId?: string | null;
}

/** Valores iniciales: los del reporte a editar o los de un reporte vacío. */
export function valoresIniciales(
  reporte: ReporteLocal | null | undefined,
  opciones: ValoresInicialesOpciones = {},
): FormValues {
  const base: ReporteInput = reporte
    ? aInput(reporte)
    : { ...reporteVacio(0, 0), brigadista_texto: opciones.brigadista ?? null, club_id: opciones.clubId ?? null };
  const casillas: CasillasFormulario = reporte
    ? casillasIniciales(base)
    : { chkEntrega: false, chkNecesidad: false };
  const { lat, lng, plus_code, ...resto } = base;
  void lat;
  void lng;
  void plus_code;
  const valores = { ...resto, ...casillas } as FormValues;
  for (const k of TEXTOS) valores[k] = base[k] ?? "";
  return valores;
}

/**
 * Convierte los valores del formulario en el payload de `saveReport`:
 * añade la ubicación y su Plus Code y aplica las reglas de guardado
 * (attended_at, secciones inactivas vacías, condiciones médicas, textos).
 */
export function construirPayload(valores: FormValues, ubicacion: LatLng, ahora: Date = new Date()): ReporteInput {
  const { chkEntrega, chkNecesidad, ...resto } = valores;
  const input: ReporteInput = {
    ...resto,
    lat: ubicacion.lat,
    lng: ubicacion.lng,
    plus_code: encodePlusCode(ubicacion.lat, ubicacion.lng),
  };
  return aplicarReglasGuardado(input, { chkEntrega, chkNecesidad }, ahora);
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

/** Comprobaciones propias del formulario, además de los `check` del SQL (`reporteSchema`). */
const extrasSchema = z.object({
  contacto_telefono: z
    .string()
    .regex(/^[\d\s+\-()./]*$/, "Escribe el teléfono solo con números, espacios, guiones o +.")
    .max(40, "El teléfono es demasiado largo.")
    .nullish(),
  contacto_nombre: z.string().max(120, "El nombre es demasiado largo (máximo 120 letras).").nullish(),
  brigadista_texto: z.string().max(120, "El nombre es demasiado largo (máximo 120 letras).").nullish(),
  observaciones_atencion: z.string().max(1000, "Las observaciones son demasiado largas (máximo 1000 letras).").nullish(),
});

/** Mensajes en español para errores de `reporteSchema` sin mensaje propio. */
const MENSAJE_GENERICO: Record<string, string> = {
  lat: "La ubicación no es válida. Elige otra en el mapa.",
  lng: "La ubicación no es válida. Elige otra en el mapa.",
  estado: "Elige el estado del caso.",
  prioridad: "Elige la prioridad.",
  danio_vivienda: "Elige el daño de la vivienda.",
};

/** Errores por campo (primer mensaje de cada uno). Vacío si el payload es válido. */
export function validarPayload(payload: ReporteInput): Record<string, string> {
  const errores: Record<string, string> = {};
  const add = (issues: z.ZodError["issues"]) => {
    for (const issue of issues) {
      const campo = String(issue.path[0] ?? "formulario");
      if (errores[campo]) continue;
      const propio = issue.message && !/^(Invalid|Expected|Too)/i.test(issue.message);
      errores[campo] = propio ? issue.message : (MENSAJE_GENERICO[campo] ?? "Revisa este dato.");
    }
  };
  const base = reporteSchema.safeParse(payload);
  if (!base.success) add(base.error.issues);
  const extras = extrasSchema.safeParse(payload);
  if (!extras.success) add(extras.error.issues);
  return errores;
}
