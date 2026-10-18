
/* =========================================================
   BRIGADA ROTARY - SERVICE WORKER
   Version: v18
   Mantiene la caché de runtime y los datos locales.
   ========================================================= */

const APP_CACHE = 'brigada-rotary-v18';
const RUNTIME_CACHE = 'brigada-rotary-runtime-v1';
const TILES_CACHE = 'osm-tiles-offline-v1';

const APP_FILES = [
  './',
  './index.html',
  './manifest.json'
];

/* INSTALACIÓN */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

/* ACTIVACIÓN */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) =>
            key.startsWith('brigada-rotary-v') &&
            key !== APP_CACHE &&
            key !== RUNTIME_CACHE
          )
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* COMUNICACIÓN PARA ACTUALIZAR */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* PETICIONES Y FUNCIONAMIENTO OFFLINE */
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // No interceptar servicios externos ni envíos de formularios.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Archivos principales de la aplicación:
  // intenta obtener la versión nueva y conserva una copia offline.
  if (
    url.origin === self.location.origin &&
    (
      url.pathname.endsWith('/index.html') ||
      url.pathname.endsWith('/manifest.json') ||
      url.pathname.endsWith('/sw.js') ||
      url.pathname.endsWith('/')
    )
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(APP_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;

          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;

          return Response.error();
        })
    );
    return;
  }

  // Recursos externos y otros archivos:
  // red primero, caché como alternativa.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type !== 'opaque') {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        return Response.error();
      })
  );
});
