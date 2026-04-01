const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// Helper: obtener lunes de la semana para una fecha
function getLunes(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
}

function getDomingo(lunesStr) {
    const d = new Date(lunesStr);
    d.setDate(d.getDate() + 6);
    return d.toISOString().split('T')[0];
}

// GET /api/nominas/semana-actual/:motorizadoId — cálculo en tiempo real (sin cerrar)
router.get('/semana-actual/:motorizadoId', async (req, res) => {
    try {
        const motoId = req.params.motorizadoId;
        const lunes = getLunes(new Date());
        const domingo = getDomingo(lunes);

        // Monto bruto: servicios completados en la semana
        const { rows: brutoRows } = await pool.query(
            `SELECT COALESCE(SUM(monto), 0) AS monto_bruto, COUNT(*) AS total_servicios
             FROM servicios
             WHERE motorizado_id = $1 AND estado = 'completado'
               AND DATE(fecha_inicio) >= $2 AND DATE(fecha_inicio) <= $3`,
            [motoId, lunes, domingo]
        );

        // Parámetros del sistema
        const { rows: params } = await pool.query('SELECT clave, valor FROM parametros_sistema');
        const paramMap = {};
        params.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        const montoBruto = parseFloat(brutoRows[0].monto_bruto);
        const deduccionEmpresa = parseFloat((montoBruto * pctEmpresa / 100).toFixed(2));

        // Préstamos aprobados con saldo pendiente
        const { rows: prestamosActivos } = await pool.query(
            `SELECT COALESCE(SUM(cuota_semanal), 0) AS deduccion_prestamos
             FROM prestamos
             WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
            [motoId]
        );
        const deduccionPrestamos = parseFloat(prestamosActivos[0].deduccion_prestamos);
        const montoNeto = parseFloat((montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos).toFixed(2));

        res.json({
            motorizado_id: motoId,
            semana_inicio: lunes,
            semana_fin: domingo,
            total_servicios: parseInt(brutoRows[0].total_servicios),
            monto_bruto: montoBruto,
            porcentaje_empresa: pctEmpresa,
            deduccion_empresa: deduccionEmpresa,
            deduccion_moto: costoMoto,
            deduccion_prestamos: deduccionPrestamos,
            monto_neto: montoNeto
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

// GET /api/nominas/resumen-semanal — resumen de todos los motorizados para la semana actual (admin)
router.get('/resumen-semanal', requireRol('admin'), async (req, res) => {
    try {
        const lunes = req.query.semana || getLunes(new Date());
        const domingo = getDomingo(lunes);

        // Parámetros
        const { rows: params } = await pool.query('SELECT clave, valor FROM parametros_sistema');
        const paramMap = {};
        params.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        // Todos los motorizados activos
        const { rows: motos } = await pool.query(
            'SELECT id, nombre, cedula FROM motorizados WHERE activo = TRUE ORDER BY nombre'
        );

        const resumen = [];
        for (const moto of motos) {
            // Bruto semanal
            const { rows: bruto } = await pool.query(
                `SELECT COALESCE(SUM(monto), 0) AS monto_bruto, COUNT(*) AS total_servicios
                 FROM servicios WHERE motorizado_id = $1 AND estado = 'completado'
                 AND DATE(fecha_inicio) >= $2 AND DATE(fecha_inicio) <= $3`,
                [moto.id, lunes, domingo]
            );
            const montoBruto = parseFloat(bruto[0].monto_bruto);
            const deduccionEmpresa = parseFloat((montoBruto * pctEmpresa / 100).toFixed(2));

            // Préstamos
            const { rows: prest } = await pool.query(
                `SELECT COALESCE(SUM(cuota_semanal), 0) AS ded
                 FROM prestamos WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
                [moto.id]
            );
            const deduccionPrestamos = parseFloat(prest[0].ded);
            const montoNeto = parseFloat((montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos).toFixed(2));

            // ¿Ya tiene nómina cerrada esta semana?
            const { rows: nominaExist } = await pool.query(
                `SELECT id, estado FROM nominas WHERE motorizado_id = $1 AND semana_inicio = $2`,
                [moto.id, lunes]
            );

            resumen.push({
                motorizado_id: moto.id,
                nombre: moto.nombre,
                cedula: moto.cedula,
                total_servicios: parseInt(bruto[0].total_servicios),
                monto_bruto: montoBruto,
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

// POST /api/nominas/cerrar — cerrar nómina de un motorizado para una semana (admin)
router.post('/cerrar', requireRol('admin'), async (req, res) => {
    const { motorizado_id, semana_inicio } = req.body;
    if (!motorizado_id || !semana_inicio) return res.status(400).json({ error: 'motorizado_id y semana_inicio requeridos' });

    try {
        const lunes = semana_inicio;
        const domingo = getDomingo(lunes);

        // Parámetros
        const { rows: params } = await pool.query('SELECT clave, valor FROM parametros_sistema');
        const paramMap = {};
        params.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        // Bruto
        const { rows: bruto } = await pool.query(
            `SELECT COALESCE(SUM(monto), 0) AS monto_bruto
             FROM servicios WHERE motorizado_id = $1 AND estado = 'completado'
             AND DATE(fecha_inicio) >= $2 AND DATE(fecha_inicio) <= $3`,
            [motorizado_id, lunes, domingo]
        );
        const montoBruto = parseFloat(bruto[0].monto_bruto);
        const deduccionEmpresa = parseFloat((montoBruto * pctEmpresa / 100).toFixed(2));

        // Préstamos activos
        const { rows: prestActivos } = await pool.query(
            `SELECT id, cuota_semanal, saldo_pendiente FROM prestamos
             WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
            [motorizado_id]
        );
        let deduccionPrestamos = 0;
        for (const p of prestActivos) {
            const descuento = Math.min(parseFloat(p.cuota_semanal), parseFloat(p.saldo_pendiente));
            deduccionPrestamos += descuento;
            const nuevoSaldo = parseFloat((p.saldo_pendiente - descuento).toFixed(2));
            await pool.query(
                `UPDATE prestamos SET saldo_pendiente = $1${nuevoSaldo <= 0 ? ", estado = 'pagado'" : ''} WHERE id = $2`,
                [nuevoSaldo, p.id]
            );
        }

        const montoNeto = parseFloat((montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos).toFixed(2));

        // Insertar o actualizar nómina
        const { rows } = await pool.query(
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
             costoMoto, deduccionPrestamos, montoNeto, req.user.id]
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/nominas/cerrar-todas — cerrar nómina de todos los motorizados (admin)
router.post('/cerrar-todas', requireRol('admin'), async (req, res) => {
    const { semana_inicio } = req.body;
    if (!semana_inicio) return res.status(400).json({ error: 'semana_inicio requerido' });

    try {
        const { rows: motos } = await pool.query(
            'SELECT id FROM motorizados WHERE activo = TRUE'
        );

        const resultados = [];
        const lunes = semana_inicio;
        const domingo = getDomingo(lunes);
        const { rows: params } = await pool.query('SELECT clave, valor FROM parametros_sistema');
        const paramMap = {};
        params.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
        const pctEmpresa = paramMap.porcentaje_empresa || 30;
        const costoMoto = paramMap.costo_moto_semanal || 40;

        for (const moto of motos) {
            const { rows: bruto } = await pool.query(
                `SELECT COALESCE(SUM(monto), 0) AS monto_bruto
                 FROM servicios WHERE motorizado_id = $1 AND estado = 'completado'
                 AND DATE(fecha_inicio) >= $2 AND DATE(fecha_inicio) <= $3`,
                [moto.id, lunes, domingo]
            );
            const montoBruto = parseFloat(bruto[0].monto_bruto);
            const deduccionEmpresa = parseFloat((montoBruto * pctEmpresa / 100).toFixed(2));

            const { rows: prestActivos } = await pool.query(
                `SELECT id, cuota_semanal, saldo_pendiente FROM prestamos
                 WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`,
                [moto.id]
            );
            let deduccionPrestamos = 0;
            for (const p of prestActivos) {
                const descuento = Math.min(parseFloat(p.cuota_semanal), parseFloat(p.saldo_pendiente));
                deduccionPrestamos += descuento;
                const nuevoSaldo = parseFloat((p.saldo_pendiente - descuento).toFixed(2));
                await pool.query(
                    `UPDATE prestamos SET saldo_pendiente = $1${nuevoSaldo <= 0 ? ", estado = 'pagado'" : ''} WHERE id = $2`,
                    [nuevoSaldo, p.id]
                );
            }

            const montoNeto = parseFloat((montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos).toFixed(2));

            const { rows } = await pool.query(
                `INSERT INTO nominas (motorizado_id, semana_inicio, semana_fin, monto_bruto,
                 porcentaje_empresa, deduccion_empresa, deduccion_moto, deduccion_prestamos,
                 monto_neto, estado, cerrado_por, cerrado_en)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'cerrado',$10,NOW())
                 ON CONFLICT (motorizado_id, semana_inicio)
                 DO UPDATE SET monto_bruto=$4, porcentaje_empresa=$5, deduccion_empresa=$6,
                    deduccion_moto=$7, deduccion_prestamos=$8, monto_neto=$9,
                    estado='cerrado', cerrado_por=$10, cerrado_en=NOW()
                 RETURNING *`,
                [moto.id, lunes, domingo, montoBruto, pctEmpresa, deduccionEmpresa,
                 costoMoto, deduccionPrestamos, montoNeto, req.user.id]
            );
            resultados.push(rows[0]);
        }

        res.json({ cerradas: resultados.length, nominas: resultados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
