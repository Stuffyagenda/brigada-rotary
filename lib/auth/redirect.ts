/**
 * Reglas de redirección de la autenticación (compartidas por `proxy.ts`, el
 * guard del layout `(app)` y la página de login). Funciones puras.
 */

export const LOGIN_PATH = "/login";

/** Rutas que nunca redirigen a /login (aunque no haya sesión). */
const RUTAS_PUBLICAS = ["/login", "/~offline", "/offline"];

/** Prefijos que no son navegaciones de página: el proxy refresca la sesión pero no redirige. */
const PREFIJOS_SIN_REDIRECCION = ["/api/", "/_next/", "/icons/"];

const ORIGEN_FICTICIO = "http://brigada.invalid";

/** `true` si la ruta es accesible sin sesión. */
export function isPublicPath(pathname: string): boolean {
  if (RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return true;
  return PREFIJOS_SIN_REDIRECCION.some((p) => pathname.startsWith(p));
}

/**
 * Devuelve `raw` si es una ruta interna segura (empieza por "/" y no cambia de
 * origen); si no, `fallback`. Nunca devuelve /login para evitar bucles.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  try {
    const url = new URL(raw, ORIGEN_FICTICIO);
    if (url.origin !== ORIGEN_FICTICIO) return fallback;
    if (url.pathname === LOGIN_PATH || url.pathname.startsWith(`${LOGIN_PATH}/`)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** URL de /login que vuelve a `pathAndSearch` después de entrar. */
export function loginUrl(pathAndSearch = "/"): string {
  const next = safeNextPath(pathAndSearch, "/");
  return next === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(next)}`;
}

export interface ProxyRedirectInput {
  pathname: string;
  /** Query string con "?" inicial, o "". */
  search: string;
  method: string;
  /** `true` con sesión, `false` sin sesión, `null` si no se pudo comprobar (Supabase inalcanzable). */
  signedIn: boolean | null;
}

/**
 * Decide a dónde redirige el proxy. Devuelve la ruta de destino o `null` para
 * dejar pasar la petición.
 */
export function decideProxyRedirect({ pathname, search, method, signedIn }: ProxyRedirectInput): string | null {
  // Solo navegaciones de página.
  if (method !== "GET" && method !== "HEAD") return null;
  // Sin poder comprobar la sesión se deja pasar: el guard del cliente decide.
  if (signedIn === null) return null;

  if (pathname === LOGIN_PATH) {
    if (!signedIn) return null;
    return safeNextPath(new URLSearchParams(search).get("next"));
  }
  if (isPublicPath(pathname)) return null;
  if (signedIn) return null;
  return loginUrl(`${pathname}${search}`);
}
