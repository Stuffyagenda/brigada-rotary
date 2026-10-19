/**
 * Caché del perfil en Dexie (`meta`, clave `perfil`) para que la app sepa quién
 * es el usuario sin señal. Los errores de IndexedDB se ignoran: la caché es una
 * ayuda, nunca la fuente de verdad (la RLS decide en el servidor).
 */
import { db } from "@/lib/db";
import type { Club, Profile } from "@/lib/types";

export const PERFIL_KEY = "perfil";

export interface PerfilCache {
  userId: string;
  email: string | null;
  profile: Profile;
  club: Club | null;
  /** ISO 8601 de la última lectura correcta del servidor. */
  savedAt: string;
}

function esPerfilCache(value: unknown): value is PerfilCache {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<PerfilCache>;
  return (
    typeof v.userId === "string" &&
    !!v.profile &&
    typeof v.profile === "object" &&
    v.profile.id === v.userId &&
    typeof v.savedAt === "string"
  );
}

/** Perfil guardado, o `null` si no hay (o si IndexedDB no está disponible). */
export async function readPerfilCache(): Promise<PerfilCache | null> {
  try {
    const entry = await db.meta.get(PERFIL_KEY);
    return esPerfilCache(entry?.value) ? entry.value : null;
  } catch {
    return null;
  }
}

export async function writePerfilCache(cache: PerfilCache): Promise<void> {
  try {
    await db.meta.put({ key: PERFIL_KEY, value: cache });
  } catch {
    // Sin IndexedDB (modo privado antiguo): se sigue sin caché.
  }
}

export async function clearPerfilCache(): Promise<void> {
  try {
    await db.meta.delete(PERFIL_KEY);
  } catch {
    // Ídem.
  }
}
