/**
 * Reglas de negocio del formulario de reportes: visibilidad de secciones y
 * normalización de los datos antes de guardar.
 */
import {
  INSUMOS,
  type Estado,
  type ReporteInput,
} from "@/lib/types";
import { esFechaValida, fechaPanama, instanteEnFechaPanama } from "@/lib/vigencia";

/** Casillas del formulario que no se guardan como columna. */
export interface CasillasFormulario {
  /** "¿Se realizó alguna entrega en esta visita?" (visible en PENDIENTE). */
  chkEntrega: boolean;
  /** "¿La familia tiene alguna necesidad pendiente?" (visible en ATENDIDO). */
  chkNecesidad: boolean;
}

/** Qué partes del formulario se muestran. */
export interface SeccionesVisibles {
  necesidades: boolean;
  entregas: boolean;
  /** Mostrar la casilla "¿Se realizó alguna entrega…?". */
  casillaEntrega: boolean;
  /** Mostrar la casilla "¿La familia tiene alguna necesidad pendiente?". */
  casillaNecesidad: boolean;
}

/** Las necesidades cuentan si el caso está PENDIENTE o si se marcó la casilla. */
export function necesidadesActivas(estado: Estado, chkNecesidad: boolean): boolean {
  return estado === "PENDIENTE" || chkNecesidad;
}

/** Las entregas cuentan si el caso está ATENDIDO o si se marcó la casilla. */
export function entregasActivas(estado: Estado, chkEntrega: boolean): boolean {
  return estado === "ATENDIDO" || chkEntrega;
}

/** Las condiciones médicas solo aplican con al menos un caso médico. */
export function condicionesMedicasActivas(casosMedicos: number): boolean {
  return (Number(casosMedicos) || 0) >= 1;
}

/**
 * Secciones visibles según el estado y las casillas.
 * - PENDIENTE: necesidades siempre; entregas solo con la casilla de entrega.
 * - ATENDIDO: entregas siempre; necesidades solo con la casilla de necesidad.
 */
export function seccionesVisibles(
  estado: Estado,
  chkEntrega: boolean,
  chkNecesidad: boolean,
): SeccionesVisibles {
  return {
    necesidades: necesidadesActivas(estado, chkNecesidad),
    entregas: entregasActivas(estado, chkEntrega),
    casillaEntrega: estado === "PENDIENTE",
    casillaNecesidad: estado === "ATENDIDO",
  };
}

/**
 * Instante de atención al guardar (`attended_at`), a partir de la fecha que
 * eligió el brigadista y no de la hora en que se guarda:
 * - PENDIENTE: `null`.
 * - Con `fechaAtencion` (`YYYY-MM-DD`, Panamá): si coincide con el día de
 *   `attendedAtPrevio`, se conserva ese instante; si no, esa fecha con la hora
 *   actual de Panamá (`instanteEnFechaPanama`).
 * - Sin `fechaAtencion` (o no válida): se conserva `attendedAtPrevio`.
 */
export function calcularAttendedAt(
  estado: Estado,
  attendedAtPrevio: string | null | undefined,
  fechaAtencion?: string | null,
  ahora: Date = new Date(),
): string | null {
  if (estado === "PENDIENTE") return null;
  if (!fechaAtencion || !esFechaValida(fechaAtencion)) return attendedAtPrevio ?? null;
  if (attendedAtPrevio && Number.isFinite(Date.parse(attendedAtPrevio)) && fechaPanama(attendedAtPrevio) === fechaAtencion) {
    return attendedAtPrevio;
  }
  return instanteEnFechaPanama(fechaAtencion, ahora);
}

type ConInsumos = Pick<
  ReporteInput,
  | "nec_agua" | "nec_kit_alimento" | "nec_kit_higiene" | "nec_lona" | "nec_camping" | "nec_toldas"
  | "nec_colchonetas" | "nec_otros" | "ent_agua" | "ent_kit_alimento" | "ent_kit_higiene" | "ent_lona"
  | "ent_camping" | "ent_toldas" | "ent_colchonetas" | "ent_otros"
>;

/** ¿Tiene alguna necesidad marcada (incluidos otros insumos)? */
export function tieneNecesidades(r: ConInsumos): boolean {
  return INSUMOS.some((i) => r[i.necColumna]) || (r.nec_otros?.length ?? 0) > 0;
}

/** ¿Tiene alguna entrega marcada (incluidos otros insumos)? */
export function tieneEntregas(r: ConInsumos): boolean {
  return INSUMOS.some((i) => r[i.entColumna]) || (r.ent_otros?.length ?? 0) > 0;
}

/** Estado inicial de las casillas al abrir un reporte existente en el formulario. */
export function casillasIniciales(r: ConInsumos): CasillasFormulario {
  return { chkEntrega: tieneEntregas(r), chkNecesidad: tieneNecesidades(r) };
}

function textoONull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Aplica las reglas de guardado al reporte del formulario:
 * - `attended_at` según el estado y `fechaAtencion` (ver `calcularAttendedAt`);
 * - necesidades en NO / vacías si no están activas;
 * - entregas y observaciones vacías si no están activas;
 * - condiciones médicas vacías si `casos_medicos` < 1;
 * - textos recortados (vacío → null).
 */
export function aplicarReglasGuardado(
  input: ReporteInput,
  casillas: CasillasFormulario,
  ahora: Date = new Date(),
  fechaAtencion?: string | null,
): ReporteInput {
  const nec = necesidadesActivas(input.estado, casillas.chkNecesidad);
  const ent = entregasActivas(input.estado, casillas.chkEntrega);
  const out: ReporteInput = {
    ...input,
    attended_at: calcularAttendedAt(input.estado, input.attended_at, fechaAtencion, ahora),
    brigadista_texto: textoONull(input.brigadista_texto),
    contacto_nombre: textoONull(input.contacto_nombre),
    contacto_telefono: textoONull(input.contacto_telefono),
    condiciones_medicas: condicionesMedicasActivas(input.casos_medicos)
      ? [...input.condiciones_medicas]
      : [],
    nec_otros: nec ? [...input.nec_otros] : [],
    ent_otros: ent ? [...input.ent_otros] : [],
    observaciones_atencion: ent ? textoONull(input.observaciones_atencion) : null,
  };
  for (const i of INSUMOS) {
    out[i.necColumna] = nec && Boolean(input[i.necColumna]);
    out[i.entColumna] = ent && Boolean(input[i.entColumna]);
  }
  return out;
}
