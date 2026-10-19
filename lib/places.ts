/**
 * Comunidades de la zona de operación con coordenadas conocidas, para buscar
 * sin conexión. Nombres en mayúsculas y sin tildes.
 */
export const LOCAL_PANAMA_PLACES: Readonly<Record<string, readonly [number, number]>> = {
  // Herrera
  CHITRE: [7.9625, -80.4286],
  "LA ARENA": [7.9714, -80.4571],
  MONAGRILLO: [7.9856, -80.4189],
  "LLANO BONITO": [7.9442, -80.4411],
  PARITA: [8.0028, -80.5206],
  PESE: [7.8967, -80.6189],
  OCU: [7.9347, -80.7761],
  "LOS POZOS": [7.8183, -80.6656],
  "SANTA MARIA": [8.1158, -80.6681],
  "LAS MINAS": [7.7972, -80.7519],
  // Los Santos
  "LAS TABLAS": [7.7667, -80.2833],
  "LOS SANTOS": [7.9333, -80.4167],
  GUARARE: [7.8167, -80.2833],
  PEDASI: [7.5333, -80.0333],
  "PLAYA VENAO": [7.4289, -80.1981],
  TONOSI: [7.35, -80.4333],
  MACARACAS: [7.7333, -80.5333],
  POCHETI: [7.7011, -80.489],
  // Veraguas
  SANTIAGO: [8.1, -80.9833],
  ATALAYA: [8.05, -80.9333],
  CANAZAS: [8.3167, -81.2167],
  "SAN FRANCISCO": [8.25, -80.9667],
  "SANTA FE": [8.5167, -81.0833],
  MONTIJO: [7.9833, -81.05],
  SONA: [8.0167, -81.3167],
  "RIO DE JESUS": [7.9833, -81.1667],
  CALOBRE: [8.3167, -80.8667],
  "LA MESA": [8.15, -81.1833],
  MARIATO: [7.6333, -81.0333],
  // Coclé
  PENONOME: [8.5167, -80.35],
  AGUADULCE: [8.25, -80.55],
  ANTON: [8.4, -80.2667],
  "EL VALLE": [8.6, -80.1333],
  NATA: [8.3333, -80.5167],
  OLA: [8.4167, -80.65],
  "RIO HATO": [8.3833, -80.1667],
};

/** Mayúsculas sin tildes ni espacios extremos, para comparar con `LOCAL_PANAMA_PLACES`. */
export function normalizePlaceName(term: string): string {
  return term
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Busca una comunidad local. Coincide si el nombre contiene el término o el
 * término contiene el nombre (p. ej. "chitré" o "barrio de Chitré").
 */
export function findLocalPlace(term: string): { name: string; lat: number; lng: number } | null {
  const upper = normalizePlaceName(term);
  if (!upper) return null;
  for (const [name, [lat, lng]] of Object.entries(LOCAL_PANAMA_PLACES)) {
    if (name.includes(upper) || upper.includes(name)) return { name, lat, lng };
  }
  return null;
}
