/**
 * Valores del formulario de visita y su conversión al input de `saveVisita`.
 * Funciones puras (sin React) para poder probarlas por separado.
 */
import { z } from "zod";
import { INSUMOS, visitaSchema, visitaVacia, type EntregaColumna, type VisitaInput } from "@/lib/types";
import { instanteEnFechaPanama } from "@/lib/vigencia";

/** Lo que maneja react-hook-form. Los textos usan "" en lugar de null. */
export type VisitaValues = Record<EntregaColumna, boolean> & {
  fecha: string;
  brigadista_texto: string;
  ent_otros: string[];
  observaciones: string;
};

/** Valores iniciales: fecha de hoy (Panamá), sin entregas ni observaciones. */
export function valoresInicialesVisita(brigadista?: string | null, ahora?: Date): VisitaValues {
  const v = visitaVacia("", { brigadista, ahora });
  const entregas = Object.fromEntries(INSUMOS.map((i) => [i.entColumna, v[i.entColumna]])) as Record<
    EntregaColumna,
    boolean
  >;
  return {
    ...entregas,
    fecha: v.fecha,
    brigadista_texto: v.brigadista_texto ?? "",
    ent_otros: [],
    observaciones: "",
  };
}

function textoONull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/** Input de `saveVisita` (sin `id`: lo genera `saveVisita`). */
export function construirVisita(reporteId: string, valores: VisitaValues): VisitaInput {
  const out: VisitaInput = {
    ...visitaVacia(reporteId),
    fecha: valores.fecha,
    brigadista_texto: textoONull(valores.brigadista_texto),
    ent_otros: [...valores.ent_otros],
    observaciones: textoONull(valores.observaciones),
  };
  for (const i of INSUMOS) out[i.entColumna] = Boolean(valores[i.entColumna]);
  return out;
}

/** `true` si no hay ninguna entrega ni observación (la visita no se puede guardar). */
export function esVisitaVacia(
  v: Pick<VisitaValues, EntregaColumna | "ent_otros"> & { observaciones?: string | null },
): boolean {
  return !INSUMOS.some((i) => v[i.entColumna]) && v.ent_otros.length === 0 && (v.observaciones ?? "").trim() === "";
}

/** Límites propios del formulario, además de `visitaSchema`. */
const extrasSchema = z.object({
  brigadista_texto: z.string().max(120, "El nombre es demasiado largo (máximo 120 letras).").nullish(),
  observaciones: z.string().max(1000, "Las observaciones son demasiado largas (máximo 1000 letras).").nullish(),
});

/**
 * Errores por campo (primer mensaje de cada uno). Vacío si la visita es válida.
 * La visita vacía llega en la clave `entregas` con `MSG_VISITA_VACIA`.
 */
export function validarVisita(input: VisitaInput): Record<string, string> {
  const errores: Record<string, string> = {};
  const add = (issues: z.ZodError["issues"]) => {
    for (const issue of issues) {
      const campo = String(issue.path[0] ?? "formulario");
      if (errores[campo]) continue;
      const propio = issue.message && !/^(Invalid|Expected|Too)/i.test(issue.message);
      errores[campo] = propio ? issue.message : campo === "fecha" ? "Escribe una fecha válida." : "Revisa este dato.";
    }
  };
  const base = visitaSchema.safeParse(input);
  if (!base.success) add(base.error.issues);
  const extras = extrasSchema.safeParse(input);
  if (!extras.success) add(extras.error.issues);
  return errores;
}

/**
 * `true` si la visita queda antes de la última atención del reporte: entra al
 * historial pero no cambia la ficha (misma regla que `saveVisita`).
 */
export function esAnteriorALaAtencion(
  fecha: string,
  attendedAt: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!attendedAt) return false;
  const tAtencion = Date.parse(attendedAt);
  if (!Number.isFinite(tAtencion)) return false;
  return Date.parse(instanteEnFechaPanama(fecha, ahora)) < tAtencion;
}
