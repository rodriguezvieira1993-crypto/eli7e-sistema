const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const { getSemanaActual } = require('../util/weekRange');
const router = express.Router();

router.use(auth);

const round2 = (n) => parseFloat(Number(n).toFixed(2));

function getDomingo(lunesStr) {
    const d = new Date(lunesStr);
    d.setDate(d.getDate() + 6);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

function snapLunes(fecha) {
    return getSemanaActual(new Date(fecha + 'T12:00:00Z')).lunes;
}

async function nominaColabCerrada(colaboradorId, lunes, q = pool) {
    const { rows } = await q.query(
        `SELECT 1 FROM nominas_colaborador WHERE colaborador_id=$1 AND semana_inicio=$2 AND estado='cerrado'`,
        [colaboradorId, lunes]
    );
    return !!rows[0];
}

async function deduccionesSemana(colaboradorId, lunes, q = pool) {
    const { rows } = await q.query(
        `SELECT COALESCE(SUM(monto),0) AS m, COUNT(*) AS c
         FROM descuentos_colaborador WHERE colaborador_id = $1 AND semana_inicio = $2`,
        [colaboradorId, lunes]
    );
    return { monto: parseFloat(rows[0].m), count: parseInt(rows[0].c) };
}

// ══ COLABORADORES (CRUD) ═════════════════════════════════

// GET /api/colaboradores — listar activos
router.get('/', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM colaboradores WHERE activo = TRUE ORDER BY nombre ASC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/colaboradores — crear (solo admin)
router.post('/', requireRol('admin'), async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    const sueldo = parseFloat(req.body.sueldo_semanal);
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    if (isNaN(sueldo) || sueldo < 0) return res.status(400).json({ error: 'sueldo_semanal debe ser un número >= 0' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO colaboradores (nombre, sueldo_semanal) VALUES ($1,$2) RETURNING *`,
            [nombre, sueldo]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un colaborador con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/colaboradores/:id — editar nombre/sueldo (solo admin)
router.put('/:id', requireRol('admin'), async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    const sueldo = parseFloat(req.body.sueldo_semanal);
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    if (isNaN(sueldo) || sueldo < 0) return res.status(400).json({ error: 'sueldo_semanal debe ser un número >= 0' });
    try {
        const { rows } = await pool.query(
            `UPDATE colaboradores SET nombre=$1, sueldo_semanal=$2 WHERE id=$3 RETURNING *`,
            [nombre, sueldo, req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Colaborador no encontrado' });
        res.json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un colaborador con ese nombre' });
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/colaboradores/:id — desactivar (soft delete, solo admin)
router.delete('/:id', requireRol('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE colaboradores SET activo=FALSE WHERE id=$1 RETURNING id`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Colaborador no encontrado' });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ DESCUENTOS DE COLABORADOR ═════════════════════════════

// GET /api/colaboradores/descuentos?semana=YYYY-MM-DD
router.get('/descuentos', requireRol('admin', 'contable'), async (req, res) => {
    const { semana } = req.query;
    if (!semana || !/^\d{4}-\d{2}-\d{2}$/.test(semana))
        return res.status(400).json({ error: 'semana (YYYY-MM-DD) es requerida' });
    try {
        const lunes = snapLunes(semana);
        const { rows } = await pool.query(
            `SELECT d.*, c.nombre AS colaborador_nombre, cat.nombre AS categoria_nombre,
                    u.nombre AS registrado_por_nombre
             FROM descuentos_colaborador d
             JOIN colaboradores c ON c.id = d.colaborador_id
             LEFT JOIN descuento_categorias cat ON cat.id = d.categoria_id
             LEFT JOIN usuarios u ON u.id = d.registrado_por
             WHERE d.semana_inicio = $1
             ORDER BY c.nombre ASC, d.creado_en ASC`,
            [lunes]
        );
        res.json({ semana_inicio: lunes, descuentos: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/colaboradores/descuentos — registrar deducción
router.post('/descuentos', requireRol('admin', 'contable'), async (req, res) => {
    const { colaborador_id, categoria_id, monto, descripcion, fecha } = req.body;
    if (!colaborador_id) return res.status(400).json({ error: 'colaborador_id es requerido' });
    const montoNum = parseFloat(monto);
    if (!montoNum || isNaN(montoNum) || montoNum <= 0)
        return res.status(400).json({ error: 'monto debe ser un número mayor a 0' });
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
        return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });

    try {
        const lunes = fecha ? snapLunes(fecha) : getSemanaActual().lunes;
        if (await nominaColabCerrada(colaborador_id, lunes)) {
            return res.status(409).json({
                error: `La nómina de la semana del ${lunes} ya está cerrada. Asigna la deducción a una semana abierta.`
            });
        }
        const { rows } = await pool.query(
            `INSERT INTO descuentos_colaborador (colaborador_id, categoria_id, monto, descripcion, semana_inicio, registrado_por)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [colaborador_id, categoria_id || null, montoNum, (descripcion || '').trim() || null, lunes, req.user.id]
        );
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/colaboradores/descuentos/:id
router.delete('/descuentos/:id', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM descuentos_colaborador WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Deducción no encontrada' });
        if (await nominaColabCerrada(rows[0].colaborador_id, rows[0].semana_inicio)) {
            return res.status(409).json({ error: 'La nómina de esa semana ya está cerrada; la deducción es parte del snapshot y no se puede eliminar.' });
        }
        await pool.query(`DELETE FROM descuentos_colaborador WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ NÓMINA DE COLABORADORES ═══════════════════════════════

// GET /api/colaboradores/nomina/resumen-semanal?semana=YYYY-MM-DD
router.get('/nomina/resumen-semanal', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const raw = req.query.semana;
        const lunes = (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) ? snapLunes(raw) : getSemanaActual().lunes;
        const domingo = getDomingo(lunes);

        const { rows: colabs } = await pool.query(
            `SELECT id, nombre, sueldo_semanal FROM colaboradores WHERE activo = TRUE ORDER BY nombre ASC`
        );

        const resumen = [];
        for (const c of colabs) {
            const { rows: existing } = await pool.query(
                `SELECT * FROM nominas_colaborador WHERE colaborador_id=$1 AND semana_inicio=$2`,
                [c.id, lunes]
            );
            const cerrada = existing[0] && existing[0].estado === 'cerrado';

            if (cerrada) {
                const n = existing[0];
                resumen.push({
                    colaborador_id: c.id, nombre: c.nombre,
                    sueldo_base: parseFloat(n.sueldo_base),
                    deduccion_total: parseFloat(n.deduccion_total),
                    monto_neto: parseFloat(n.monto_neto),
                    nomina_id: n.id, nomina_estado: 'cerrado'
                });
                continue;
            }

            const ded = await deduccionesSemana(c.id, lunes);
            const sueldoBase = parseFloat(c.sueldo_semanal);
            const neto = round2(sueldoBase - ded.monto);
            resumen.push({
                colaborador_id: c.id, nombre: c.nombre,
                sueldo_base: sueldoBase,
                deduccion_total: ded.monto,
                deduccion_count: ded.count,
                monto_neto: neto,
                nomina_id: existing[0]?.id || null,
                nomina_estado: existing[0]?.estado || null
            });
        }

        res.json({ semana_inicio: lunes, semana_fin: domingo, colaboradores: resumen });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/colaboradores/nomina/cerrar — cerrar nómina de un colaborador para una semana
router.post('/nomina/cerrar', requireRol('admin', 'contable'), async (req, res) => {
    const { colaborador_id, semana_inicio } = req.body;
    if (!colaborador_id || !semana_inicio) return res.status(400).json({ error: 'colaborador_id y semana_inicio requeridos' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semana_inicio)) return res.status(400).json({ error: 'semana_inicio debe tener formato YYYY-MM-DD' });

    const lunes = snapLunes(semana_inicio);
    const domingo = getDomingo(lunes);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { rows: colab } = await client.query(`SELECT * FROM colaboradores WHERE id=$1`, [colaborador_id]);
        if (!colab[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Colaborador no encontrado' }); }

        const ded = await deduccionesSemana(colaborador_id, lunes, client);
        const sueldoBase = parseFloat(colab[0].sueldo_semanal);
        const neto = round2(sueldoBase - ded.monto);

        const { rows } = await client.query(
            `INSERT INTO nominas_colaborador (colaborador_id, semana_inicio, semana_fin, sueldo_base, deduccion_total, monto_neto, estado, cerrado_por, cerrado_en)
             VALUES ($1,$2,$3,$4,$5,$6,'cerrado',$7,NOW())
             ON CONFLICT (colaborador_id, semana_inicio)
             DO UPDATE SET sueldo_base=$4, deduccion_total=$5, monto_neto=$6, estado='cerrado', cerrado_por=$7, cerrado_en=NOW()
             RETURNING *`,
            [colaborador_id, lunes, domingo, sueldoBase, ded.monto, neto, req.user.id]
        );

        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
