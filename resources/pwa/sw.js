/* global VERSION */
const prefix = 'usk-app-offline-';
const cacheName = prefix + VERSION;
const offlinePath = '/pwa/offline.html';

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const response = await fetch(offlinePath, { credentials: 'omit', cache: 'reload', redirect: 'error' });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Offline page unavailable');
        const cache = await caches.open(cacheName);
        await cache.put(offlinePath, response);
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'USK_ACTIVATE_UPDATE' && event.source?.url?.startsWith(self.location.origin + '/app/')) {
        event.waitUntil(self.skipWaiting());
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    // Inertia requests, downloads, mutations, and public pages retain normal network semantics.
    if (url.origin !== self.location.origin || !url.pathname.startsWith('/app/') || request.mode !== 'navigate' || request.method !== 'GET') return;

    event.respondWith(fetch(request).catch(async () => {
        const cache = await caches.open(cacheName);
        return (await cache.match(offlinePath)) ?? Response.error();
    }));
});
