const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const { getSemanaActual } = require('../util/weekRange');
const router = express.Router();

router.use(auth);

// Snap: cualquier fecha YYYY-MM-DD → lunes canónico de su semana (corte + TZ).
function snapLunes(fecha) {
    return getSemanaActual(new Date(fecha + 'T12:00:00Z')).lunes;
}

// ¿La nómina de ese motorizado para esa semana ya está cerrada?
async function nominaCerrada(motorizadoId, lunes) {
    const { rows } = await pool.query(
        `SELECT 1 FROM nominas WHERE motorizado_id=$1 AND semana_inicio=$2 AND estado='cerrado'`,
        [motorizadoId, lunes]
    );
    return !!rows[0];
}

// ══ CATEGORÍAS ═══════════════════════════════════════════

// GET /api/descuentos/categorias — listar categorías activas
router.get('/categorias', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM descuento_categorias WHERE activo = TRUE ORDER BY nombre ASC`
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/descuentos/categorias — crear categoría
router.post('/categorias', requireRol('admin', 'contable'), async (req, res) => {
    const nombre = (req.body.nombre || '').trim();
    if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
    if (nombre.length > 80) return res.status(400).json({ error: 'nombre máximo 80 caracteres' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO descuento_categorias (nombre) VALUES ($1) RETURNING *`, [nombre]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            // Ya existe: si estaba desactivada, reactivarla; si activa, 409.
            const { rows: ex } = await pool.query(
                `SELECT * FROM descuento_categorias WHERE nombre = $1`, [nombre]);
            if (ex[0] && !ex[0].activo) {
                const { rows: re } = await pool.query(
                    `UPDATE descuento_categorias SET activo = TRUE WHERE id = $1 RETURNING *`, [ex[0].id]);
                return res.status(200).json(re[0]);
            }
            return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/descuentos/categorias/:id — desactivar categoría (soft; los descuentos viejos la conservan)
router.delete('/categorias/:id', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE descuento_categorias SET activo = FALSE WHERE id = $1 RETURNING id`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Categoría no encontrada' });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ DESCUENTOS ═══════════════════════════════════════════

// GET /api/descuentos?semana=YYYY-MM-DD[&motorizado_id=X] — descuentos de la semana
router.get('/', requireRol('admin', 'contable'), async (req, res) => {
    const { semana, motorizado_id } = req.query;
    if (!semana || !/^\d{4}-\d{2}-\d{2}$/.test(semana))
        return res.status(400).json({ error: 'semana (YYYY-MM-DD) es requerida' });
    try {
        const lunes = snapLunes(semana);
        const params = [lunes];
        let filtroMoto = '';
        if (motorizado_id) { params.push(motorizado_id); filtroMoto = ' AND d.motorizado_id = $2'; }
        const { rows } = await pool.query(
            `SELECT d.*, m.nombre AS motorizado_nombre, c.nombre AS categoria_nombre,
                    u.nombre AS registrado_por_nombre
             FROM descuentos d
             JOIN motorizados m ON m.id = d.motorizado_id
             LEFT JOIN descuento_categorias c ON c.id = d.categoria_id
             LEFT JOIN usuarios u ON u.id = d.registrado_por
             WHERE d.semana_inicio = $1${filtroMoto}
             ORDER BY m.nombre ASC, d.creado_en ASC`,
            params
        );
        res.json({ semana_inicio: lunes, descuentos: rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/descuentos — registrar descuento por daño
// body: { motorizado_id, categoria_id, monto, descripcion, fecha (opcional, default hoy) }
router.post('/', requireRol('admin', 'contable'), async (req, res) => {
    const { motorizado_id, categoria_id, monto, descripcion, fecha } = req.body;
    if (!motorizado_id) return res.status(400).json({ error: 'motorizado_id es requerido' });
    const montoNum = parseFloat(monto);
    if (!montoNum || isNaN(montoNum) || montoNum <= 0)
        return res.status(400).json({ error: 'monto debe ser un número mayor a 0' });
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
        return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });

    try {
        const lunes = fecha ? snapLunes(fecha) : getSemanaActual().lunes;

        // La semana de destino no puede tener nómina cerrada (snapshot congelado).
        if (await nominaCerrada(motorizado_id, lunes)) {
            return res.status(409).json({
                error: `La nómina de la semana del ${lunes} ya está cerrada. Asigna el descuento a una semana abierta.`
            });
        }

        const { rows } = await pool.query(
            `INSERT INTO descuentos (motorizado_id, categoria_id, monto, descripcion, semana_inicio, registrado_por)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [motorizado_id, categoria_id || null, montoNum, (descripcion || '').trim() || null, lunes, req.user.id]
        );
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/descuentos/:id — eliminar descuento (solo si su semana sigue abierta)
router.delete('/:id', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM descuentos WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Descuento no encontrado' });
        if (await nominaCerrada(rows[0].motorizado_id, rows[0].semana_inicio)) {
            return res.status(409).json({ error: 'La nómina de esa semana ya está cerrada; el descuento es parte del snapshot y no se puede eliminar.' });
        }
        await pool.query(`DELETE FROM descuentos WHERE id = $1`, [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
