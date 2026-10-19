import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";
import type { TypedSupabaseClient } from "@/lib/supabase/client";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Crear uno nuevo en cada petición (no reutilizar entre peticiones).
 *
 * Leer `cookies()` vuelve dinámica la ruta que lo use.
 * @throws Error si faltan las variables de entorno.
 */
export async function getSupabaseServerClient(): Promise<TypedSupabaseClient> {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // El refresco de sesión lo hace el proxy (proxy.ts).
        }
      },
    },
  });
}
