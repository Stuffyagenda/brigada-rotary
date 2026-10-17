
const CACHE_PREFIX = 'brigada-rotary-';
const APP_SHELL_CACHE = `${CACHE_PREFIX}app-v13`;
const TILES_CACHE = `${CACHE_PREFIX}tiles-v2`;

const APP_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

const OPTIONAL_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

const MAX_TILE_CACHE = 1500;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);

    // Los archivos esenciales deben estar disponibles.
    await cache.addAll(APP_ASSETS);

    // Leaflet se intenta guardar sin cancelar toda la instalación
    // si el CDN no está disponible.
    await Promise.allSettled(
      OPTIONAL_ASSETS.map(async (asset) => {
        const response = await fetch(asset);

        if (response.ok) {
          await cache.put(asset, response);
        }
      })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter((key) =>
          key.startsWith(CACHE_PREFIX) &&
          key !== APP_SHELL_CACHE &&
          key !== TILES_CACHE
        )
        .map((key) => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

async function saveTile(cache, request, response) {
  if (!response || !(response.ok || response.type === 'opaque')) {
    return;
  }

  await cache.put(request, response.clone());

  // Evita que la caché de mosaicos crezca indefinidamente.
  const keys = await cache.keys();

  if (keys.length > MAX_TILE_CACHE) {
    const excess = keys.length - MAX_TILE_CACHE;

    await Promise.all(
      keys.slice(0, excess).map((key) => cache.delete(key))
    );
  }
}

async function handleTileRequest(request) {
  const cache = await caches.open(TILES_CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok || response.type === 'opaque') {
      await saveTile(cache, request, response);
    }

    return response;
  } catch {
    return new Response('', {
      status: 503,
      statusText: 'Mapa no disponible sin conexión'
    });
  }
}

async function handleAppRequest(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(APP_SHELL_CACHE);

      // Solo almacenar recursos del mismo origen.
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');

      if (fallback) {
        return fallback;
      }
    }

    return new Response('Recurso no disponible sin conexión.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // No interceptar envíos ni servicios externos.
  if (
    url.hostname === 'script.google.com' ||
    url.hostname.endsWith('.googleusercontent.com') ||
    url.hostname === 'googleusercontent.com'
  ) {
    return;
  }

  const isOsmTile =
    url.hostname === 'tile.openstreetmap.org';

  const isArcgisTile =
    url.hostname === 'server.arcgisonline.com' ||
    url.hostname.endsWith('.arcgisonline.com');

  if (isOsmTile || isArcgisTile) {
    event.respondWith(handleTileRequest(request));
    return;
  }

  // Interceptar la aplicación y los recursos del mismo origen.
  if (url.origin === self.location.origin) {
    event.respondWith(handleAppRequest(request));
  }
});
