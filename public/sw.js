// sw.js — Service Worker para Eli7e PWA + Push Notifications
const CACHE_NAME = 'eli7e-v1';

// Instalar
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache =>
            cache.addAll(['/', '/css/dashboard.css', '/img/eli7e_logo.png', '/img/icon-192.png'])
        )
    );
    self.skipWaiting();
});

// Activar
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(names =>
            Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
        )
    );
    self.clients.claim();
});

// Fetch — network first
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('/api/')) return;
    if (e.request.url.includes('/socket.io/')) return;
    e.respondWith(
        fetch(e.request)
            .then(resp => {
                if (resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
                }
                return resp;
            })
            .catch(() => caches.match(e.request))
    );
});

// Push — recibir notificación
self.addEventListener('push', (e) => {
    let data = { title: 'Eli7e', body: 'Nueva notificación' };
    try { data = e.data.json(); } catch (err) { data.body = e.data ? e.data.text() : 'Nueva notificación'; }

    const servicioId = data.data && data.data.servicioId;

    const options = {
        body: data.body,
        icon: data.icon || '/img/icon-192.png',
        badge: data.badge || '/img/icon-192.png',
        vibrate: data.vibrate || [200, 100, 200],
        data: data.data || {},
        actions: [
            { action: 'completar', title: '✅ Completado' },
            { action: 'abrir', title: '📱 Abrir' }
        ],
        tag: servicioId ? 'servicio-' + servicioId : 'eli7e-notification',
        renotify: true,
        requireInteraction: true
    };

    e.waitUntil(self.registration.showNotification(data.title, options));
});

// Click en notificación
self.addEventListener('notificationclick', (e) => {
    const data = e.notification.data || {};
    const servicioId = data.servicioId;
    const url = data.url || '/dashboard-motorizado.html';

    if (e.action === 'completar' && servicioId) {
        e.notification.close();
        e.waitUntil(
            completarServicio(servicioId).then(() =>
                self.registration.showNotification('✅ Servicio completado', {
                    body: 'El servicio fue marcado como completado',
                    icon: '/img/icon-192.png',
                    tag: 'servicio-completado',
                    requireInteraction: false
                })
            ).catch(() => {
                // Si falla completar, abrir la app
                return clients.openWindow(url);
            })
        );
        return;
    }

    // Abrir o tap genérico
    e.notification.close();
    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (client.url.includes(url) && 'focus' in client) return client.focus();
            }
            return clients.openWindow(url);
        })
    );
});

// Completar servicio desde notificación
async function completarServicio(servicioId) {
    let token = null;

    // Obtener token de cache
    try {
        const cache = await caches.open('eli7e-auth');
        const resp = await cache.match('/auth-token');
        if (resp) token = await resp.text();
    } catch (e) { /* sin cache */ }

    // Si no hay cache, pedir a ventana abierta
    if (!token) {
        try {
            const allClients = await clients.matchAll({ type: 'window' });
            for (const client of allClients) {
                const resp = await new Promise((resolve, reject) => {
                    const ch = new MessageChannel();
                    ch.port1.onmessage = (ev) => resolve(ev.data);
                    setTimeout(() => reject('timeout'), 2000);
                    client.postMessage({ type: 'GET_TOKEN' }, [ch.port2]);
                });
                if (resp && resp.token) { token = resp.token; break; }
            }
        } catch (e) { /* sin ventana */ }
    }

    if (!token) throw new Error('Sin token');

    const resp = await fetch(`/api/servicios/${servicioId}/cerrar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) throw new Error('Error API');
}
