import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";

/** Cliente de Supabase tipado con el esquema de la base. */
export type TypedSupabaseClient = SupabaseClient<Database>;

let browserClient: TypedSupabaseClient | undefined;

/**
 * Cliente de Supabase para el navegador (singleton).
 * La sesión se guarda en cookies para que el servidor también pueda leerla.
 *
 * Se crea de forma perezosa: llamar solo desde código que corre en el cliente
 * (efectos, manejadores de eventos, motor de sync).
 * @throws Error si faltan las variables de entorno.
 */
export function getSupabaseBrowserClient(): TypedSupabaseClient {
  if (!browserClient) {
    const { url, publishableKey } = getSupabaseEnv();
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }
  return browserClient;
}
