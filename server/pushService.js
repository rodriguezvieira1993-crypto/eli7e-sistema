// pushService.js — Servicio de Web Push Notifications
const webpush = require('web-push');
const pool = require('./db');

let _configured = false;
let _vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
let _vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@eli7e.com';

// Inicializar — si no hay keys en env vars, buscar en BD o auto-generar
async function init() {
    if (_configured) return true;

    // Si no hay env vars, buscar en configuracion_sistema
    if (!_vapidPublic || !_vapidPrivate) {
        try {
            const { rows } = await pool.query(
                "SELECT clave, valor FROM configuracion_sistema WHERE clave IN ('vapid_public_key', 'vapid_private_key')"
            );
            for (const r of rows) {
                if (r.clave === 'vapid_public_key') _vapidPublic = r.valor;
                if (r.clave === 'vapid_private_key') _vapidPrivate = r.valor;
            }
        } catch (err) { /* tabla puede no existir aún */ }
    }

    // Si aún no hay keys, auto-generar y guardar en BD
    if (!_vapidPublic || !_vapidPrivate) {
        try {
            const keys = webpush.generateVAPIDKeys();
            _vapidPublic = keys.publicKey;
            _vapidPrivate = keys.privateKey;

            await pool.query(`
                INSERT INTO configuracion_sistema (clave, valor, descripcion)
                VALUES ('vapid_public_key', $1, 'Clave pública VAPID para push notifications')
                ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
            `, [_vapidPublic]);
            await pool.query(`
                INSERT INTO configuracion_sistema (clave, valor, descripcion)
                VALUES ('vapid_private_key', $1, 'Clave privada VAPID para push notifications (no compartir)')
                ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
            `, [_vapidPrivate]);

            console.log('🔑 VAPID keys auto-generadas y guardadas en BD');
        } catch (err) {
            console.log('⚠️ Push: no se pudieron generar VAPID keys:', err.message);
            return false;
        }
    }

    webpush.setVapidDetails(VAPID_EMAIL, _vapidPublic, _vapidPrivate);
    _configured = true;
    console.log('✅ Push notifications configuradas');
    return true;
}

function getPublicKey() {
    return _vapidPublic;
}

// Guardar suscripción de un usuario/motorizado
async function saveSubscription(userId, userRol, subscription) {
    await pool.query(`
        INSERT INTO push_subscriptions (user_id, user_rol, endpoint, p256dh, auth_key)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (endpoint) DO UPDATE SET
            p256dh = EXCLUDED.p256dh,
            auth_key = EXCLUDED.auth_key,
            user_id = EXCLUDED.user_id,
            actualizado_en = NOW()
    `, [
        userId,
        userRol,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth
    ]);
}

// Eliminar suscripción
async function removeSubscription(endpoint) {
    await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

// Enviar notificación a un motorizado específico
async function notifyMotorizado(motorizadoId, title, body, data = {}) {
    if (!_configured && !(await init())) return { sent: 0, failed: 0 };

    // Buscar suscripciones — intentar por motorizado_id, si no hay buscar por user_id genérico
    let { rows } = await pool.query(
        "SELECT * FROM push_subscriptions WHERE user_id = $1",
        [motorizadoId]
    );

    console.log(`📬 Push: buscando suscripciones para ${motorizadoId} → ${rows.length} encontrada(s)`);

    if (!rows.length) {
        // Intentar buscar la relación motorizado → usuario
        try {
            const { rows: motoRows } = await pool.query(
                "SELECT u.id FROM usuarios u JOIN motorizados m ON m.cedula = u.nombre WHERE m.id = $1 LIMIT 1",
                [motorizadoId]
            );
            if (motoRows.length) {
                const result = await pool.query(
                    "SELECT * FROM push_subscriptions WHERE user_id = $1",
                    [motoRows[0].id]
                );
                rows = result.rows;
                console.log(`📬 Push: fallback por usuario → ${rows.length} encontrada(s)`);
            }
        } catch (e) { /* no crítico */ }
    }

    let sent = 0, failed = 0;

    for (const sub of rows) {
        const pushSub = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key }
        };

        const payload = JSON.stringify({
            title, body,
            icon: '/img/icon-192.png',
            badge: '/img/icon-192.png',
            data: { ...data, url: '/dashboard-motorizado.html' },
            vibrate: [200, 100, 200]
        });

        try {
            await webpush.sendNotification(pushSub, payload);
            sent++;
            console.log(`📬 Push enviado OK a ${sub.endpoint.substring(0, 60)}...`);
        } catch (err) {
            console.log(`📬 Push error: ${err.statusCode || err.message}`);
            if (err.statusCode === 410 || err.statusCode === 404) {
                await removeSubscription(sub.endpoint);
            }
            failed++;
        }
    }

    return { sent, failed };
}

// Enviar notificación a todos los de un rol
async function notifyRole(rol, title, body, data = {}) {
    if (!_configured && !(await init())) return { sent: 0, failed: 0 };

    const { rows } = await pool.query(
        'SELECT * FROM push_subscriptions WHERE user_rol = $1',
        [rol]
    );

    let sent = 0, failed = 0;

    for (const sub of rows) {
        const pushSub = {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key }
        };

        const payload = JSON.stringify({
            title, body,
            icon: '/img/icon-192.png',
            badge: '/img/icon-192.png',
            data,
            vibrate: [200, 100, 200]
        });

        try {
            await webpush.sendNotification(pushSub, payload);
            sent++;
        } catch (err) {
            if (err.statusCode === 410 || err.statusCode === 404) {
                await removeSubscription(sub.endpoint);
            }
            failed++;
        }
    }

    return { sent, failed };
}

module.exports = { init, getPublicKey, saveSubscription, removeSubscription, notifyMotorizado, notifyRole };
