require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const initDB = require('./initDB');

const app = express();

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Íconos PWA dinámicos con fondo negro ─────────────────────
// Se sirven ANTES del static para interceptar /img/icon-*.png
const _iconCache = {};
app.get('/img/icon-:size.png', async (req, res) => {
    const size = parseInt(req.params.size);
    if (![192, 512].includes(size)) return res.status(404).end();

    // Servir desde cache si ya se generó
    if (_iconCache[size]) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(_iconCache[size]);
    }

    try {
        const sharp = require('sharp');
        const logoPath = path.join(__dirname, '../public/img/eli7e_logo.png');
        const padding = Math.round(size * 0.15);
        const logoSize = size - padding * 2;

        const logo = await sharp(logoPath)
            .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer();

        const icon = await sharp({
            create: { width: size, height: size, channels: 4, background: { r: 6, g: 11, b: 6, alpha: 255 } }
        })
            .composite([{ input: logo, gravity: 'centre' }])
            .png()
            .toBuffer();

        _iconCache[size] = icon;
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        res.send(icon);
        console.log(`✅ Ícono PWA ${size}x${size} generado con fondo negro`);
    } catch (e) {
        // Fallback: servir el archivo estático original
        res.sendFile(path.join(__dirname, `../public/img/icon-${size}.png`));
    }
});

// Apple touch icon también con fondo negro
app.get('/apple-touch-icon.png', async (req, res) => {
    if (_iconCache[192]) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.send(_iconCache[192]);
    }
    res.redirect('/img/icon-192.png');
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../public')));

// ── Rutas API ───────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/motorizados', require('./routes/motorizados'));
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/tipos-servicio', require('./routes/tipos-servicio'));
app.use('/api/tarifas', require('./routes/tarifas'));
app.use('/api/cobranza', require('./routes/cobranza'));
app.use('/api/cierres', require('./routes/cierres'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/parametros', require('./routes/parametros'));
app.use('/api/prestamos', require('./routes/prestamos'));
app.use('/api/nominas', require('./routes/nominas'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/push', require('./routes/push'));

// ── Reset DB: limpiar datos de prueba (solo admin) ──────────
app.post('/api/admin/reset-db', require('./middleware/auth'), (req, res, next) => {
    if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
    next();
}, async (req, res) => {
    const pool = require('./db');
    const fs = require('fs');
    try {
        const resetSQL = fs.readFileSync(path.join(__dirname, '../db/reset.sql'), 'utf8');
        await pool.query(resetSQL);
        res.json({ ok: true, msg: 'Datos de prueba limpiados correctamente' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', sistema: 'Eli7e', hora: new Date().toISOString() });
});

// ── SPA fallback: todas las rutas → index.html ──────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Iniciar servidor ────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB().then(() => {
    // Inicializar push notifications (auto-genera VAPID keys si no existen)
    require('./pushService').init().catch(err => console.log('⚠️ Push init:', err.message));

    app.listen(PORT, () => {
        console.log(`✅ Eli7e Sistema corriendo en http://localhost:${PORT}`);
        console.log(`   Admin: admin@eli7e.com / eli7e2026`);
    });
}).catch(err => {
    console.error('❌ No se pudo inicializar la BD:', err.message);
    process.exit(1);
});

module.exports = app;
