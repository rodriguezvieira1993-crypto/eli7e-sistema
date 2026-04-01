const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/servicios
router.get('/', async (req, res) => {
    try {
        const { estado, hoy, limit, motorizado_id, desde, hasta } = req.query;
        let query = `
      SELECT s.*, c.nombre_marca AS cliente_nombre, m.nombre AS motorizado_nombre,
             EXISTS(SELECT 1 FROM notas_entrega n WHERE n.servicio_id = s.id) AS tiene_nota
      FROM servicios s
      LEFT JOIN clientes c ON c.id = s.cliente_id
      LEFT JOIN motorizados m ON m.id = s.motorizado_id
    `;
        const params = [];
        const where = [];

        if (estado) {
            const dbEstado = estado === 'en_curso' ? 'pendiente' : estado;
            params.push(dbEstado);
            where.push(`s.estado = $${params.length}`);
        }
        if (hoy) where.push(`DATE(s.fecha_inicio) = CURRENT_DATE`);
        if (motorizado_id) {
            params.push(motorizado_id);
            where.push(`s.motorizado_id = $${params.length}`);
        }
        if (desde) {
            params.push(desde);
            where.push(`DATE(s.fecha_inicio) >= $${params.length}`);
        }
        if (hasta) {
            params.push(hasta);
            where.push(`DATE(s.fecha_inicio) <= $${params.length}`);
        }
        if (where.length) query += ' WHERE ' + where.join(' AND ');
        query += ' ORDER BY s.fecha_inicio DESC';
        const limiteSeguro = Math.min(Math.max(parseInt(limit) || 100, 1), 1000);
        params.push(limiteSeguro);
        query += ` LIMIT $${params.length}`;

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/servicios/cliente/:id — servicios de un cliente (para nota de pago)
router.get('/cliente/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT s.*, m.nombre AS motorizado_nombre
            FROM servicios s
            LEFT JOIN motorizados m ON m.id = s.motorizado_id
            WHERE s.cliente_id = $1 AND s.estado = 'completado'
            ORDER BY s.fecha_inicio DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/servicios
router.post('/', requireRol('admin', 'call_center'), async (req, res) => {
    const { tipo, cliente_id, motorizado_id, monto, descripcion } = req.body;
    if (!tipo || !monto) return res.status(400).json({ error: 'tipo y monto son requeridos' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO servicios (tipo, cliente_id, motorizado_id, monto, descripcion, operador_id, estado)
       VALUES ($1,$2,$3,$4,$5,$6,'pendiente') RETURNING *`,
            [tipo, cliente_id || null, motorizado_id || null, monto, descripcion || null, req.user.id]
        );
        // Marcar motorizado como en servicio
        if (motorizado_id) {
            await pool.query("UPDATE motorizados SET estado='en_servicio' WHERE id=$1", [motorizado_id]);
        }
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/servicios/:id/cerrar
router.patch('/:id/cerrar', requireRol('admin', 'call_center'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE servicios SET estado='completado', fecha_fin=NOW() WHERE id=$1 RETURNING *`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
        // Liberar motorizado
        if (rows[0].motorizado_id) {
            await pool.query("UPDATE motorizados SET estado='disponible' WHERE id=$1", [rows[0].motorizado_id]);
        }
        // Generar nota de entrega
        await pool.query('INSERT INTO notas_entrega (servicio_id) VALUES ($1)', [rows[0].id]);
        res.json({ ok: true, servicio: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/servicios/:id — editar servicio
router.put('/:id', requireRol('admin', 'call_center'), async (req, res) => {
    const { tipo, cliente_id, motorizado_id, monto, descripcion } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE servicios SET tipo=COALESCE($1,tipo), cliente_id=COALESCE($2,cliente_id),
             motorizado_id=COALESCE($3,motorizado_id), monto=COALESCE($4,monto),
             descripcion=COALESCE($5,descripcion) WHERE id=$6
             RETURNING *`,
            [tipo, cliente_id, motorizado_id, monto, descripcion, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Servicio no encontrado' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/servicios/:id — eliminar servicio
router.delete('/:id', requireRol('admin', 'call_center'), async (req, res) => {
    try {
        // Obtener el servicio antes de borrar para liberar moto
        const { rows: srv } = await pool.query('SELECT * FROM servicios WHERE id=$1', [req.params.id]);
        if (!srv[0]) return res.status(404).json({ error: 'Servicio no encontrado' });

        // Borrar notas de entrega asociadas
        await pool.query('DELETE FROM notas_entrega WHERE servicio_id=$1', [req.params.id]);
        // Borrar servicio
        await pool.query('DELETE FROM servicios WHERE id=$1', [req.params.id]);

        // Liberar motorizado si estaba en servicio
        if (srv[0].motorizado_id && srv[0].estado === 'pendiente') {
            await pool.query("UPDATE motorizados SET estado='disponible' WHERE id=$1", [srv[0].motorizado_id]);
        }
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
