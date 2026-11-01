/**
 * Novedades de cada versión, en lenguaje para los brigadistas (no técnico).
 * Las muestra `AvisoNovedades` una vez por celular tras actualizar, y el menú
 * de cuenta ("Novedades") en cualquier momento.
 *
 * Al publicar una versión: subir `version` en `package.json` y añadir aquí su
 * entrada al principio. Una versión sin entrada no abre el aviso.
 */
import { db } from "@/lib/db";

export interface Novedades {
  /** Igual que `version` de `package.json` (p. ej. "1.1.0"). */
  version: string;
  /** Fecha de publicación, `YYYY-MM-DD`. */
  fecha: string;
  cambios: string[];
}

/** De la más reciente a la más antigua. */
export const NOVEDADES: readonly Novedades[] = [
  {
    version: "1.1.0",
    fecha: "2026-11-01",
    cambios: [
      "La atención de una familia ahora dura 15 días. El reporte se ve en verde y, desde el día 15, pasa a un rombo verde oscuro que indica que necesita una nueva visita. Ya no hay avisos a los 4 y 7 días.",
      "Los días se cuentan desde la fecha de la visita que eliges, no desde el momento en que guardas el reporte.",
      "La fecha del reporte y la fecha de la visita ahora se eligen siempre: el campo aparece vacío para que pongas el día correcto.",
      "Al marcar como atendido un reporte pendiente, la app te pide la fecha de atención.",
      "Si corriges la fecha del reporte, la cuenta de días se ajusta sola.",
      "La app te avisa cuando hay una versión nueva para que la actualices.",
    ],
  },
];

/** Novedades de una versión, o `null` si no tiene. */
export function novedadesDe(version: string): Novedades | null {
  return NOVEDADES.find((n) => n.version === version) ?? null;
}

/** "1.1.0" → "1.1"; las correcciones (x.y.1) se muestran completas. */
export function versionCorta(version: string): string {
  return version.replace(/\.0$/, "");
}

/** Clave de `db.meta` con la última versión cuyas novedades se vieron en este celular. */
export const META_VERSION_VISTA = "versionVista";

/** Última versión vista, o `null`. Nunca lanza. */
export async function leerVersionVista(): Promise<string | null> {
  try {
    const v = (await db.meta.get(META_VERSION_VISTA))?.value;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Marca las novedades de `version` como vistas. Nunca lanza. */
export async function marcarVersionVista(version: string): Promise<void> {
  try {
    await db.meta.put({ key: META_VERSION_VISTA, value: version });
  } catch {
    // Sin IndexedDB: el aviso volverá a salir, sin más consecuencias.
  }
}
