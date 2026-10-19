import type { NextConfig } from "next";

/**
 * Configuración de Next.js.
 *
 * Service worker (Serwist): se usa el "modo configurador" de `@serwist/next`,
 * compatible con Turbopack. No requiere plugin en este archivo: la configuración
 * vive en `serwist.config.mjs` y el SW se genera con `serwist build` después de
 * `next build` (script `build:sw`).
 * TODO(sync-offline): crear `app/sw.ts` y cambiar el script `build` a
 * `next build && serwist build`.
 */
const nextConfig: NextConfig = {
  // Cache Components / Partial Prefetching desactivados: la app es offline-first
  // (los datos se leen de IndexedDB en el cliente) y la sesión se lee de cookies
  // en el servidor sin necesidad de envolverla en <Suspense>.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // El service worker nunca debe quedar cacheado por el navegador ni la CDN.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
