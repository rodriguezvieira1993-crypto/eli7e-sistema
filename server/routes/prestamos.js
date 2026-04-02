const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/prestamos — listar todos (admin) o los del motorizado logueado
router.get('/', async (req, res) => {
    try {
        let query, params;
        if (req.user.rol === 'admin') {
            query = `SELECT p.*, m.nombre AS motorizado_nombre, m.cedula AS motorizado_cedula
                     FROM prestamos p
                     JOIN motorizados m ON m.id = p.motorizado_id
                     ORDER BY p.solicitado_en DESC`;
            params = [];
        } else {
            query = `SELECT * FROM prestamos WHERE motorizado_id = $1 ORDER BY solicitado_en DESC`;
            params = [req.user.id];
        }
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/prestamos/motorizado/:id — préstamos de un motorizado específico (admin)
router.get('/motorizado/:id', requireRol('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM prestamos WHERE motorizado_id = $1 ORDER BY solicitado_en DESC',
            [req.params.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/prestamos — solicitar préstamo (motorizado)
router.post('/', async (req, res) => {
    const { monto, cuotas, nota } = req.body;
    if (!monto || monto <= 0) return res.status(400).json({ error: 'Monto inválido' });

    // Obtener máximo de cuotas configurable
    const { rows: paramRows } = await pool.query("SELECT valor FROM parametros_sistema WHERE clave = 'max_cuotas_prestamo'");
    const maxCuotas = paramRows[0] ? parseInt(paramRows[0].valor) : 52;

    const numCuotas = Math.min(Math.max(parseInt(cuotas) || 1, 1), maxCuotas);
    const cuotaSemanal = parseFloat((monto / numCuotas).toFixed(2));

    try {
        const { rows } = await pool.query(
            `INSERT INTO prestamos (motorizado_id, monto, cuotas, cuota_semanal, saldo_pendiente, nota)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [req.user.id, monto, numCuotas, cuotaSemanal, monto, nota]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/prestamos/:id/aprobar — aprobar préstamo (solo admin)
router.patch('/:id/aprobar', requireRol('admin'), async (req, res) => {
    const { cuotas } = req.body; // admin puede ajustar cuotas al aprobar
    try {
        const { rows: existing } = await pool.query('SELECT * FROM prestamos WHERE id = $1', [req.params.id]);
        if (!existing[0]) return res.status(404).json({ error: 'Préstamo no encontrado' });
        if (existing[0].estado !== 'pendiente') return res.status(400).json({ error: 'Solo se pueden aprobar préstamos pendientes' });

        const numCuotas = cuotas && cuotas > 0 ? parseInt(cuotas) : existing[0].cuotas;
        const cuotaSemanal = parseFloat((existing[0].monto / numCuotas).toFixed(2));

        const { rows } = await pool.query(
            `UPDATE prestamos SET estado = 'aprobado', cuotas = $1, cuota_semanal = $2,
             aprobado_en = NOW(), aprobado_por = $3 WHERE id = $4 RETURNING *`,
            [numCuotas, cuotaSemanal, req.user.id, req.params.id]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/prestamos/:id/rechazar — rechazar préstamo (solo admin)
router.patch('/:id/rechazar', requireRol('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE prestamos SET estado = 'rechazado' WHERE id = $1 AND estado = 'pendiente' RETURNING *`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(400).json({ error: 'No se pudo rechazar' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
