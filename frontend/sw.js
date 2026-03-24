// ═══════════════════════════════════════════════════════
// SECUREVAULT SERVICE WORKER
// File: C:\Projects\securevault\frontend\sw.js
// Enables: offline mode, install to home screen, push notifications
// ═══════════════════════════════════════════════════════

const CACHE_NAME  = 'securevault-v3';
const STATIC_URLS = [
  '/frontend/auth.html',
  '/frontend/index.html',
  '/frontend/admin.html',
  '/frontend/phase1_features.js',
  '/frontend/phase2_group1.js',
  '/frontend/phase2_group2.js',
  '/frontend/phase3.js',
  '/frontend/upgrades.js',
];

// Install — cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SecureVault SW: Caching static files');
      return cache.addAll(STATIC_URLS).catch(err => {
        console.log('SW cache error (expected in dev):', err.message);
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'Offline — API unavailable', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }
  
  // For navigation requests — network first, cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/frontend/auth.html')
      )
    );
    return;
  }
  
  // For static files — cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});

// Background sync for offline file uploads
self.addEventListener('sync', event => {
  if (event.tag === 'sync-uploads') {
    event.waitUntil(syncPendingUploads());
  }
});

async function syncPendingUploads() {
  // When back online, retry any failed uploads
  const db = await openDB();
  const tx = db.transaction('pending-uploads', 'readonly');
  const store = tx.objectStore('pending-uploads');
  const pending = await store.getAll();
  
  for (const upload of (pending || [])) {
    try {
      await fetch('/api/v1/hybrid/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + upload.token },
        body: upload.formData
      });
      console.log('SW: Synced pending upload:', upload.fileName);
    } catch(e) {
      console.log('SW: Sync failed for:', upload.fileName);
    }
  }
}

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body:    data.body || 'SecureVault notification',
    icon:    '/frontend/icon-192.png',
    badge:   '/frontend/badge-72.png',
    vibrate: [200, 100, 200],
    data:    { url: data.url || '/frontend/index.html' },
    actions: [
      { action: 'view',    title: 'View',   icon: '/frontend/icon-view.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'SecureVault', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});

console.log('SecureVault Service Worker v3 loaded');