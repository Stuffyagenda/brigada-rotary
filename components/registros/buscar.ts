/**
 * Búsqueda de /registros: contacto, teléfono, brigadista, estado y Plus Code
 * (FiltrosReporte.texto; el Plus Code calculado si no hay guardado) y, además,
 * el id del reporte. Solo local: nunca sale del celular.
 */
import { filtrarReportes } from "@/hooks/useReportes";
import type { ReporteLocal } from "@/lib/db";

export function buscarRegistros<R extends ReporteLocal>(reportes: readonly R[], consulta: string): R[] {
  const q = consulta.trim();
  if (!q) return [...reportes];
  const porTexto = new Set(filtrarReportes(reportes, { texto: q }).map((r) => r.id));
  // El teléfono también se encuentra escrito sin guion ni espacios.
  const digitos = q.replace(/\D/g, "");
  const qId = q.toLowerCase();
  return reportes.filter(
    (r) =>
      porTexto.has(r.id) ||
      r.id.toLowerCase().includes(qId) ||
      (digitos.length >= 3 && (r.contacto_telefono ?? "").replace(/\D/g, "").includes(digitos)),
  );
}
