/**
 * Formato de los datos de un reporte para la ficha y la lista de registros.
 * Funciones puras (sin React), probadas en format.test.ts.
 */
import type { ReporteLocal } from "@/lib/db";
import { encodePlusCode } from "@/lib/pluscode";
import { INSUMOS } from "@/lib/types";

// ---------------------------------------------------------------------------
// Teléfono
// ---------------------------------------------------------------------------

/** Dígitos locales del teléfono (sin el prefijo 507 de Panamá). `null` si no hay dígitos. */
export function digitosTelefono(telefono: string | null | undefined): string | null {
  let d = String(telefono ?? "").replace(/\D/g, "");
  if (d.startsWith("00507")) d = d.slice(5);
  else if (d.startsWith("507") && d.length > 8) d = d.slice(3);
  return d.length > 0 ? d : null;
}

/** `69680515` → `6968-0515`; `9961234` → `996-1234`. Otros largos, sin cambios. */
export function formatoTelefono(telefono: string | null | undefined): string | null {
  const d = digitosTelefono(telefono);
  if (!d) return null;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  if (d.length === 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return String(telefono).trim();
}

export function enlaceTel(telefono: string | null | undefined): string | null {
  const d = digitosTelefono(telefono);
  return d ? `tel:+507${d}` : null;
}

export function enlaceWhatsApp(telefono: string | null | undefined): string | null {
  const d = digitosTelefono(telefono);
  return d ? `https://wa.me/507${d}` : null;
}

// ---------------------------------------------------------------------------
// Ubicación
// ---------------------------------------------------------------------------

export function plusCodeDe(r: Pick<ReporteLocal, "plus_code" | "lat" | "lng">): string | null {
  return r.plus_code?.trim() || encodePlusCode(r.lat, r.lng);
}

/** Ruta en Google Maps hasta el punto. */
export function enlaceComoLlegar(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Solo enlaces http(s) (la foto heredada viene de una URL externa). */
export function urlSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const UNIDADES: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

const rtf = new Intl.RelativeTimeFormat("es-PA", { numeric: "auto" });

/** "hace 5 minutos", "ayer", "hace 3 semanas". Menos de un minuto: "hace un momento". */
export function haceCuanto(iso: string | null | undefined, ahora: Date = new Date()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const segundos = Math.round((t - ahora.getTime()) / 1000);
  const abs = Math.abs(segundos);
  if (abs < 60) return "hace un momento";
  for (const [unidad, s] of UNIDADES) {
    if (abs >= s) return rtf.format(Math.round(segundos / s), unidad);
  }
  return rtf.format(Math.round(segundos / 60), "minute");
}

/** Fecha y hora completas para `title`/`dateTime`. */
export function fechaLarga(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleString("es-PA", { dateStyle: "long", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// Personas, mascotas e insumos
// ---------------------------------------------------------------------------

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function textoPersonas(n: number): string {
  return plural(n, "persona", "personas");
}

export interface LineaDesglose {
  clave: string;
  texto: string;
}

/** Desglose de personas (solo las categorías con al menos una). */
export function desglosePersonas(r: ReporteLocal): LineaDesglose[] {
  const out: LineaDesglose[] = [];
  if (r.adultos > 0) out.push({ clave: "adultos", texto: plural(r.adultos, "adulto", "adultos") });
  if (r.adultos_mayores > 0)
    out.push({ clave: "mayores", texto: plural(r.adultos_mayores, "adulto mayor", "adultos mayores") });
  if (r.menores > 0) out.push({ clave: "menores", texto: plural(r.menores, "menor", "menores") });
  if (r.discapacitados > 0)
    out.push({
      clave: "discapacidad",
      texto: `${plural(r.discapacitados, "persona", "personas")} con discapacidad`,
    });
  if (r.casos_medicos > 0) {
    const condiciones = (r.condiciones_medicas ?? []).filter(Boolean);
    const base = plural(r.casos_medicos, "caso médico", "casos médicos");
    out.push({ clave: "medicos", texto: condiciones.length ? `${base}: ${condiciones.join(", ")}` : base });
  }
  return out;
}

export function textoMascotas(r: Pick<ReporteLocal, "perros" | "gatos">): string | null {
  const partes: string[] = [];
  if (r.perros > 0) partes.push(plural(r.perros, "perro", "perros"));
  if (r.gatos > 0) partes.push(plural(r.gatos, "gato", "gatos"));
  return partes.length ? partes.join(" y ") : null;
}

function capitalizar(s: string): string {
  return s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
}

/** Necesidades marcadas: insumos (`nec_*`) y otros, con mayúscula inicial. */
export function listaNecesidades(r: ReporteLocal): string[] {
  return [
    ...INSUMOS.filter((i) => r[i.necColumna]).map((i) => capitalizar(i.corto)),
    ...(r.nec_otros ?? []).filter(Boolean),
  ];
}

/** Entregas registradas: insumos (`ent_*`) y otros, con mayúscula inicial. */
export function listaEntregas(r: ReporteLocal): string[] {
  return [
    ...INSUMOS.filter((i) => r[i.entColumna]).map((i) => capitalizar(i.corto)),
    ...(r.ent_otros ?? []).filter(Boolean),
  ];
}

/** Título de un reporte: nombre del contacto o "Registro <8 primeros del id>". */
export function tituloReporte(r: Pick<ReporteLocal, "contacto_nombre" | "id">): string {
  return r.contacto_nombre?.trim() || `Registro ${r.id.slice(0, 8)}`;
}
