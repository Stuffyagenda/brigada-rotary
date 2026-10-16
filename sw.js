// sw.js - Service Worker con Caché de Mosaicos para Provincias Centrales
const APP_SHELL_CACHE = 'brigadas-shell-v11';
const TILES_CACHE = 'osm-tiles-offline-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => {
          if (k !== APP_SHELL_CACHE && k !== TILES_CACHE) {
            return caches.delete(k);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Ignorar peticiones de sincronización con Google Apps Script
  if (
    e.request.method !== 'GET' ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    return;
  }

  // Interceptar Mosaicos de OpenStreetMap o ArcGIS Satelital (Cache-First)
  if (url.hostname.includes('tile.openstreetmap.org') || url.hostname.includes('arcgisonline.com')) {
    e.respondWith(
      caches.open(TILES_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        if (cached) return cached;

        try {
          const networkResponse = await fetch(e.request);
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // App Shell y archivos estáticos
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((response) => {
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(e.request, copy));
          }
          return response;
        })
        .catch(() => {
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});