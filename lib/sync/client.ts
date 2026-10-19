/**
 * Acceso al cliente de Supabase y al estado de la red para el motor de sync.
 *
 * Centralizarlo aquí permite que el motor funcione (en modo solo local) cuando
 * faltan las variables de entorno, y que los tests sustituyan el cliente.
 */
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseBrowserClient, type TypedSupabaseClient } from "@/lib/supabase/client";

/** Bucket privado de Storage con las fotos de las viviendas. */
export const BUCKET_FOTOS = "fotos-viviendas";

/** Cliente de Supabase, o `null` si la app no tiene configurado Supabase. */
export function getSyncClient(): TypedSupabaseClient | null {
  if (typeof window === "undefined") return null;
  return hasSupabaseEnv() ? getSupabaseBrowserClient() : null;
}

/** `true` si el navegador reporta conexión (en el servidor, `true`). */
export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}
