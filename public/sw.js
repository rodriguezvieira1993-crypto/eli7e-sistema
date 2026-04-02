// sw.js — Service Worker para Eli7e PWA + Push Notifications
const CACHE_NAME = 'eli7e-v2';

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
    if (e.request.method !== 'GET') return;
    if (e.request.url.includes('/api/')) return;

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
            { action: 'completar', title: '✅ Completado' },
            { action: 'abrir', title: '📱 Abrir' }
        ],
        tag: data.data && data.data.servicioId ? 'servicio-' + data.data.servicioId : 'eli7e-notification',
        renotify: true,
        requireInteraction: true,  // NO se cierra sola — persiste hasta que el usuario actúe
        silent: false
    };

    e.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Click en notificación
self.addEventListener('notificationclick', (e) => {
    const data = e.notification.data || {};
    const servicioId = data.servicioId;
    const url = data.url || '/dashboard-motorizado.html';

    if (e.action === 'completar' && servicioId) {
        // Marcar servicio como completado vía API
        e.notification.close();
        e.waitUntil(
            completarServicio(servicioId).then(() => {
                // Mostrar notificación de confirmación
                return self.registration.showNotification('✅ Servicio completado', {
                    body: 'El servicio fue marcado como completado',
                    icon: '/img/icon-192.png',
                    badge: '/img/icon-192.png',
                    tag: 'servicio-completado',
                    requireInteraction: false,
                    vibrate: [100]
                });
            })
        );
        return;
    }

    if (e.action === 'abrir' || !e.action) {
        // Abrir/enfocar la app
        e.notification.close();
        e.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
                for (const client of windowClients) {
                    if (client.url.includes(url) && 'focus' in client) {
                        return client.focus();
                    }
                }
                return clients.openWindow(url);
            })
        );
    }
});

// Completar servicio desde la notificación
async function completarServicio(servicioId) {
    // Obtener token del motorizado desde IndexedDB o cache
    const allClients = await clients.matchAll({ type: 'window' });
    let token = null;

    // Intentar obtener token de una ventana abierta
    for (const client of allClients) {
        try {
            const resp = await new Promise((resolve, reject) => {
                const ch = new MessageChannel();
                ch.port1.onmessage = (ev) => resolve(ev.data);
                setTimeout(() => reject('timeout'), 3000);
                client.postMessage({ type: 'GET_TOKEN' }, [ch.port2]);
            });
            if (resp && resp.token) { token = resp.token; break; }
        } catch (e) { /* continuar con siguiente cliente */ }
    }

    if (!token) {
        // Fallback: buscar en cache de la app
        try {
            const cache = await caches.open('eli7e-auth');
            const resp = await cache.match('/auth-token');
            if (resp) token = await resp.text();
        } catch (e) { /* sin token */ }
    }

    if (!token) return;

    try {
        await fetch(`/api/servicios/${servicioId}/cerrar`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            }
        });
    } catch (err) {
        console.log('⚠️ Error completando servicio:', err.message);
    }
}
