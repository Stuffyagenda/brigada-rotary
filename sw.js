/* Service Worker - Brigada Rotary
 * Cachea la estructura de la aplicación y recursos estáticos.
 * No almacena respuestas privadas de Google Apps Script ni descarga teselas masivamente.
 */
'use strict';

const APP_CACHE = 'brigada-rotary-app-v20';
const RUNTIME_CACHE = 'brigada-rotary-runtime-v1';
const APP_SHELL = ['./', './index.html', './manifest.json', './icons/brigada-rotary.svg', './icons/brigada-rotary-192.png', './icons/brigada-rotary-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('brigada-rotary-') && ![APP_CACHE, RUNTIME_CACHE].includes(key))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isGoogleService(url) {
  return /(^|\.)google(script|usercontent)?\.com$/i.test(url.hostname) ||
    /(^|\.)googleapis\.com$/i.test(url.hostname) ||
    /script\.google\.com$/i.test(url.hostname);
}

function isMapTile(url) {
  return url.hostname === 'tile.openstreetmap.org' ||
    url.hostname.endsWith('.tile.openstreetmap.org') ||
    url.hostname === 'server.arcgisonline.com';
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  // No interceptar la API de Google: evita guardar datos de emergencia en caché por accidente.
  if (isGoogleService(url)) return;

  // Las teselas se solicitan directamente al proveedor y no se guardan para uso offline.
  // OpenStreetMap público no autoriza la descarga masiva de áreas para mapas offline.
  if (isMapTile(url)) return;

  // Recursos de Leaflet: caché de ejecución para que el mapa pueda inicializar si ya se cargaron antes.
  if (url.hostname === 'unpkg.com') {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && (request.destination === 'script' || request.destination === 'style')) {
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return new Response('Recurso no disponible sin conexión.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navegación: primero red para recibir actualizaciones; si falla, usa la app guardada.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(APP_CACHE);
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Archivos estáticos propios: cache-first, con actualización en segundo plano si la red está disponible.
  if (['style', 'script', 'image', 'font', 'manifest'].includes(request.destination) ||
      /\/(manifest\.json|index\.html)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => {
          if (response.ok) cache.put(request, response.clone()).catch(() => {});
        }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
