// routes/push.js — API para push subscriptions
const express = require('express');
const auth = require('../middleware/auth');
const pushService = require('../pushService');
const router = express.Router();

// GET /api/push/vapid-key — clave pública (no requiere auth)
router.get('/vapid-key', (req, res) => {
    const key = pushService.getPublicKey();
    if (!key) return res.status(503).json({ error: 'Push no configurado' });
    res.json({ publicKey: key });
});

// POST /api/push/subscribe — guardar suscripción
router.post('/subscribe', auth, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ error: 'Suscripción inválida' });
        }
        await pushService.saveSubscription(req.user.id, req.user.rol, subscription);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/push/unsubscribe — eliminar suscripción
router.post('/unsubscribe', auth, async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (endpoint) await pushService.removeSubscription(endpoint);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
