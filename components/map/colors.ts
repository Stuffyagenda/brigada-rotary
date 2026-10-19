/**
 * Colores de los tokens (app/globals.css) para las capas SVG de Leaflet, que
 * reciben los colores como atributos y no pueden leer variables CSS.
 * Mantener sincronizados con `@theme` en app/globals.css.
 */
export const COLOR = {
  ink: "#1c2733",
  white: "#ffffff",
  rotary: "#17458f",
  gold: "#f7a81b",
  pending: "#c4122f",
  done: "#0e7c47",
  aging: "#b45309",
  stale: "#000000",
} as const;
