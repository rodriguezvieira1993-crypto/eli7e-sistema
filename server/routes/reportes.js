const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

// Auth via query param (para nuevas pestañas)
router.use((req, res, next) => {
    if (req.query.token) {
        req.headers.authorization = 'Bearer ' + req.query.token;
    }
    auth(req, res, next);
});

// ── Estilos compartidos para reportes HTML
const estilos = `
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Segoe UI',sans-serif; background:#0a0f0a; color:#e4f5e4; padding:30px; }
        .report { max-width:900px; margin:0 auto; }
        h1 { color:#00dd00; font-size:1.6rem; margin-bottom:4px; }
        .sub { color:#7a9a7a; font-size:.85rem; margin-bottom:20px; }
        .kpi-row { display:flex; gap:12px; margin-bottom:20px; }
        .kpi { flex:1; background:#0f180f; border:1px solid rgba(0,221,0,.18); border-radius:10px; padding:14px; text-align:center; }
        .kpi-val { font-size:1.4rem; font-weight:700; color:#00dd00; }
        .kpi-lbl { font-size:.75rem; color:#7a9a7a; }
        table { width:100%; border-collapse:collapse; margin-bottom:20px; }
        th { background:#0f180f; color:#00dd00; font-size:.75rem; text-transform:uppercase; padding:10px 12px; text-align:left; border-bottom:2px solid rgba(0,221,0,.18); }
        td { padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.04); font-size:.85rem; }
        tr:hover { background:rgba(0,221,0,.03); }
        .total-row { font-weight:700; border-top:2px solid rgba(0,221,0,.18); }
        .total-row td { padding-top:12px; }
        .warn { color:#FFB800; }
        .green { color:#00dd00; }
        .red { color:#FF4444; }
        .badge { padding:3px 8px; border-radius:12px; font-size:.72rem; font-weight:600; }
        .badge-green { background:rgba(0,221,0,.15); color:#00dd00; }
        .badge-yellow { background:rgba(255,184,0,.15); color:#FFB800; }
        .badge-red { background:rgba(255,68,68,.15); color:#FF4444; }
        .section { margin-bottom:24px; }
        .section-title { font-size:1rem; font-weight:700; color:#00dd00; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid rgba(0,221,0,.18); }
        .footer { text-align:center; color:#7a9a7a; font-size:.75rem; margin-top:30px; border-top:1px solid rgba(0,221,0,.18); padding-top:12px; }
        .print-bar { display:flex; justify-content:flex-end; gap:8px; margin-bottom:16px; }
        .print-bar button { padding:8px 18px; border-radius:8px; border:1px solid rgba(0,221,0,.3); background:#0f180f; color:#00dd00; font-family:inherit; font-size:.85rem; cursor:pointer; transition:all .2s; }
        .print-bar button:hover { background:#00dd00; color:#000; }
        @media print { body { background:#fff; color:#000; } th { background:#f0f0f0; color:#000; border-bottom:2px solid #000; } td { border-bottom:1px solid #ddd; } .kpi { border:1px solid #ddd; } .kpi-val, h1, .section-title, .green { color:#000; } .print-bar { display:none !important; } }
    </style>
`;

const fmt = v => '$' + parseFloat(v || 0).toFixed(2);
const hoy = () => new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const printBar = `<div class="print-bar"><button onclick="window.print()">🖨️ Imprimir</button><button onclick="window.close()">✕ Cerrar</button></div>`;

