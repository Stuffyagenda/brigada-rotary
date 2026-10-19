/**
 * Reglas de redirección de la autenticación (compartidas por `proxy.ts`, el
 * guard del layout `(app)` y las pantallas de acceso /login y /registro). Funciones puras.
 */

export const LOGIN_PATH = "/login";
export const REGISTRO_PATH = "/registro";

/** Pantallas de acceso: públicas y, con sesión, redirigen a la app. */
const RUTAS_DE_ACCESO = [LOGIN_PATH, REGISTRO_PATH];

/** Rutas que nunca redirigen a /login (aunque no haya sesión). */
const RUTAS_PUBLICAS = [...RUTAS_DE_ACCESO, "/~offline", "/offline"];

/** Prefijos que no son navegaciones de página: el proxy refresca la sesión pero no redirige. */
const PREFIJOS_SIN_REDIRECCION = ["/api/", "/_next/", "/icons/"];

const ORIGEN_FICTICIO = "http://brigada.invalid";

/** `true` si `pathname` es `ruta` o una subruta (`/registro/x`, pero no `/registros`). */
function esRuta(pathname: string, ruta: string): boolean {
  return pathname === ruta || pathname.startsWith(`${ruta}/`);
}

/** `true` si la ruta es una pantalla de acceso (/login o /registro). */
export function isAuthPath(pathname: string): boolean {
  return RUTAS_DE_ACCESO.some((r) => esRuta(pathname, r));
}

/** `true` si la ruta es accesible sin sesión. */
export function isPublicPath(pathname: string): boolean {
  if (RUTAS_PUBLICAS.some((r) => esRuta(pathname, r))) return true;
  return PREFIJOS_SIN_REDIRECCION.some((p) => pathname.startsWith(p));
}

/**
 * Devuelve `raw` si es una ruta interna segura (empieza por "/" y no cambia de
 * origen); si no, `fallback`. Nunca devuelve /login ni /registro para evitar bucles.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  try {
    const url = new URL(raw, ORIGEN_FICTICIO);
    if (url.origin !== ORIGEN_FICTICIO) return fallback;
    if (isAuthPath(url.pathname)) return fallback;
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

/**
 * Enlace entre las pantallas de acceso (/login ↔ /registro) que conserva el
 * `?next=` interno de `search` (query string actual, con o sin "?").
 */
export function authSwitchHref(destino: typeof LOGIN_PATH | typeof REGISTRO_PATH, search = ""): string {
  const next = safeNextPath(new URLSearchParams(search).get("next"), "/");
  return next === "/" ? destino : `${destino}?next=${encodeURIComponent(next)}`;
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

  // Con sesión, /login y /registro llevan a la app (o al `next` seguro).
  if (pathname === LOGIN_PATH || pathname === REGISTRO_PATH) {
    if (!signedIn) return null;
    return safeNextPath(new URLSearchParams(search).get("next"));
  }
  if (isPublicPath(pathname)) return null;
  if (signedIn) return null;
  return loginUrl(`${pathname}${search}`);
}
