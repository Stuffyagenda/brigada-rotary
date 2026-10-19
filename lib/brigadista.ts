/**
 * Brigadista recordado: el último nombre escrito a mano en "Brigadista
 * responsable" se guarda en Dexie (`meta`, clave `ultimoBrigadista`) y se usa
 * como valor inicial de los reportes nuevos.
 *
 * Prioridad del valor inicial: último escrito > nombre del perfil.
 * Solo se guarda si es distinto del nombre del perfil (si coincide, se olvida y
 * vuelve a mandar el perfil). Se borra al cerrar sesión (`limpiarEspejoLocal`).
 */
import { db } from "@/lib/db";

export const META_ULTIMO_BRIGADISTA = "ultimoBrigadista";

function limpio(v: string | null | undefined): string {
  return (v ?? "").trim().replace(/\s+/g, " ");
}

/** Último brigadista escrito, o `null`. Nunca lanza. */
export async function leerUltimoBrigadista(): Promise<string | null> {
  try {
    const v = (await db.meta.get(META_ULTIMO_BRIGADISTA))?.value;
    return typeof v === "string" && limpio(v) ? limpio(v) : null;
  } catch {
    return null;
  }
}

/**
 * Recuerda el brigadista de un reporte guardado.
 * - Vacío: no cambia nada.
 * - Igual al nombre del perfil: se olvida el recordado.
 * - Distinto: se recuerda.
 * Nunca lanza.
 */
export async function recordarBrigadista(
  escrito: string | null | undefined,
  nombrePerfil: string | null | undefined,
): Promise<void> {
  const nombre = limpio(escrito);
  if (!nombre) return;
  try {
    if (nombre.toLocaleLowerCase("es") === limpio(nombrePerfil).toLocaleLowerCase("es")) {
      await db.meta.delete(META_ULTIMO_BRIGADISTA);
    } else {
      await db.meta.put({ key: META_ULTIMO_BRIGADISTA, value: nombre });
    }
  } catch {
    // Sin IndexedDB: solo se pierde la comodidad.
  }
}
