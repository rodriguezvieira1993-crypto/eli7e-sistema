const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/motorizados
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM motorizados WHERE activo = TRUE ORDER BY nombre ASC'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/motorizados/disponibles — para asignación rápida en call center
router.get('/disponibles', async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT * FROM motorizados WHERE estado = 'disponible' AND activo = TRUE ORDER BY nombre ASC"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/motorizados/:id — detalle + servicios del día
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM motorizados WHERE id = $1', [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Motorizado no encontrado' });

        const { rows: serviciosHoy } = await pool.query(
            `SELECT s.*, c.nombre_marca
       FROM servicios s
       LEFT JOIN clientes c ON c.id = s.cliente_id
       WHERE s.motorizado_id = $1 AND DATE(s.fecha_inicio) = CURRENT_DATE
       ORDER BY s.fecha_inicio DESC`,
            [req.params.id]
        );

        const { rows: totalHoy } = await pool.query(
            `SELECT COALESCE(SUM(monto),0) AS total_dia, COUNT(*) AS count_dia
       FROM servicios
       WHERE motorizado_id=$1 AND DATE(fecha_inicio)=CURRENT_DATE AND estado='completado'`,
            [req.params.id]
        );

        res.json({ motorizado: rows[0], servicios_hoy: serviciosHoy, resumen: totalHoy[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/motorizados — crear (solo admin)
router.post('/', requireRol('admin'), async (req, res) => {
    const { nombre, cedula, telefono, password } = req.body;
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    if (!cedula) return res.status(400).json({ error: 'cédula es requerida para login' });

    try {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(password || '123456', 10);
        const { rows } = await pool.query(
            `INSERT INTO motorizados (nombre, cedula, telefono, password) VALUES ($1,$2,$3,$4) RETURNING *`,
            [nombre, cedula, telefono, hash]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/motorizados/:id/password — cambiar contraseña (admin o el propio motorizado)
router.patch('/:id/password', async (req, res) => {
    // Permitir si es admin O si el motorizado cambia su propia contraseña
    if (req.user.rol !== 'admin' && req.user.id !== req.params.id) {
        return res.status(403).json({ error: 'Sin permiso' });
    }

    const { password, password_actual } = req.body;
    if (!password || password.length < 4) return res.status(400).json({ error: 'Contraseña mínimo 4 caracteres' });

    try {
        const bcrypt = require('bcryptjs');

        // Si es motorizado cambiando su propia clave, verificar la actual
        if (req.user.rol === 'motorizado') {
            if (!password_actual) return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });
            const { rows } = await pool.query('SELECT password FROM motorizados WHERE id = $1', [req.params.id]);
            if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
            const match = await bcrypt.compare(password_actual, rows[0].password);
            if (!match) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE motorizados SET password = $1 WHERE id = $2', [hash, req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/motorizados/:id/estado — cambiar estado
router.patch('/:id/estado', requireRol('admin', 'call_center'), async (req, res) => {
    const { estado } = req.body;
    const validos = ['disponible', 'en_servicio', 'inactivo'];
    if (!validos.includes(estado))
        return res.status(400).json({ error: 'Estado inválido' });

    try {
        const { rows } = await pool.query(
            'UPDATE motorizados SET estado=$1 WHERE id=$2 RETURNING *', [estado, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/motorizados/:id — actualizar (solo admin)
router.put('/:id', requireRol('admin'), async (req, res) => {
    const { nombre, cedula, telefono } = req.body;
    try {
        const { rows } = await pool.query(
            'UPDATE motorizados SET nombre=$1, cedula=$2, telefono=$3 WHERE id=$4 RETURNING *',
            [nombre, cedula, telefono, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/motorizados/:id — desactivar (solo admin)
router.delete('/:id', requireRol('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE motorizados SET activo=FALSE WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
