const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/parametros/umbrales — umbrales de deuda (para semáforo dinámico)
router.get('/umbrales', async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT clave, valor FROM parametros_sistema WHERE clave IN ('umbral_deuda_critica', 'umbral_deuda_alerta')"
        );
        const map = {};
        rows.forEach(r => map[r.clave] = parseFloat(r.valor));
        res.json({
            critica: map.umbral_deuda_critica || 50,
            alerta: map.umbral_deuda_alerta || 20
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/parametros — listar todos los parámetros
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM parametros_sistema ORDER BY clave ASC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/parametros/:clave — obtener un parámetro por clave
router.get('/:clave', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM parametros_sistema WHERE clave = $1',
            [req.params.clave]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Parámetro no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/parametros/:clave — actualizar valor (solo admin)
router.put('/:clave', requireRol('admin'), async (req, res) => {
    const { valor, descripcion } = req.body;
    if (valor === undefined) return res.status(400).json({ error: 'valor es requerido' });

    // Validación específica para corte_diario_hora: entero entre 0 y 23
    if (req.params.clave === 'corte_diario_hora') {
        const h = parseInt(valor, 10);
        if (isNaN(h) || h < 0 || h > 23) {
            return res.status(400).json({ error: 'corte_diario_hora debe ser un entero entre 0 y 23' });
        }
    }

    try {
        const { rows } = await pool.query(
            `UPDATE parametros_sistema
             SET valor = $1, descripcion = COALESCE($2, descripcion),
                 actualizado_en = NOW(), actualizado_por = $3
             WHERE clave = $4 RETURNING *`,
            [valor, descripcion, req.user.id, req.params.clave]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Parámetro no encontrado' });

        // Si se modificó la hora del corte semanal, refrescar cache en memoria
        if (req.params.clave === 'corte_diario_hora') {
            try {
                const { loadConfig } = require('../util/weekRange');
                await loadConfig(pool);
            } catch (e) { /* el endpoint OK aunque el reload falle */ }
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/parametros — crear nuevo parámetro (solo admin)
router.post('/', requireRol('admin'), async (req, res) => {
    const { clave, valor, descripcion } = req.body;
    if (!clave || valor === undefined) return res.status(400).json({ error: 'clave y valor son requeridos' });

    try {
        const { rows } = await pool.query(
            `INSERT INTO parametros_sistema (clave, valor, descripcion, actualizado_por)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [clave, valor, descripcion, req.user.id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Parámetro ya existe' });
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
