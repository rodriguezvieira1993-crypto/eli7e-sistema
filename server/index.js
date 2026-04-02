require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
const initDB = require('./initDB');

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, { cors: { origin: '*' } });

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

// Crear carpeta de uploads si no existe
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../public/uploads/chat');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

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
app.use('/api/chat', require('./routes/chat'));

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

// ── Forzar migraciones manualmente (visitar una vez y listo) ──
app.get('/api/admin/migrate', async (req, res) => {
    const pool = require('./db');
    const resultados = [];

    const queries = [
        { nombre: 'chat_mensajes', sql: `CREATE TABLE IF NOT EXISTS chat_mensajes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            canal VARCHAR(50) NOT NULL DEFAULT 'general',
            autor_id UUID NOT NULL, autor_nombre VARCHAR(100) NOT NULL,
            autor_rol VARCHAR(20) NOT NULL, mensaje TEXT NOT NULL,
            imagen_url TEXT, mencion_ids UUID[], creado_en TIMESTAMP DEFAULT NOW())` },
        { nombre: 'idx_chat_canal', sql: `CREATE INDEX IF NOT EXISTS idx_chat_canal ON chat_mensajes(canal)` },
        { nombre: 'idx_chat_fecha', sql: `CREATE INDEX IF NOT EXISTS idx_chat_fecha ON chat_mensajes(creado_en)` },
        { nombre: 'push_subscriptions', sql: `CREATE TABLE IF NOT EXISTS push_subscriptions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL, user_rol VARCHAR(20) NOT NULL,
            endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL,
            auth_key TEXT NOT NULL, creado_en TIMESTAMP DEFAULT NOW(),
            actualizado_en TIMESTAMP DEFAULT NOW())` },
        { nombre: 'idx_push', sql: `CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)` },
        { nombre: 'configuracion_sistema', sql: `CREATE TABLE IF NOT EXISTS configuracion_sistema (
            clave VARCHAR(50) PRIMARY KEY, valor TEXT NOT NULL DEFAULT '',
            descripcion TEXT, actualizado_en TIMESTAMP DEFAULT NOW())` },
    ];

    for (const q of queries) {
        try {
            await pool.query(q.sql);
            resultados.push('✅ ' + q.nombre);
        } catch (err) {
            resultados.push('❌ ' + q.nombre + ': ' + err.message);
        }
    }

    res.json({ ok: true, resultados });
});

// ── SPA fallback: todas las rutas → index.html ──────────────
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ── Socket.io — Chat en tiempo real ────────────────────────
const jwt = require('jsonwebtoken');
const pool = require('./db');

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Sin token'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'eli7e_jwt_secret_super_seguro_2026');
        socket.user = decoded;
        next();
    } catch {
        next(new Error('Token inválido'));
    }
});

io.on('connection', (socket) => {
    const user = socket.user;
    socket.join('general');
    console.log(`💬 Chat: ${user.nombre} (${user.rol}) conectado`);

    socket.on('join-canal', (canal) => {
        socket.join(canal);
    });

    socket.on('chat-mensaje', async (data) => {
        const { canal, mensaje, mencion_ids, imagen_url } = data;
        if (!mensaje || !mensaje.trim()) return;

        try {
            const { rows } = await pool.query(
                `INSERT INTO chat_mensajes (canal, autor_id, autor_nombre, autor_rol, mensaje, imagen_url, mencion_ids)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [canal || 'general', user.id, user.nombre, user.rol, mensaje.trim(), imagen_url || null, mencion_ids || null]
            );
            io.to(canal || 'general').emit('chat-nuevo', rows[0]);

            // Push a mencionados
            if (mencion_ids && mencion_ids.length) {
                const pushService = require('./pushService');
                for (const mid of mencion_ids) {
                    pushService.notifyMotorizado(mid, `💬 ${user.nombre} te mencionó`, mensaje.trim().substring(0, 100), { url: '/' }).catch(() => {});
                }
            }
        } catch (err) {
            socket.emit('chat-error', { error: err.message });
        }
    });

    socket.on('typing', (data) => {
        socket.to(data.canal || 'general').emit('chat-typing', {
            nombre: user.nombre,
            rol: user.rol
        });
    });

    socket.on('disconnect', () => {
        console.log(`💬 Chat: ${user.nombre} desconectado`);
    });
});

// ── Iniciar servidor ────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB().then(() => {
    // Inicializar push notifications (auto-genera VAPID keys si no existen)
    require('./pushService').init().catch(err => console.log('⚠️ Push init:', err.message));

    server.listen(PORT, () => {
        console.log(`✅ Eli7e Sistema corriendo en http://localhost:${PORT}`);
        console.log(`   Admin: admin@eli7e.com / eli7e2026`);
        console.log(`   💬 Chat WebSocket activo`);
    });
}).catch(err => {
    console.error('❌ No se pudo inicializar la BD:', err.message);
    process.exit(1);
});

module.exports = app;
