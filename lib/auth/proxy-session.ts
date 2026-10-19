/**
 * Lógica del proxy (`proxy.ts`): refresca la sesión de `@supabase/ssr` en las
 * cookies y redirige a /login las navegaciones sin sesión.
 *
 * Solo corre cuando la petición llega al servidor. Sin señal, el service worker
 * responde desde la caché y la decisión la toma el guard del cliente
 * (`components/auth/SessionGate.tsx`).
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isNetworkError } from "@/lib/auth/errors";
import { decideProxyRedirect } from "@/lib/auth/redirect";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv, hasSupabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  // Sin configuración no hay sesión que comprobar (build o desarrollo sin .env.local).
  if (!hasSupabaseEnv()) return response;

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        // Cabeceras anti-caché: una respuesta con cookies de sesión no debe cachearse.
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // No ejecutar código entre createServerClient y getClaims (recomendación de @supabase/ssr).
  let signedIn: boolean | null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (data?.claims) signedIn = true;
    else signedIn = error && isNetworkError(error) ? null : false;
  } catch (error) {
    signedIn = isNetworkError(error) ? null : false;
  }

  const destino = decideProxyRedirect({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    signedIn,
  });
  if (!destino) return response;

  const redirect = NextResponse.redirect(new URL(destino, request.url));
  // Conserva las cookies refrescadas (o borradas) y sus cabeceras anti-caché.
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  const cacheControl = response.headers.get("cache-control");
  if (cacheControl) redirect.headers.set("cache-control", cacheControl);
  return redirect;
}
