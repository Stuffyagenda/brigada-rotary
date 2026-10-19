import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/auth/proxy-session";

/**
 * Proxy de Next.js 16 (antes `middleware`). Refresca la sesión de Supabase y
 * redirige a /login las navegaciones de página sin sesión.
 * La lógica vive en `lib/auth/proxy-session.ts`.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    {
      // Todo salvo assets: _next, iconos, service worker, manifiesto y archivos con extensión.
      source:
        "/((?!_next/static|_next/image|_next/data|icons/|sw\\.js|swe-worker|workbox-|manifest\\.webmanifest|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|js|mjs|css|map|txt|xml|json|webmanifest|woff2?|ttf)$).*)",
      // Los prefetch del router no necesitan refrescar la sesión.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
