const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

// Todos los endpoints requieren autenticación
router.use(auth);

// GET /api/clientes — listar todos
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM clientes WHERE activo = TRUE ORDER BY nombre_marca ASC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/clientes/:id — detalle + historial
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM clientes WHERE id = $1', [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });

        const { rows: servicios } = await pool.query(
            `SELECT s.*, m.nombre AS motorizado_nombre
       FROM servicios s
       LEFT JOIN motorizados m ON m.id = s.motorizado_id
       WHERE s.cliente_id = $1
       ORDER BY s.fecha_inicio DESC LIMIT 50`,
            [req.params.id]
        );

        res.json({ cliente: rows[0], historial: servicios });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/clientes — crear (admin o call_center)
router.post('/', requireRol('admin', 'call_center'), async (req, res) => {
    const { nombre_marca, email, telefono, rif, direccion } = req.body;
    if (!nombre_marca) return res.status(400).json({ error: 'nombre_marca es requerido' });

    try {
        const { rows } = await pool.query(
            `INSERT INTO clientes (nombre_marca, email, telefono, rif, direccion)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [nombre_marca, email, telefono, rif, direccion]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/clientes/:id — actualizar (admin o call_center)
router.put('/:id', requireRol('admin', 'call_center'), async (req, res) => {
    const { nombre_marca, email, telefono, rif, direccion } = req.body;
    if (!nombre_marca || !nombre_marca.trim()) {
        return res.status(400).json({ error: 'nombre_marca es requerido' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE clientes SET nombre_marca=$1, email=$2, telefono=$3, rif=$4, direccion=$5
       WHERE id=$6 RETURNING *`,
            [nombre_marca.trim(), email, telefono, rif, direccion, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe otro cliente con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/clientes/:id — desactivar (admin o call_center)
router.delete('/:id', requireRol('admin', 'call_center'), async (req, res) => {
    try {
        await pool.query('UPDATE clientes SET activo=FALSE WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
