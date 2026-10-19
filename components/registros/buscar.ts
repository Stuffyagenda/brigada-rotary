/**
 * Búsqueda de /registros: contacto, teléfono, brigadista, estado y Plus Code
 * (FiltrosReporte.texto; el Plus Code calculado si no hay guardado), el id del
 * reporte, la vigencia ("Pendiente", "Atendido hace 5 días", "4+ días",
 * "Necesita nueva visita", "revisitar") y la fecha del reporte en texto
 * ("18 de octubre de 2026"). Solo local: nunca sale del celular.
 */
import { filtrarReportes } from "@/hooks/useReportes";
import type { ReporteLocal } from "@/lib/db";
import { normalizePlaceName } from "@/lib/places";
import type { Vigencia } from "@/lib/types";
import {
  diasDesdeAtencion,
  formatearFechaLarga,
  textoAtendidoHace,
  vigencia as vigenciaDe,
  VIGENCIA_DESCRIPCION,
  VIGENCIA_LABEL,
} from "@/lib/vigencia";

/** Texto visible de la vigencia en una fila: "Pendiente" o "Atendido hace N días". */
export function textoVigencia(r: Pick<ReporteLocal, "estado" | "attended_at">, ahora: Date = new Date()): string {
  const dias = diasDesdeAtencion(r, ahora);
  return dias === null ? (r.estado === "PENDIENTE" ? "Pendiente" : "Atendido") : textoAtendidoHace(dias);
}

/**
 * Textos con los que se encuentra un reporte por su vigencia y su fecha. La
 * fecha solo se busca si la consulta tiene letras ("octubre", "18 de oct"):
 * así unos pocos dígitos siguen buscando solo en teléfonos e ids.
 */
function textosVigencia(r: ReporteLocal, v: Vigencia, ahora: Date, conFecha: boolean): string[] {
  const textos = [VIGENCIA_LABEL[v], VIGENCIA_DESCRIPCION[v], textoVigencia(r, ahora)];
  if (v === "vencido") textos.push("Necesita nueva visita", "Revisitar");
  if (conFecha && r.fecha_reporte) textos.push(formatearFechaLarga(r.fecha_reporte));
  return textos;
}

export function buscarRegistros<R extends ReporteLocal>(
  reportes: readonly R[],
  consulta: string,
  ahora: Date = new Date(),
): R[] {
  const q = consulta.trim();
  if (!q) return [...reportes];
  const porTexto = new Set(filtrarReportes(reportes, { texto: q }, ahora).map((r) => r.id));
  const qNorm = normalizePlaceName(q);
  const conFecha = /\p{L}/u.test(q);
  // El teléfono también se encuentra escrito sin guion ni espacios.
  const digitos = q.replace(/\D/g, "");
  const qId = q.toLowerCase();
  return reportes.filter(
    (r) =>
      porTexto.has(r.id) ||
      r.id.toLowerCase().includes(qId) ||
      (digitos.length >= 3 && (r.contacto_telefono ?? "").replace(/\D/g, "").includes(digitos)) ||
      textosVigencia(r, vigenciaDe(r, ahora), ahora, conFecha).some((t) => normalizePlaceName(t).includes(qNorm)),
  );
}
