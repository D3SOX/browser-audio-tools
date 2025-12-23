// Service Worker for Browser Audio Tools PWA
// Provides offline support by caching the app shell and ffmpeg core assets

const CACHE_VERSION = 'v1';
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
    })
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
          .filter((name) => name.startsWith('browser-audio-tools-') && name !== CACHE_NAME)
          .map((name) => {
            console.info('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
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
  if (url.pathname.startsWith('/ffmpeg-core')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          // Cache the response for future use
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // For app shell and other static assets, use stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Update cache with fresh response
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed, return cached response if available
          return cachedResponse;
        });
      
      // Return cached response immediately, or wait for network
      return cachedResponse || fetchPromise;
    })
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

