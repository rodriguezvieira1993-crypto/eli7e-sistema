const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/configuracion — listar toda la configuración
router.get('/', requireRol('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM configuracion_sistema ORDER BY clave ASC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/configuracion/:clave — actualizar valor
router.put('/:clave', requireRol('admin'), async (req, res) => {
    const { valor } = req.body;
    if (valor === undefined) return res.status(400).json({ error: 'valor es requerido' });

    try {
        const { rows } = await pool.query(
            `UPDATE configuracion_sistema SET valor = $1, actualizado_en = NOW() WHERE clave = $2 RETURNING *`,
            [valor, req.params.clave]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Clave no encontrada' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/configuracion — guardar múltiples claves a la vez
router.put('/', requireRol('admin'), async (req, res) => {
    const entries = req.body; // { gmail_user: 'x', gmail_pass: 'y', ... }
    if (!entries || typeof entries !== 'object') return res.status(400).json({ error: 'Body inválido' });

    try {
        const results = [];
        for (const [clave, valor] of Object.entries(entries)) {
            const { rows } = await pool.query(
                `UPDATE configuracion_sistema SET valor = $1, actualizado_en = NOW() WHERE clave = $2 RETURNING *`,
                [valor, clave]
            );
            if (rows[0]) results.push(rows[0]);
        }
        res.json({ ok: true, actualizados: results.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
