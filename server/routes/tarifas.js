const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/tarifas — listar todas las tarifas activas, ordenadas por monto
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM tarifas WHERE activo = TRUE ORDER BY monto ASC'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tarifas — crear nueva tarifa (solo admin)
router.post('/', requireRol('admin'), async (req, res) => {
    const { monto, etiqueta } = req.body;
    if (!monto || parseFloat(monto) <= 0) return res.status(400).json({ error: 'monto es requerido y debe ser mayor a 0' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO tarifas (monto, etiqueta) VALUES ($1, $2) RETURNING *`,
            [parseFloat(monto), etiqueta || null]
        );
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tarifas/:id — editar tarifa (solo admin)
router.put('/:id', requireRol('admin'), async (req, res) => {
    const { monto, etiqueta } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE tarifas SET monto=$1, etiqueta=$2 WHERE id=$3 RETURNING *`,
            [parseFloat(monto), etiqueta || null, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Tarifa no encontrada' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/tarifas/:id — eliminar tarifa (solo admin)
router.delete('/:id', requireRol('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE tarifas SET activo = FALSE WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
