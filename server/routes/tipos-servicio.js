const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/tipos-servicio — listar todos
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM tipos_servicio ORDER BY nombre ASC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/tipos-servicio — crear nuevo tipo (solo admin)
router.post('/', requireRol('admin'), async (req, res) => {
    const { nombre, descripcion, icono, precio_base } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO tipos_servicio (nombre, descripcion, icono, precio_base)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [nombre.toLowerCase(), descripcion || null, icono || '📋', precio_base || 0]
        );
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/tipos-servicio/:id — editar tipo (solo admin)
router.put('/:id', requireRol('admin'), async (req, res) => {
    const { nombre, descripcion, icono, precio_base, activo } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE tipos_servicio SET nombre=$1, descripcion=$2, icono=$3, precio_base=$4, activo=$5
             WHERE id=$6 RETURNING *`,
            [nombre?.toLowerCase(), descripcion, icono, precio_base, activo !== false, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/tipos-servicio/:id — desactivar (solo admin)
router.delete('/:id', requireRol('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE tipos_servicio SET activo = FALSE WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
