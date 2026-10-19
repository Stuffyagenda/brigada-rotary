/**
 * Fechas en hora de Panamá y vigencia de la atención de un reporte.
 *
 * Todas las fechas "de calendario" de la app (fecha del reporte, fecha de una
 * visita, días desde la última atención) se cuentan en America/Panama, sin
 * importar la zona horaria del celular. Las fechas se representan como texto
 * `YYYY-MM-DD` (igual que las columnas `date` de Postgres).
 *
 * Vigencia de un reporte (desde la última atención, `attended_at`):
 * - `pendiente`: estado PENDIENTE.
 * - `reciente`: ATENDIDO hace 0 a 3 días.
 * - `por-vencer`: ATENDIDO hace 4 a 6 días (naranja, `--color-aging`).
 * - `vencido`: ATENDIDO hace 7 días o más (negro, `--color-stale`): necesita nueva visita.
 *
 * Este módulo no importa valores de `lib/types.ts` (solo tipos), así que
 * `lib/types.ts` puede usarlo sin dependencias circulares.
 */
import type { Reporte, Vigencia } from "@/lib/types";

/** Zona horaria de referencia de la app. */
export const ZONA_PANAMA = "America/Panama";

/**
 * Desfase de Panamá respecto a UTC (−05:00, sin horario de verano desde 1908).
 * Solo se usa para componer un instante a partir de una fecha y una hora de Panamá.
 */
const DESFASE_PANAMA_MS = -5 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Días desde la atención a partir de los cuales el reporte está "por vencer". */
export const DIAS_POR_VENCER = 4;
/** Días desde la atención a partir de los cuales el reporte está "vencido". */
export const DIAS_VENCIDO = 7;

let formateador: Intl.DateTimeFormat | null = null;

function partesPanama(fecha: Date): string {
  formateador ??= new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_PANAMA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = formateador.formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

/** `true` si `fecha` tiene la forma `YYYY-MM-DD` y es una fecha real. */
export function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const t = Date.parse(`${fecha}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === fecha;
}

/** Fecha de hoy en Panamá (`YYYY-MM-DD`). */
export function hoyPanama(ahora: Date = new Date()): string {
  return partesPanama(ahora);
}

/**
 * Fecha de calendario en Panamá (`YYYY-MM-DD`) de un instante ISO 8601
 * (p. ej. `created_at` o `attended_at`).
 * @throws RangeError si `iso` no es una fecha válida.
 */
export function fechaPanama(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) throw new RangeError(`Fecha no válida: ${String(iso)}`);
  return partesPanama(d);
}

/** Días de calendario de `desde` a `hasta` (ambas `YYYY-MM-DD`); negativo si `hasta` es anterior. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

/** `true` si la fecha (`YYYY-MM-DD`) es posterior a hoy en Panamá. */
export function esFechaFutura(fecha: string, ahora: Date = new Date()): boolean {
  return fecha > hoyPanama(ahora);
}

/**
 * Instante (ISO 8601, UTC) para una fecha de Panamá con la hora actual de Panamá.
 * Si `fecha` es hoy, devuelve exactamente `ahora`. Se usa para `visitado_at` y
 * para el `attended_at` del reporte al registrar una visita con fecha pasada.
 */
export function instanteEnFechaPanama(fecha: string, ahora: Date = new Date()): string {
  if (fecha === hoyPanama(ahora)) return ahora.toISOString();
  const msDelDia = (((ahora.getTime() + DESFASE_PANAMA_MS) % DIA_MS) + DIA_MS) % DIA_MS;
  const medianocheUtc = Date.parse(`${fecha}T00:00:00Z`);
  return new Date(medianocheUtc + msDelDia - DESFASE_PANAMA_MS).toISOString();
}

/**
 * Días de calendario (Panamá) desde la última atención (`attended_at`) hasta hoy.
 * `null` si el reporte no está ATENDIDO o no tiene fecha de atención. Nunca
 * negativo (un `attended_at` "en el futuro" por el reloj de un celular cuenta como hoy).
 */
export function diasDesdeAtencion(
  r: Pick<Reporte, "estado" | "attended_at">,
  ahora: Date = new Date(),
): number | null {
  if (r.estado !== "ATENDIDO" || !r.attended_at) return null;
  const t = Date.parse(r.attended_at);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, diasEntre(fechaPanama(new Date(t)), hoyPanama(ahora)));
}

/**
 * Vigencia de la atención de un reporte.
 * PENDIENTE → `pendiente`; ATENDIDO: 0–3 días `reciente`, 4–6 `por-vencer`, ≥ 7 `vencido`.
 * Un ATENDIDO sin `attended_at` válido (no debería ocurrir: lo impide el check
 * del SQL) cuenta como `vencido`, para que no pase por atendido recientemente.
 */
export function vigencia(r: Pick<Reporte, "estado" | "attended_at">, ahora: Date = new Date()): Vigencia {
  if (r.estado !== "ATENDIDO") return "pendiente";
  const dias = diasDesdeAtencion(r, ahora);
  if (dias === null || dias >= DIAS_VENCIDO) return "vencido";
  if (dias >= DIAS_POR_VENCER) return "por-vencer";
  return "reciente";
}

/** Vigencias en orden de presentación (chips de filtro, leyenda). */
export const VIGENCIAS = ["pendiente", "reciente", "por-vencer", "vencido"] as const satisfies readonly Vigencia[];

/** Etiqueta corta de cada vigencia (chips de filtro: "Pendientes 12"). */
export const VIGENCIA_LABEL: Record<Vigencia, string> = {
  pendiente: "Pendientes",
  reciente: "Atendidos",
  "por-vencer": "4+ días",
  vencido: "7+ días",
};

/** Descripción completa de cada vigencia (leyenda, lectores de pantalla). */
export const VIGENCIA_DESCRIPCION: Record<Vigencia, string> = {
  pendiente: "Pendiente de atención",
  reciente: "Atendido hace 3 días o menos",
  "por-vencer": "Atendido hace 4 a 6 días",
  vencido: "Atendido hace 7 días o más: necesita nueva visita",
};

/** "Atendido hoy", "Atendido ayer" o "Atendido hace N días". */
export function textoAtendidoHace(dias: number): string {
  if (dias <= 0) return "Atendido hoy";
  if (dias === 1) return "Atendido ayer";
  return `Atendido hace ${dias} días`;
}

let formateadorLargo: Intl.DateTimeFormat | null = null;

/**
 * Fecha `YYYY-MM-DD` en texto largo es-PA: "18 de octubre de 2026".
 * (Se formatea en UTC para que la zona del celular no cambie el día.)
 */
export function formatearFechaLarga(fecha: string): string {
  if (!esFechaValida(fecha)) return fecha;
  formateadorLargo ??= new Intl.DateTimeFormat("es-PA", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return formateadorLargo.format(new Date(`${fecha}T12:00:00Z`));
}
