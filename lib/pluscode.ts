/**
 * Plus Codes (Open Location Code), compatible con el formato oficial.
 * Códigos completos de 10 dígitos (≈14 m) y decodificación de 8 a 11 dígitos
 * y de códigos cortos relativos a una referencia.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlusCodeArea extends LatLng {
  /** Tamaño de la celda en grados de latitud. */
  latRes: number;
  /** Tamaño de la celda en grados de longitud. */
  lngRes: number;
}

const OLC_ALPHABET = "23456789CFGHJMPQRVWX";
const OLC_PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125] as const;
const VALID_DIGITS = /^[23456789CFGHJMPQRVWX]+$/;

/** Referencia para códigos cortos: centro de la zona de operación (Azuero). */
export const PLUS_CODE_REFERENCE: readonly [number, number] = [7.965, -80.432];

/**
 * Codifica una coordenada como Plus Code de 10 dígitos (`XXXXXXXX+XX`).
 * @returns `null` si las coordenadas no son números finitos.
 */
export function encodePlusCode(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return null;
  let lat = Math.max(-90, Math.min(90, Number(latitude)));
  if (lat === 90) lat -= 0.0000000001;
  let lng = (((Number(longitude) + 180) % 360) + 360) % 360;
  lat += 90;
  let code = "";
  for (const resolution of OLC_PAIR_RESOLUTIONS) {
    const latDigit = Math.max(0, Math.min(19, Math.floor(lat / resolution)));
    const lngDigit = Math.max(0, Math.min(19, Math.floor(lng / resolution)));
    code += OLC_ALPHABET[latDigit] + OLC_ALPHABET[lngDigit];
    lat -= latDigit * resolution;
    lng -= lngDigit * resolution;
  }
  return code.slice(0, 8) + "+" + code.slice(8, 10);
}

/**
 * Decodifica un Plus Code completo (8 a 11 dígitos, con o sin `+`).
 * @returns el centro de la celda y su tamaño, o `null` si no es válido.
 */
export function decodeFullPlusCode(rawCode: string): PlusCodeArea | null {
  let code = String(rawCode || "").toUpperCase().replace(/\s+/g, "");
  if (!code.includes("+") && /^[23456789CFGHJMPQRVWX]{10,11}$/.test(code)) {
    code = code.slice(0, 8) + "+" + code.slice(8);
  }
  if (!code.includes("+") || code.indexOf("+") !== 8 || code.lastIndexOf("+") !== 8) return null;
  const digits = code.replace("+", "");
  if (digits.length < 8 || digits.length > 11 || !VALID_DIGITS.test(digits)) return null;
  let lat = -90;
  let lng = -180;
  let latRes = 20;
  let lngRes = 20;
  const pairDigits = Math.min(10, digits.length);
  for (let i = 0; i < pairDigits; i += 2) {
    const resolution = OLC_PAIR_RESOLUTIONS[i / 2];
    const latDigit = OLC_ALPHABET.indexOf(digits[i]);
    const lngDigit = OLC_ALPHABET.indexOf(digits[i + 1]);
    if (latDigit < 0 || lngDigit < 0) return null;
    lat += latDigit * resolution;
    lng += lngDigit * resolution;
    latRes = lngRes = resolution;
  }
  // Códigos de 11 caracteres: refinamiento con la cuadrícula oficial de 5 filas × 4 columnas.
  if (digits.length > 10) {
    const v = OLC_ALPHABET.indexOf(digits[10]);
    if (v < 0) return null;
    latRes = 0.000125 / 5;
    lngRes = 0.000125 / 4;
    lat += Math.floor(v / 4) * latRes;
    lng += (v % 4) * lngRes;
  }
  return { lat: lat + latRes / 2, lng: lng + lngRes / 2, latRes, lngRes };
}

/**
 * Decodifica un Plus Code completo o corto (`XH6G+M5`). Los cortos se resuelven
 * respecto a `reference` (por defecto, `PLUS_CODE_REFERENCE`).
 * @returns el centro de la celda o `null` si el texto no es un Plus Code válido.
 */
export function decodePlusCode(
  rawCode: string,
  reference: readonly [number, number] = PLUS_CODE_REFERENCE,
): LatLng | null {
  let code = String(rawCode || "").toUpperCase().replace(/\s+/g, "");
  if (code.includes("+") && code.indexOf("+") < 8) {
    if (!/^[23456789CFGHJMPQRVWX]{2,7}\+[23456789CFGHJMPQRVWX]{2,3}$/.test(code)) return null;
    const referenceCode = encodePlusCode(reference[0], reference[1]);
    if (!referenceCode) return null;
    const prefixLength = 8 - code.indexOf("+");
    code = referenceCode.slice(0, prefixLength) + code;
    // Ajusta el candidato a la celda más cercana a la referencia.
    const area = decodeFullPlusCode(code);
    if (!area) return null;
    const resolution = Math.pow(20, 2 - prefixLength / 2);
    let lat = area.lat;
    let lng = area.lng;
    if (reference[0] + resolution / 2 < lat) lat -= resolution;
    else if (reference[0] - resolution / 2 > lat) lat += resolution;
    if (reference[1] + resolution / 2 < lng) lng -= resolution;
    else if (reference[1] - resolution / 2 > lng) lng += resolution;
    return { lat, lng };
  }
  const area = decodeFullPlusCode(code);
  return area ? { lat: area.lat, lng: area.lng } : null;
}
