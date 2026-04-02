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
