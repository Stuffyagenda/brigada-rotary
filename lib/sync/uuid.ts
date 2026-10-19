/**
 * UUID v4. `crypto.randomUUID()` solo existe en contextos seguros (https o
 * localhost); al probar desde un celular por http://192.168.x.x no está, así que
 * se genera con `crypto.getRandomValues`, que sí está disponible.
 */
export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Ruta en Storage para una foto nueva de un reporte. */
export function rutaFotoNueva(reporteId: string): string {
  return `${reporteId}/${uuid()}.jpg`;
}
