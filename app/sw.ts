/// <reference lib="esnext" />
/// <reference lib="webworker" />
/**
 * Service worker de la PWA (Serwist). Fuente de `public/sw.js`, que genera
 * `serwist build serwist.config.mjs` después de `next build`.
 *
 * Estrategias:
 * - Precache del app shell (`self.__SW_MANIFEST`: estáticos de Next y `public/`).
 * - Navegaciones: NetworkFirst (5 s) con respaldo en caché; si la página no se
 *   visitó antes, se sirve la portada `/` guardada; si tampoco existe, un aviso.
 * - Estáticos del mismo origen (`/_next/static`, fuentes, iconos): CacheFirst.
 * - Nunca se interceptan ni se guardan peticiones a otros orígenes: Supabase
 *   (datos, Auth, Storage, Realtime), teselas de OpenStreetMap y Esri (sus
 *   condiciones de uso no permiten guardarlas para uso offline) ni Nominatim.
 *
 * Tiene su propio tsconfig (`tsconfig.sw.json`, lib webworker); el principal lo excluye.
 */
import type { PrecacheEntry, RouteMatchCallbackOptions, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const CACHE_PAGINAS = "brigada-paginas";
const CACHE_ESTATICOS = "brigada-estaticos";
const CACHE_IMAGENES = "brigada-imagenes";

/** Hosts que nunca se interceptan (además de cualquier otro origen). */
const HOSTS_EXCLUIDOS = [
  /(^|\.)supabase\.co$/i,
  /(^|\.)supabase\.in$/i,
  /(^|\.)tile\.openstreetmap\.org$/i,
  /^server\.arcgisonline\.com$/i,
  /(^|\.)nominatim\.openstreetmap\.org$/i,
];

/** Rutas propias que no se cachean (callbacks de Auth, API, el propio SW). */
const RUTAS_EXCLUIDAS = [/^\/auth\//, /^\/api\//, /^\/sw\.js$/, /^\/swe-worker/];

function cacheable({ url, sameOrigin }: Pick<RouteMatchCallbackOptions, "url" | "sameOrigin">): boolean {
  if (!sameOrigin) return false;
  if (HOSTS_EXCLUIDOS.some((re) => re.test(url.hostname))) return false;
  return !RUTAS_EXCLUIDAS.some((re) => re.test(url.pathname));
}

const AVISO_SIN_CONEXION = `<!doctype html>
<html lang="es-PA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>Sin conexión | Brigada Rotary</title>
<style>body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#F4F6F8;color:#1C2733;line-height:1.45}
h1{font-size:1.33rem;margin:0 0 8px}button{min-height:44px;padding:0 16px;border:0;border-radius:8px;background:#17458F;color:#fff;font:inherit;font-weight:600}</style>
</head><body><h1>Sin conexión</h1>
<p>Esta pantalla aún no está guardada en el celular. Abre la app una vez con señal para poder usarla sin conexión.</p>
<button onclick="location.reload()">Reintentar</button></body></html>`;

/** Si la red falla y no hay copia de la página, sirve la portada guardada o un aviso. */
const respaldoNavegacion: SerwistPlugin = {
  handlerDidError: async () => {
    const portada =
      (await caches.match("/", { cacheName: CACHE_PAGINAS, ignoreSearch: true })) ??
      (await serwist.matchPrecache("/"));
    return (
      portada ??
      new Response(AVISO_SIN_CONEXION, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  },
};

/** Solo se guardan respuestas completas y sin redirección (p. ej. no el salto a /login). */
const soloRespuestasValidas: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (response.ok && !response.redirected ? response : null),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      matcher: ({ request, url, sameOrigin }) =>
        request.mode === "navigate" && cacheable({ url, sameOrigin }),
      handler: new NetworkFirst({
        cacheName: CACHE_PAGINAS,
        networkTimeoutSeconds: 5,
        plugins: [
          soloRespuestasValidas,
          new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 }),
          respaldoNavegacion,
        ],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        cacheable({ url, sameOrigin }) &&
        (url.pathname.startsWith("/_next/static/") || /\.(?:js|css|woff2?|ttf|otf)$/i.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: CACHE_ESTATICOS,
        plugins: [
          soloRespuestasValidas,
          new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60, maxAgeFrom: "last-used" }),
        ],
      }),
    },
    {
      matcher: ({ request, url, sameOrigin }) =>
        cacheable({ url, sameOrigin }) &&
        (request.destination === "image" || /\.(?:png|jpe?g|gif|svg|ico|webp|avif)$/i.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: CACHE_IMAGENES,
        plugins: [
          soloRespuestasValidas,
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60, maxAgeFrom: "last-used" }),
        ],
      }),
    },
  ],
});

// Al instalar, se intenta guardar la portada para que sirva de respaldo sin conexión.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const respuesta = await fetch("/", { credentials: "same-origin", cache: "no-store" });
        if (respuesta.ok && !respuesta.redirected) {
          const cache = await caches.open(CACHE_PAGINAS);
          await cache.put("/", respuesta);
        }
      } catch {
        // Sin red o sin sesión: se guardará en la primera navegación.
      }
    })(),
  );
});

serwist.addEventListeners();
