// sw.js — Service Worker para Eli7e PWA + Push Notifications
const CACHE_NAME = 'eli7e-v1';

// Instalar — cachear recursos esenciales
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll([
                '/',
                '/css/dashboard.css',
                '/img/eli7e_logo.png',
                '/img/icon-192.png'
            ])
        )
    );
    self.skipWaiting();
});

// Activar — limpiar caches viejos
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Fetch — network first, fallback to cache
self.addEventListener('fetch', (e) => {
    // Solo cachear GETs de recursos estáticos
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('/api/')) return;

    e.respondWith(
        fetch(e.request)
            .then(resp => {
                // Cachear la respuesta fresca
                if (resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return resp;
            })
            .catch(() => caches.match(e.request))
    );
});

// Push — recibir notificación del servidor
self.addEventListener('push', (e) => {
    let data = { title: 'Eli7e', body: 'Nueva notificación' };

    try {
        data = e.data.json();
    } catch (err) {
        data.body = e.data ? e.data.text() : 'Nueva notificación';
    }

    const options = {
        body: data.body,
        icon: data.icon || '/img/icon-192.png',
        badge: data.badge || '/img/icon-192.png',
        vibrate: data.vibrate || [200, 100, 200],
        data: data.data || {},
        actions: [
            { action: 'open', title: 'Abrir' },
            { action: 'close', title: 'Cerrar' }
        ],
        tag: 'eli7e-notification',
        renotify: true
    };

    e.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Click en notificación — abrir la app
self.addEventListener('notificationclick', (e) => {
    e.notification.close();

    if (e.action === 'close') return;

    const url = (e.notification.data && e.notification.data.url) || '/';

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una ventana abierta, enfocarla
            for (const client of windowClients) {
                if (client.url.includes(url) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Si no, abrir nueva ventana
            return clients.openWindow(url);
        })
    );
});
