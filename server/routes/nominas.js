const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const { getSemanaActual, weekWindow } = require('../util/weekRange');
const router = express.Router();

router.use(auth);

function getDomingo(lunesStr) {
    const d = new Date(lunesStr);
    d.setDate(d.getDate() + 6);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

const round2 = (n) => parseFloat(Number(n).toFixed(2));

// Lee los parámetros del sistema como mapa { clave: numero }.
async function getParamMap(q = pool) {
    const { rows } = await q.query('SELECT clave, valor FROM parametros_sistema');
    const m = {};
    rows.forEach(p => m[p.clave] = parseFloat(p.valor));
    return m;
}

// Cuota total de préstamos activos del motorizado (lo que tocaría descontar esta semana).
async function prestamosCuota(motoId, q = pool) {
    const { rows } = await q.query(
        `SELECT COALESCE(SUM(cuota_semanal), 0) AS ded
         FROM prestamos WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
        [motoId]
    );
    return parseFloat(rows[0].ded);
}

// Calcula los brutos de la nómina de la semana W (lunes) para un motorizado.
// Estrictamente la ventana semanal [lunes {corte}, lunes+7d {corte}) — nada de semanas anteriores.
async function calcBrutos(motoId, lunes, q = pool) {
    const params = [motoId, lunes];

    // Bruto normal (se le aplica % empresa)
    const { rows: norm } = await q.query(
        `SELECT COALESCE(SUM(monto),0) AS m, COUNT(*) AS c FROM servicios
         WHERE motorizado_id=$1 AND estado='completado' AND ${weekWindow('fecha_inicio', '$2')}
           AND (pago_completo IS NULL OR pago_completo=FALSE)`, params);
    // Bruto pago_completo (va íntegro, sin %)
    const { rows: comp } = await q.query(
        `SELECT COALESCE(SUM(monto),0) AS m, COUNT(*) AS c FROM servicios
         WHERE motorizado_id=$1 AND estado='completado' AND ${weekWindow('fecha_inicio', '$2')}
           AND pago_completo=TRUE`, params);

    return {
        brutoNormal: parseFloat(norm[0].m),
        brutoCompleto: parseFloat(comp[0].m),
        totalServicios: parseInt(norm[0].c) + parseInt(comp[0].c),
    };
}

// GET /api/nominas/semana-actual/:motorizadoId — cálculo en tiempo real (sin cerrar)
router.get('/semana-actual/:motorizadoId', async (req, res) => {
    try {
        const motoId = req.params.motorizadoId;
        const { lunes, domingo } = getSemanaActual();

        const paramMap = await getParamMap();
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        // ¿La semana actual ya está cerrada? Mostrar el snapshot guardado, no recalcular.
        const { rows: nx } = await pool.query(
            `SELECT * FROM nominas WHERE motorizado_id=$1 AND semana_inicio=$2`, [motoId, lunes]);
        if (nx[0] && nx[0].estado === 'cerrado') {
            const n = nx[0];
            const { rows: cnt } = await pool.query(
                `SELECT COUNT(*) AS c FROM servicios WHERE pagado_en_nomina_id=$1`, [n.id]);
            return res.json({
                motorizado_id: motoId, semana_inicio: lunes, semana_fin: domingo,
                total_servicios: parseInt(cnt[0].c),
                monto_bruto: parseFloat(n.monto_bruto), monto_pago_completo: 0,
                porcentaje_empresa: parseFloat(n.porcentaje_empresa),
                deduccion_empresa: parseFloat(n.deduccion_empresa),
                deduccion_moto: parseFloat(n.deduccion_moto),
                deduccion_prestamos: parseFloat(n.deduccion_prestamos),
                monto_neto: parseFloat(n.monto_neto), cerrada: true
            });
        }

        // Semana abierta: bruto = solo servicios de esta semana.
        const b = await calcBrutos(motoId, lunes);
        const montoBruto = b.brutoNormal + b.brutoCompleto;
        const deduccionEmpresa = round2(b.brutoNormal * pctEmpresa / 100);
        const deduccionPrestamos = await prestamosCuota(motoId);
        const montoNeto = round2(montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos);

        res.json({
            motorizado_id: motoId,
            semana_inicio: lunes,
            semana_fin: domingo,
            total_servicios: b.totalServicios,
            monto_bruto: montoBruto,
            monto_pago_completo: b.brutoCompleto,
            porcentaje_empresa: pctEmpresa,
            deduccion_empresa: deduccionEmpresa,
            deduccion_moto: costoMoto,
            deduccion_prestamos: deduccionPrestamos,
            monto_neto: montoNeto,
            cerrada: false
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/nominas/esta-cerrada?motorizado_id=X&fecha=YYYY-MM-DD
// Devuelve { cerrada: true|false } indicando si la nómina del motorizado para la
// semana que contiene esa fecha ya fue cerrada. Lo usa la edición desde reportes
// para advertir al usuario que el cambio NO modifica la nómina ya cobrada.
router.get('/esta-cerrada', async (req, res) => {
    const { motorizado_id, fecha } = req.query;
    if (!motorizado_id || !fecha) return res.status(400).json({ error: 'motorizado_id y fecha son requeridos' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'fecha debe tener formato YYYY-MM-DD' });
    try {
        const { rows } = await pool.query(
            `SELECT id, semana_inicio, semana_fin, estado FROM nominas
             WHERE motorizado_id = $1
               AND semana_inicio <= $2::date
               AND semana_fin >= $2::date
             ORDER BY semana_inicio DESC LIMIT 1`,
            [motorizado_id, fecha]
        );
        res.json({
            cerrada: !!(rows[0] && rows[0].estado === 'cerrado'),
            nomina: rows[0] || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/nominas/historial/:motorizadoId — nóminas cerradas
router.get('/historial/:motorizadoId', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM nominas WHERE motorizado_id = $1 ORDER BY semana_inicio DESC`,
            [req.params.motorizadoId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/nominas/resumen-semanal — resumen de todos los motorizados para una semana (admin + contable)
// Cualquier fecha recibida se ajusta (snap) al LUNES de su semana según corte/TZ.
// Ej: pedir "2026-06-22" o "2026-06-24" siempre trae la ventana 2026-06-22 -> 2026-06-28.
router.get('/resumen-semanal', requireRol('admin', 'contable'), async (req, res) => {
    try {
        const raw = req.query.semana;
        const lunes = (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw))
            ? getSemanaActual(new Date(raw + 'T12:00:00Z')).lunes
            : getSemanaActual().lunes;
        const domingo = getDomingo(lunes);

        // Parámetros
        const paramMap = await getParamMap();
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        // Todos los motorizados activos
        const { rows: motos } = await pool.query(
            'SELECT id, nombre, cedula FROM motorizados WHERE activo = TRUE ORDER BY nombre'
        );

        const resumen = [];
        for (const moto of motos) {
            // ¿Ya tiene nómina cerrada esta semana?
            const { rows: nominaExist } = await pool.query(
                `SELECT id, estado FROM nominas WHERE motorizado_id = $1 AND semana_inicio = $2`,
                [moto.id, lunes]
            );
            const cerrada = nominaExist[0] && nominaExist[0].estado === 'cerrado';

            if (cerrada) {
                // Mostrar el snapshot guardado (lo que realmente se pagó).
                const n = nominaExist[0];
                const { rows: full } = await pool.query(`SELECT * FROM nominas WHERE id=$1`, [n.id]);
                const { rows: cnt } = await pool.query(
                    `SELECT COUNT(*) AS c FROM servicios WHERE pagado_en_nomina_id=$1`, [n.id]);
                const f = full[0];
                resumen.push({
                    motorizado_id: moto.id, nombre: moto.nombre, cedula: moto.cedula,
                    total_servicios: parseInt(cnt[0].c),
                    monto_bruto: parseFloat(f.monto_bruto), monto_pago_completo: 0,
                    deduccion_empresa: parseFloat(f.deduccion_empresa),
                    deduccion_moto: parseFloat(f.deduccion_moto),
                    deduccion_prestamos: parseFloat(f.deduccion_prestamos),
                    monto_neto: parseFloat(f.monto_neto),
                    nomina_id: n.id, nomina_estado: 'cerrado'
                });
                continue;
            }

            // Semana abierta: bruto = solo servicios de esta semana.
            const b = await calcBrutos(moto.id, lunes);
            const montoBruto = b.brutoNormal + b.brutoCompleto;
            const deduccionEmpresa = round2(b.brutoNormal * pctEmpresa / 100);
            const deduccionPrestamos = await prestamosCuota(moto.id);
            const montoNeto = round2(montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos);

            resumen.push({
                motorizado_id: moto.id,
                nombre: moto.nombre,
                cedula: moto.cedula,
                total_servicios: b.totalServicios,
                monto_bruto: montoBruto,
                monto_pago_completo: b.brutoCompleto,
                deduccion_empresa: deduccionEmpresa,
                deduccion_moto: costoMoto,
                deduccion_prestamos: deduccionPrestamos,
                monto_neto: montoNeto,
                nomina_id: nominaExist[0]?.id || null,
                nomina_estado: nominaExist[0]?.estado || null
            });
        }

        res.json({ semana_inicio: lunes, semana_fin: domingo, motorizados: resumen });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/nominas/cerrar — cerrar nómina de un motorizado para una semana (admin + contable)
router.post('/cerrar', requireRol('admin', 'contable'), async (req, res) => {
    const { motorizado_id, semana_inicio } = req.body;
    if (!motorizado_id || !semana_inicio) return res.status(400).json({ error: 'motorizado_id y semana_inicio requeridos' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semana_inicio)) return res.status(400).json({ error: 'semana_inicio debe tener formato YYYY-MM-DD' });

    // Snap al lunes real de la semana (igual que el resumen).
    const lunes = getSemanaActual(new Date(semana_inicio + 'T12:00:00Z')).lunes;
    const domingo = getDomingo(lunes);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const paramMap = await getParamMap(client);
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        // ¿Ya existía esta nómina? (recierre) — para idempotencia.
        const { rows: ex } = await client.query(
            `SELECT id, estado, deduccion_prestamos FROM nominas
             WHERE motorizado_id=$1 AND semana_inicio=$2`, [motorizado_id, lunes]);
        const yaCerrada = ex[0] && ex[0].estado === 'cerrado';

        // Brutos: SOLO servicios de esta semana (ventana semanal estricta).
        const b = await calcBrutos(motorizado_id, lunes, client);
        const montoBruto = b.brutoNormal + b.brutoCompleto;
        const deduccionEmpresa = round2(b.brutoNormal * pctEmpresa / 100);

        // Préstamo: SOLO se cobra (y se baja el saldo) en el PRIMER cierre de esta semana.
        // Al recerrar se mantiene la deducción ya guardada para no descontar dos veces.
        let deduccionPrestamos;
        if (yaCerrada) {
            deduccionPrestamos = parseFloat(ex[0].deduccion_prestamos) || 0;
        } else {
            const { rows: prestActivos } = await client.query(
                `SELECT id, cuota_semanal, saldo_pendiente FROM prestamos
                 WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
                [motorizado_id]);
            deduccionPrestamos = 0;
            for (const p of prestActivos) {
                const descuento = Math.min(parseFloat(p.cuota_semanal), parseFloat(p.saldo_pendiente));
                deduccionPrestamos += descuento;
                const nuevoSaldo = round2(p.saldo_pendiente - descuento);
                await client.query(
                    `UPDATE prestamos SET saldo_pendiente = $1${nuevoSaldo <= 0 ? ", estado = 'pagado'" : ''} WHERE id = $2`,
                    [nuevoSaldo, p.id]);
            }
        }

        const montoNeto = round2(montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos);

        // Insertar o actualizar nómina
        const { rows } = await client.query(
            `INSERT INTO nominas (motorizado_id, semana_inicio, semana_fin, monto_bruto,
             porcentaje_empresa, deduccion_empresa, deduccion_moto, deduccion_prestamos,
             monto_neto, estado, cerrado_por, cerrado_en)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cerrado',$10,NOW())
             ON CONFLICT (motorizado_id, semana_inicio)
             DO UPDATE SET monto_bruto=$4, porcentaje_empresa=$5, deduccion_empresa=$6,
                deduccion_moto=$7, deduccion_prestamos=$8, monto_neto=$9,
                estado='cerrado', cerrado_por=$10, cerrado_en=NOW()
             RETURNING *`,
            [motorizado_id, lunes, domingo, montoBruto, pctEmpresa, deduccionEmpresa,
             costoMoto, deduccionPrestamos, montoNeto, req.user.id]);
        const nominaId = rows[0].id;

        // Marcar como pagados (rastro contable, no afecta cálculo) los servicios de ESTA
        // semana que componen la nómina — evita ambigüedad sobre qué nómina pagó qué.
        await client.query(
            `UPDATE servicios SET pagado_en_nomina_id=$3
             WHERE motorizado_id=$1 AND estado='completado' AND ${weekWindow('fecha_inicio', '$2')}
               AND (pagado_en_nomina_id IS NULL OR pagado_en_nomina_id=$3)`,
            [motorizado_id, lunes, nominaId]);

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
