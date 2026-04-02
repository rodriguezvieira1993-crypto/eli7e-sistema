const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

// GET /api/chat/mensajes?canal=general&limit=50&antes=<timestamp>
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

// POST /api/chat/mensajes — enviar mensaje (fallback REST, se usa si WS no está disponible)
router.post('/mensajes', async (req, res) => {
    try {
        const { canal, mensaje } = req.body;
        if (!mensaje || !mensaje.trim()) return res.status(400).json({ error: 'Mensaje vacío' });

        const autorId = req.user.id;
        const autorNombre = req.user.nombre;
        const autorRol = req.user.rol;

        const { rows } = await pool.query(
            `INSERT INTO chat_mensajes (canal, autor_id, autor_nombre, autor_rol, mensaje)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [canal || 'general', autorId, autorNombre, autorRol, mensaje.trim()]
        );

        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/chat/canales — lista de canales disponibles
router.get('/canales', (req, res) => {
    const canales = [
        { id: 'general', nombre: 'General', icono: '💬' },
        { id: 'operaciones', nombre: 'Operaciones', icono: '🛵' },
        { id: 'admin', nombre: 'Administración', icono: '👑' }
    ];
    res.json(canales);
});

module.exports = router;
