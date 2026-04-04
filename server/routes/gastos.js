const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/gastos — listar gastos (con filtros opcionales)
router.get('/', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { desde, hasta, categoria } = req.query;
        let query = 'SELECT g.*, u.nombre AS registrado_por_nombre FROM gastos g LEFT JOIN usuarios u ON u.id = g.registrado_por';
        const params = [];
        const where = [];

        if (desde) {
            params.push(desde);
            where.push(`g.fecha >= $${params.length}`);
        }
        if (hasta) {
            params.push(hasta);
            where.push(`g.fecha <= $${params.length}`);
        }
        if (categoria && categoria !== 'todas') {
            params.push(categoria);
            where.push(`g.categoria = $${params.length}`);
        }

        if (where.length) query += ' WHERE ' + where.join(' AND ');
        query += ' ORDER BY g.fecha DESC, g.creado_en DESC';

        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/gastos/resumen — resumen por categoría del mes actual
router.get('/resumen', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        let dateFilter = '';
        const params = [];

        if (desde && hasta) {
            params.push(desde, hasta);
            dateFilter = `WHERE g.fecha >= $1 AND g.fecha <= $2`;
        } else {
            dateFilter = `WHERE g.fecha >= DATE_TRUNC('month', CURRENT_DATE)`;
        }

        const { rows: porCategoria } = await pool.query(`
            SELECT g.categoria, COUNT(*)::int AS cantidad, COALESCE(SUM(g.monto), 0) AS total
            FROM gastos g ${dateFilter}
            GROUP BY g.categoria ORDER BY total DESC
        `, params);

        const { rows: totalRows } = await pool.query(`
            SELECT COALESCE(SUM(g.monto), 0) AS total_gastos, COUNT(*)::int AS total_registros
            FROM gastos g ${dateFilter}
        `, params);

        res.json({
            total_gastos: parseFloat(totalRows[0].total_gastos),
            total_registros: totalRows[0].total_registros,
            por_categoria: porCategoria
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/gastos — crear gasto
router.post('/', requireRol('admin', 'contable'), async (req, res) => {
    const { descripcion, monto, categoria, fecha, nota } = req.body;
    if (!descripcion || !monto) return res.status(400).json({ error: 'Descripción y monto son requeridos' });

    try {
        const { rows } = await pool.query(
            `INSERT INTO gastos (descripcion, monto, categoria, fecha, nota, registrado_por)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [descripcion, monto, categoria || 'otros', fecha || new Date().toISOString().split('T')[0], nota || null, req.user.id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/gastos/:id — editar gasto
router.put('/:id', requireRol('admin', 'contable'), async (req, res) => {
    const { descripcion, monto, categoria, fecha, nota } = req.body;
    try {
        const { rows } = await pool.query(
            `UPDATE gastos SET descripcion=COALESCE($1,descripcion), monto=COALESCE($2,monto),
             categoria=COALESCE($3,categoria), fecha=COALESCE($4,fecha), nota=COALESCE($5,nota)
             WHERE id=$6 RETURNING *`,
            [descripcion, monto, categoria, fecha, nota, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Gasto no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/gastos/:id — eliminar gasto
router.delete('/:id', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rowCount } = await pool.query('DELETE FROM gastos WHERE id=$1', [req.params.id]);
        if (!rowCount) return res.status(404).json({ error: 'Gasto no encontrado' });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
