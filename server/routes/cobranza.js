const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/cobranza — vista resumen de deuda por cliente
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM vista_cobranza ORDER BY deuda_calculada DESC');
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cobranza/pagos — últimos pagos
router.get('/pagos', async (req, res) => {
    const limit = req.query.limit || 20;
    try {
        const { rows } = await pool.query(
            `SELECT p.*, c.nombre_marca FROM pagos p
       LEFT JOIN clientes c ON c.id = p.cliente_id
       ORDER BY p.creado_en DESC LIMIT $1`, [limit]
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cobranza/pago — registrar pago
router.post('/pago', requireRol('admin', 'contable'), async (req, res) => {
    const { cliente_id, monto, metodo, referencia } = req.body;
    if (!cliente_id || !monto) return res.status(400).json({ error: 'cliente_id y monto requeridos' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO pagos (cliente_id, monto, metodo, referencia, registrado_por)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [cliente_id, monto, metodo || 'efectivo', referencia || null, req.user.id]
        );
        // Actualizar saldo cliente
        await pool.query(
            'UPDATE clientes SET saldo_pendiente = GREATEST(0, saldo_pendiente - $1) WHERE id=$2',
            [monto, cliente_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cobranza/enviar/:id — enviar reporte por email a cliente
router.post('/enviar/:id', requireRol('admin', 'contable'), async (req, res) => {
    // Pendiente: integración Gmail Semana 3
    res.json({ ok: true, msg: 'Correo en cola (Gmail disponible en Semana 3)' });
});

// POST /api/cobranza/enviar-masivo
router.post('/enviar-masivo', requireRol('admin'), async (req, res) => {
    res.json({ ok: true, count: 0, msg: 'Envío masivo disponible en Semana 3' });
});

module.exports = router;