// ══ REPORTE SEMANAL ══════════════════════════════════════
router.get('/semanal', async (req, res) => {
    try {
        // Servicios de la semana (lunes a hoy)
        const { rows: servicios } = await pool.query(`
            SELECT s.tipo, c.nombre_marca,
                   COUNT(*)::int AS cantidad,
                   SUM(s.monto) AS total
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            WHERE s.fecha_inicio >= date_trunc('week', CURRENT_DATE)
              AND s.estado = 'completado'
            GROUP BY s.tipo, c.nombre_marca
            ORDER BY total DESC
        `);

        // Totales de la semana
        const { rows: totales } = await pool.query(`
            SELECT
                COUNT(*)::int AS total_servicios,
                COALESCE(SUM(monto), 0) AS total_facturado
            FROM servicios
            WHERE fecha_inicio >= date_trunc('week', CURRENT_DATE)
              AND estado = 'completado'
        `);

        // Pagos de la semana
        const { rows: pagos } = await pool.query(`
            SELECT c.nombre_marca, SUM(p.monto) AS total_pagado
            FROM pagos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.fecha >= date_trunc('week', CURRENT_DATE)::date
            GROUP BY c.nombre_marca
            ORDER BY total_pagado DESC
        `);

        const totalPagado = pagos.reduce((a, p) => a + parseFloat(p.total_pagado), 0);

        // Deudas actuales
        const { rows: deudas } = await pool.query(`
            SELECT * FROM vista_cobranza WHERE deuda_calculada > 0 ORDER BY deuda_calculada DESC
        `);

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte Semanal — Eli7e</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <h1>📊 Reporte Semanal</h1>
            <div class="sub">Semana del ${new Date(Date.now() - new Date().getDay() * 86400000).toLocaleDateString('es-VE')} al ${new Date().toLocaleDateString('es-VE')} — Generado: ${hoy()}</div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val">${totales[0].total_servicios}</div><div class="kpi-lbl">Servicios</div></div>
                <div class="kpi"><div class="kpi-val">${fmt(totales[0].total_facturado)}</div><div class="kpi-lbl">Facturado</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(totalPagado)}</div><div class="kpi-lbl">Cobrado</div></div>
                <div class="kpi"><div class="kpi-val warn">${fmt(parseFloat(totales[0].total_facturado) - totalPagado)}</div><div class="kpi-lbl">Pendiente</div></div>
            </div>

            <div class="section">
                <div class="section-title">📦 Servicios por Tipo y Marca</div>
                <table>
                    <thead><tr><th>Tipo</th><th>Marca</th><th>Cantidad</th><th>Total</th></tr></thead>
                    <tbody>
                        ${servicios.map(s => `<tr><td>${s.tipo}</td><td>${s.nombre_marca || '—'}</td><td>${s.cantidad}</td><td class="green">${fmt(s.total)}</td></tr>`).join('')}
                        <tr class="total-row"><td colspan="2"><strong>TOTAL</strong></td><td><strong>${totales[0].total_servicios}</strong></td><td class="green"><strong>${fmt(totales[0].total_facturado)}</strong></td></tr>
                    </tbody>
                </table>
            </div>

            ${pagos.length ? `
            <div class="section">
                <div class="section-title">💰 Pagos Recibidos esta Semana</div>
                <table>
                    <thead><tr><th>Marca</th><th>Total Pagado</th></tr></thead>
                    <tbody>
                        ${pagos.map(p => `<tr><td>${p.nombre_marca || '—'}</td><td class="green">${fmt(p.total_pagado)}</td></tr>`).join('')}
                        <tr class="total-row"><td><strong>TOTAL</strong></td><td class="green"><strong>${fmt(totalPagado)}</strong></td></tr>
                    </tbody>
                </table>
            </div>` : ''}

            ${deudas.length ? `
            <div class="section">
                <div class="section-title">⚠️ Deudas Pendientes Actuales</div>
                <table>
                    <thead><tr><th>Marca</th><th>Facturado</th><th>Pagado</th><th>Deuda</th></tr></thead>
                    <tbody>
                        ${deudas.map(d => `<tr><td>${d.nombre_marca}</td><td>${fmt(d.facturado_total)}</td><td>${fmt(d.pagado_total)}</td><td class="warn"><strong>${fmt(d.deuda_calculada)}</strong></td></tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}

            <div class="footer">Eli7e Sistema de Gestión — Reporte generado automáticamente</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ COBRANZAS PENDIENTES ═════════════════════════════════
router.get('/pendientes', async (req, res) => {
    try {
        const { rows: deudas } = await pool.query(`
            SELECT * FROM vista_cobranza WHERE deuda_calculada > 0 ORDER BY deuda_calculada DESC
        `);

        // Detalle de servicios por cliente con deuda
        const { rows: serviciosPend } = await pool.query(`
            SELECT s.tipo, s.monto, s.fecha_inicio, c.nombre_marca, m.nombre AS motorizado
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            LEFT JOIN motorizados m ON m.id = s.motorizado_id
            WHERE s.estado = 'completado'
              AND s.cliente_id IN (
                  SELECT id FROM vista_cobranza WHERE deuda_calculada > 0
              )
            ORDER BY c.nombre_marca, s.fecha_inicio DESC
        `);

        const totalDeuda = deudas.reduce((a, d) => a + parseFloat(d.deuda_calculada), 0);

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cobranzas Pendientes — Eli7e</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <h1>💰 Cobranzas Pendientes</h1>
            <div class="sub">Generado: ${hoy()}</div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val warn">${deudas.length}</div><div class="kpi-lbl">Marcas con Deuda</div></div>
                <div class="kpi"><div class="kpi-val warn">${fmt(totalDeuda)}</div><div class="kpi-lbl">Deuda Total</div></div>
            </div>

            <div class="section">
                <div class="section-title">📋 Detalle por Marca</div>
                <table>
                    <thead><tr><th>Marca</th><th>Servicios</th><th>Facturado</th><th>Pagado</th><th>Deuda</th><th>Estado</th></tr></thead>
                    <tbody>
                        ${deudas.map(d => {
                            const estado = parseFloat(d.deuda_calculada) > 50
                                ? '<span class="badge badge-red">🔴 Crítica</span>'
                                : parseFloat(d.deuda_calculada) > 20
                                ? '<span class="badge badge-yellow">🟡 Alerta</span>'
                                : '<span class="badge badge-green">🟢 Normal</span>';
                            return `<tr><td><strong>${d.nombre_marca}</strong></td><td>${d.servicios_pendientes}</td><td>${fmt(d.facturado_total)}</td><td>${fmt(d.pagado_total)}</td><td class="warn"><strong>${fmt(d.deuda_calculada)}</strong></td><td>${estado}</td></tr>`;
                        }).join('')}
                        <tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td class="warn"><strong>${fmt(totalDeuda)}</strong></td><td></td></tr>
                    </tbody>
                </table>
            </div>

            <div class="footer">Eli7e Sistema de Gestión — Reporte generado automáticamente</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ HISTORIAL DE CIERRES ═════════════════════════════════
router.get('/cierres', async (req, res) => {
    try {
        const { rows: cierres } = await pool.query(`
            SELECT cd.*, u.nombre AS validado_por_nombre
            FROM cierres_diarios cd
            LEFT JOIN usuarios u ON u.id = cd.validado_por
            ORDER BY cd.fecha DESC
            LIMIT 30
        `);

        const totalFact = cierres.reduce((a, c) => a + parseFloat(c.total_facturado || 0), 0);
        const totalCob = cierres.reduce((a, c) => a + parseFloat(c.total_cobrado || 0), 0);

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Historial de Cierres — Eli7e</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <h1>📅 Historial de Cierres Diarios</h1>
            <div class="sub">Últimos 30 cierres — Generado: ${hoy()}</div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val">${cierres.length}</div><div class="kpi-lbl">Cierres</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(totalFact)}</div><div class="kpi-lbl">Total Facturado</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(totalCob)}</div><div class="kpi-lbl">Total Cobrado</div></div>
                <div class="kpi"><div class="kpi-val ${totalCob - totalFact < 0 ? 'red' : 'green'}">${fmt(totalCob - totalFact)}</div><div class="kpi-lbl">Diferencia Total</div></div>
            </div>

            <div class="section">
                <table>
                    <thead><tr><th>Fecha</th><th>Servicios</th><th>Facturado</th><th>Cobrado</th><th>Diferencia</th><th>Estado</th><th>Notas</th></tr></thead>
                    <tbody>
                        ${cierres.length ? cierres.map(c => {
                            const diff = parseFloat(c.diferencia || 0);
                            return `<tr>
                                <td>${new Date(c.fecha).toLocaleDateString('es-VE')}</td>
                                <td>${c.total_servicios}</td>
                                <td>${fmt(c.total_facturado)}</td>
                                <td>${fmt(c.total_cobrado)}</td>
                                <td class="${diff < 0 ? 'red' : 'green'}">${fmt(diff)}</td>
                                <td>${c.estado === 'validado' ? '<span class="badge badge-green">✅ Validado</span>' : '<span class="badge badge-yellow">⏳ Pendiente</span>'}</td>
                                <td style="font-size:.78rem;color:#7a9a7a;">${c.notas || '—'}</td>
                            </tr>`;
                        }).join('') : '<tr><td colspan="7" style="text-align:center;color:#7a9a7a;">Sin cierres registrados</td></tr>'}
                    </tbody>
                </table>
            </div>

            <div class="footer">Eli7e Sistema de Gestión — Reporte generado automáticamente</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
