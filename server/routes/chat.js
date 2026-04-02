const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Configurar multer para subida de imágenes del chat
const storage = multer.diskStorage({
    destination: path.join(__dirname, '../../public/uploads/chat'),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        const ext = allowed.test(path.extname(file.originalname).toLowerCase());
        const mime = allowed.test(file.mimetype);
        cb(null, ext && mime);
    }
});

router.use(auth);

// GET /api/chat/mensajes?canal=general&limit=50
router.get('/mensajes', async (req, res) => {
    try {
        const canal = req.query.canal || 'general';
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const antes = req.query.antes;

        let query = `SELECT * FROM chat_mensajes WHERE canal = $1`;
        const params = [canal];

        if (antes) {
            query += ` AND creado_en < $2 ORDER BY creado_en DESC LIMIT $3`;
            params.push(antes, limit);
        } else {
            query += ` ORDER BY creado_en DESC LIMIT $2`;
            params.push(limit);
        }

        const { rows } = await pool.query(query, params);
        res.json(rows.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/mensajes — enviar mensaje con texto
router.post('/mensajes', async (req, res) => {
    try {
        const { canal, mensaje, mencion_ids } = req.body;
        if (!mensaje || !mensaje.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

        const { rows } = await pool.query(
            `INSERT INTO chat_mensajes (canal, autor_id, autor_nombre, autor_rol, mensaje, mencion_ids)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [canal || 'general', req.user.id, req.user.nombre, req.user.rol, mensaje.trim(), mencion_ids || null]
        );

        // Emitir por socket a todos en el canal
        const io = req.app.get('io');
        if (io) io.to(canal || 'general').emit('chat-nuevo', rows[0]);

        // Notificar mencionados por push
        if (mencion_ids && mencion_ids.length) {
            notificarMenciones(mencion_ids, req.user.nombre, mensaje.trim()).catch(() => {});
        }

        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/chat/imagen — subir imagen
router.post('/imagen', upload.single('imagen'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

        const imagenUrl = '/uploads/chat/' + req.file.filename;
        const canal = req.body.canal || 'general';
        const mensaje = req.body.mensaje || '';

        const { rows } = await pool.query(
            `INSERT INTO chat_mensajes (canal, autor_id, autor_nombre, autor_rol, mensaje, imagen_url)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [canal, req.user.id, req.user.nombre, req.user.rol, mensaje, imagenUrl]
        );

        // Emitir por socket a todos en el canal
        const io = req.app.get('io');
        if (io) io.to(canal).emit('chat-nuevo', rows[0]);

        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/chat/usuarios — todos los usuarios para menciones
router.get('/usuarios', async (req, res) => {
    try {
        const { rows: usuarios } = await pool.query(
            "SELECT id, nombre, rol FROM usuarios WHERE activo = TRUE ORDER BY nombre"
        );
        const { rows: motos } = await pool.query(
            "SELECT id, nombre, 'motorizado' AS rol FROM motorizados WHERE activo = TRUE ORDER BY nombre"
        );
        res.json([...usuarios, ...motos]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/chat/canales
router.get('/canales', (req, res) => {
    res.json([
        { id: 'general', nombre: 'General', icono: '💬' },
        { id: 'operaciones', nombre: 'Operaciones', icono: '🛵' },
        { id: 'admin', nombre: 'Administración', icono: '👑' }
    ]);
});

// Notificar por push a usuarios mencionados
async function notificarMenciones(ids, autorNombre, mensaje) {
    try {
        const pushService = require('../pushService');
        for (const id of ids) {
            await pushService.notifyMotorizado(id,
                `💬 ${autorNombre} te mencionó`,
                mensaje.substring(0, 100),
                { url: '/dashboard-motorizado.html' }
            );
        }
    } catch (err) {
        console.log('⚠️ Push mención error:', err.message);
    }
}

module.exports = router;
