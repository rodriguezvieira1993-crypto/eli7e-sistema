const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/cierres — historial
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM cierres_diarios ORDER BY fecha DESC LIMIT 30'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cierres/resumen-hoy — desglose completo del día
router.get('/resumen-hoy', async (req, res) => {
    try {
        // Totales generales
        const { rows: totales } = await pool.query(`
            SELECT
                COUNT(*)::int AS total_servicios,
                COALESCE(SUM(monto), 0) AS total_facturado
            FROM servicios
            WHERE DATE(fecha_inicio) = CURRENT_DATE
              AND estado = 'completado'
        `);

        // Desglose por tipo
        const { rows: porTipo } = await pool.query(`
            SELECT
                tipo,
                COUNT(*)::int AS cantidad,
                COALESCE(SUM(monto), 0) AS subtotal
            FROM servicios
            WHERE DATE(fecha_inicio) = CURRENT_DATE
              AND estado = 'completado'
            GROUP BY tipo
            ORDER BY subtotal DESC
        `);

        // Pagos recibidos hoy (de marcas — cobranza)
        const { rows: pagosHoy } = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) AS pagos_hoy
            FROM pagos
            WHERE fecha = CURRENT_DATE
        `);

        res.json({
            total_servicios: totales[0].total_servicios,
            total_facturado: totales[0].total_facturado,
            pagos_hoy: pagosHoy[0].pagos_hoy,
            por_tipo: porTipo
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cierres/servicios-hoy — lista individual de servicios completados hoy
router.get('/servicios-hoy', async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT s.id, s.tipo, s.monto, s.descripcion,
                   s.fecha_inicio, s.estado,
                   c.nombre_marca AS cliente_nombre,
                   m.nombre AS motorizado_nombre
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            LEFT JOIN motorizados m ON m.id = s.motorizado_id
            WHERE DATE(s.fecha_inicio) = CURRENT_DATE
              AND s.estado = 'completado'
            ORDER BY s.fecha_inicio DESC
        `);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cierres/validar
router.post('/validar', requireRol('admin', 'contable'), async (req, res) => {
    const { total_cobrado, notas } = req.body;
    try {
        // Calcular totales del día
        const { rows: stats } = await pool.query(`
            SELECT COUNT(*)::int AS servicios, COALESCE(SUM(monto),0) AS facturado
            FROM servicios WHERE DATE(fecha_inicio)=CURRENT_DATE AND estado='completado'
        `);

        const { rows } = await pool.query(`
            INSERT INTO cierres_diarios (fecha, total_servicios, total_facturado, total_cobrado, estado, validado_por, validado_en, notas)
            VALUES (CURRENT_DATE, $1, $2, $3, 'validado', $4, NOW(), $5)
            ON CONFLICT (fecha) DO UPDATE SET
                total_cobrado=$3, estado='validado', validado_por=$4, validado_en=NOW(), notas=$5
            RETURNING *`,
            [stats[0].servicios, stats[0].facturado, total_cobrado, req.user.id, notas || null]
        );
        res.json({ ok: true, cierre: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
