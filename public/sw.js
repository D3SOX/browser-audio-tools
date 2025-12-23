// Service Worker for Browser Audio Tools PWA
// Provides offline support by caching the app shell and ffmpeg core assets

const CACHE_VERSION = 'v4';
const CACHE_NAME = `browser-audio-tools-${CACHE_VERSION}`;

// Core assets to precache - the app shell and ffmpeg core files
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-maskable-192.svg',
  '/icons/icon-maskable-512.svg',
  // Single-threaded ffmpeg core
  '/ffmpeg-core/ffmpeg-core.js',
  '/ffmpeg-core/ffmpeg-core.wasm',
  // Multi-threaded ffmpeg core
  '/ffmpeg-core-mt/ffmpeg-core.js',
  '/ffmpeg-core-mt/ffmpeg-core.wasm',
  '/ffmpeg-core-mt/ffmpeg-core.worker.js',
];

// Install event - precache core assets
self.addEventListener('install', (event) => {
  console.info('[SW] Installing service worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.info('[SW] Precaching core assets...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to precache:', err);
        // Continue even if some assets fail - they'll be cached on first use
      });
    }),
  );
  // Take control immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.info('[SW] Activating service worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith('browser-audio-tools-') && name !== CACHE_NAME,
          )
          .map((name) => {
            console.info('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }),
      );
    }),
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (except for same-origin)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip blob: and data: URLs
  if (url.protocol === 'blob:' || url.protocol === 'data:') {
    return;
  }

  // For ffmpeg core files, use cache-first strategy (they're versioned and immutable)
  // Match by URL only (ignoring headers) to ensure cache hits
  if (url.pathname.startsWith('/ffmpeg-core')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        // Match by URL string to ignore header differences
        return cache.match(url.pathname).then((cachedResponse) => {
          if (cachedResponse) {
            console.info('[SW] Serving from cache:', url.pathname);
            return cachedResponse;
          }
          console.info('[SW] Fetching ffmpeg asset:', url.pathname);
          return fetch(event.request)
            .then((response) => {
              // Cache the response for future use (by URL path for consistent matching)
              if (response.ok) {
                const responseToCache = response.clone();
                cache.put(url.pathname, responseToCache);
              }
              return response;
            })
            .catch((err) => {
              console.error(
                '[SW] Failed to fetch ffmpeg asset:',
                url.pathname,
                err,
              );
              throw err;
            });
        });
      }),
    );
    return;
  }

  // For app shell and other static assets, use cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, but also update cache in background
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Network failed, that's fine - we have cache
          });
        return cachedResponse;
      }

      // No cache, must fetch from network
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((err) => {
          console.error(
            '[SW] Network request failed and no cache:',
            url.pathname,
            err,
          );
          throw err;
        });
    }),
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
