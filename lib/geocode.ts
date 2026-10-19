/**
 * Búsqueda de ubicación del buscador del mapa, en este orden:
 * 1. Plus Code (completo o corto);
 * 2. comunidades locales (funciona sin conexión);
 * 3. Nominatim (OpenStreetMap) limitado a Panamá, solo con conexión.
 */
import { decodePlusCode } from "@/lib/pluscode";
import { findLocalPlace } from "@/lib/places";

export type GeocodeSource = "pluscode" | "local" | "nominatim";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Zoom sugerido para centrar el mapa. */
  zoom: number;
  source: GeocodeSource;
  /** Nombre del lugar encontrado (local o Nominatim). */
  label?: string;
}

export interface GeocodeOptions {
  /** Si hay conexión. Por defecto `navigator.onLine`. */
  online?: boolean;
  /** Implementación de fetch (inyectable en tests). */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export const GEOCODE_NO_ENCONTRADO =
  "No se encontró la ubicación. Intenta con un Plus Code o nombre de comunidad (ej: Chitré, Las Tablas, Penonomé, Pesé).";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Resuelve el texto del buscador a una coordenada.
 * @returns `null` si no se encontró (mostrar `GEOCODE_NO_ENCONTRADO`).
 */
export async function geocode(term: string, options: GeocodeOptions = {}): Promise<GeocodeResult | null> {
  const query = term.trim();
  if (!query) return null;

  const coords = decodePlusCode(query);
  if (coords) return { ...coords, zoom: 17, source: "pluscode" };

  const local = findLocalPlace(query);
  if (local) return { lat: local.lat, lng: local.lng, zoom: 15, source: "local", label: local.name };

  const online = options.online ?? (typeof navigator !== "undefined" ? navigator.onLine : false);
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!online || !fetchImpl) return null;

  try {
    const url = `${NOMINATIM_URL}?format=json&countrycodes=pa&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetchImpl(url, {
      signal: options.signal,
      headers: { Accept: "application/json", "Accept-Language": "es" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng, zoom: 15, source: "nominatim", label: data[0].display_name };
      }
    }
  } catch {
    // Sin red o respuesta inválida: se trata como "no encontrado".
  }
  return null;
}
