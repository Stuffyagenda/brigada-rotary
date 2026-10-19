/**
 * Geometría del pin "vencido" (rombo). Función pura, sin Leaflet, para poder
 * probarla sin navegador.
 */

/** Trazo SVG de un rombo centrado en (x, y) con semidiagonal `r` (px). */
export function caminoRombo(x: number, y: number, r: number): string {
  const rr = Math.max(Math.round(r), 1);
  const cx = Math.round(x);
  const cy = Math.round(y);
  return `M${cx},${cy - rr}L${cx + rr},${cy}L${cx},${cy + rr}L${cx - rr},${cy}Z`;
}
