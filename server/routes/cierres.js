const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const { operationalTodaySQL, operationalDateOf } = require('../util/weekRange');
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
        // Totales generales (día operativo según TZ y corte configurados)
        const { rows: totales } = await pool.query(`
            SELECT
                COUNT(*)::int AS total_servicios,
                COALESCE(SUM(monto), 0) AS total_facturado
            FROM servicios
            WHERE ${operationalDateOf('fecha_inicio')} = ${operationalTodaySQL()}
              AND estado = 'completado'
        `);

        // Desglose por tipo
        const { rows: porTipo } = await pool.query(`
            SELECT
                tipo,
                COUNT(*)::int AS cantidad,
                COALESCE(SUM(monto), 0) AS subtotal
            FROM servicios
            WHERE ${operationalDateOf('fecha_inicio')} = ${operationalTodaySQL()}
              AND estado = 'completado'
            GROUP BY tipo
            ORDER BY subtotal DESC
        `);

        // Pagos recibidos hoy (de marcas — cobranza)
        const { rows: pagosHoy } = await pool.query(`
            SELECT COALESCE(SUM(monto), 0) AS pagos_hoy
            FROM pagos
            WHERE fecha = ${operationalTodaySQL()}
        `);

        // Verificar si hoy ya está cerrado
        const { rows: cierreHoy } = await pool.query(`
            SELECT * FROM cierres_diarios WHERE fecha = ${operationalTodaySQL()} AND estado = 'validado'
        `);

        res.json({
            total_servicios: totales[0].total_servicios,
            total_facturado: totales[0].total_facturado,
            pagos_hoy: pagosHoy[0].pagos_hoy,
            por_tipo: porTipo,
            cierre_validado: cierreHoy.length > 0,
            cierre: cierreHoy[0] || null
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
            WHERE ${operationalDateOf('s.fecha_inicio')} = ${operationalTodaySQL()}
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
        // Calcular totales del día (operativo, según TZ y corte configurados)
        const { rows: stats } = await pool.query(`
            SELECT COUNT(*)::int AS servicios, COALESCE(SUM(monto),0) AS facturado
            FROM servicios WHERE ${operationalDateOf('fecha_inicio')} = ${operationalTodaySQL()} AND estado='completado'
        `);

        const { rows } = await pool.query(`
            INSERT INTO cierres_diarios (fecha, total_servicios, total_facturado, total_cobrado, estado, validado_por, validado_en, notas)
            VALUES (${operationalTodaySQL()}, $1, $2, $3, 'validado', $4, NOW(), $5)
            ON CONFLICT (fecha) DO UPDATE SET
                total_cobrado=$3, estado='validado', validado_por=$4, validado_en=NOW(), notas=$5
            RETURNING *`,
            [stats[0].servicios, stats[0].facturado, total_cobrado, req.user.id, notas || null]
        );
        res.json({ ok: true, cierre: rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
