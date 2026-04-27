const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { getSemanaActual, weekStartSQL, weekWindow } = require('../util/weekRange');
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
        td.editable { cursor:text; border-left:2px solid rgba(0,221,0,.25); padding-left:10px; }
        td.editable:hover { background:rgba(0,221,0,.04); }
        td.editable:focus { outline:none; background:rgba(0,221,0,.10); border-left:2px solid #00dd00; }
        td.editing-saving { background:rgba(255,184,0,.15) !important; }
        td.editing-saved { background:rgba(0,221,0,.18) !important; transition:background .8s; }
        td.editing-error { background:rgba(255,68,68,.18) !important; }
        tr:hover { background:rgba(0,221,0,.03); }
        tr.row-deleting { opacity:0.4; text-decoration:line-through; }
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
        .btn-del { background:transparent; border:1px solid rgba(255,68,68,.3); color:#FF4444; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:.85rem; transition:all .2s; }
        .btn-del:hover { background:#FF4444; color:#fff; }
        .info-bar { background:rgba(0,221,0,.08); border:1px solid rgba(0,221,0,.18); border-radius:8px; padding:10px 14px; margin-bottom:16px; font-size:.82rem; color:#7a9a7a; }
        .info-bar strong { color:#00dd00; }
        #editor-toast { position:fixed; bottom:20px; right:20px; padding:12px 18px; border-radius:10px; font-size:.85rem; font-weight:600; z-index:9999; box-shadow:0 4px 14px rgba(0,0,0,.4); transform:translateY(100px); opacity:0; transition:all .3s; }
        #editor-toast.show { transform:translateY(0); opacity:1; }
        #editor-toast.ok { background:#00dd00; color:#000; }
        #editor-toast.warn { background:#FFB800; color:#000; }
        #editor-toast.err { background:#FF4444; color:#fff; }
        @media print { body { background:#fff; color:#000; } th { background:#f0f0f0; color:#000; border-bottom:2px solid #000; } td { border-bottom:1px solid #ddd; cursor:default; } td.editable { border-left:none; padding-left:12px; } td:focus { background:none; } .kpi { border:1px solid #ddd; } .kpi-val, h1, .section-title, .green { color:#000; } .print-bar, .btn-del, .col-acciones, #editor-toast, .info-bar { display:none !important; } }
    </style>
    <script>
    // Editor inline de servicios desde reportes — Fix bugs 1, 2 y 5 (2026-04-25).
    // Antes: contenteditable global + ningún handler = la edición era decorativa.
    // Ahora: solo celdas con .editable y data-id/data-campo persisten al backend
    // vía PUT /api/servicios/:id, y un botón 🗑️ por fila llama DELETE.
    (function(){
        // Token del query string para rehidratar el header Authorization.
        // Es la misma forma que usa el resto del reporte (router.use lo lee de ?token=).
        const params = new URLSearchParams(location.search);
        const token = params.get('token') || localStorage.getItem('eli7e_token') || '';

        function toast(msg, tipo) {
            tipo = tipo || 'ok';
            let el = document.getElementById('editor-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'editor-toast';
                document.body.appendChild(el);
            }
            el.textContent = msg;
            el.className = tipo + ' show';
            clearTimeout(el._t);
            el._t = setTimeout(function(){ el.className = tipo; }, 3500);
        }

        function fmtMonto(n) { return '$' + parseFloat(n || 0).toFixed(2); }

        async function api(url, opts) {
            opts = opts || {};
            opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
            if (token) opts.headers['Authorization'] = 'Bearer ' + token;
            const r = await fetch(url, opts);
            const data = await r.json().catch(function(){ return null; });
            return { ok: r.ok, status: r.status, data: data };
        }

        // Convierte dd/mm/yyyy o d/m/yyyy a YYYY-MM-DD. Si ya viene en ISO, lo deja.
        function parseFecha(input) {
            const s = String(input).trim();
            const iso = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
            if (iso) return s;
            const dmy = s.match(/^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$/);
            if (dmy) {
                return dmy[3] + '-' + String(dmy[2]).padStart(2,'0') + '-' + String(dmy[1]).padStart(2,'0');
            }
            return null;
        }

        // Validar y construir el payload PUT según el campo editado
        function buildPayload(campo, valor) {
            valor = String(valor).trim();
            if (campo === 'monto') {
                const n = parseFloat(valor.replace(/[$\\s,]/g, ''));
                if (isNaN(n) || n < 0) return { error: 'Monto inválido (escribe un número, ej: 3.50)' };
                return { body: { monto: n }, displayed: fmtMonto(n) };
            }
            if (campo === 'fecha_inicio') {
                const iso = parseFecha(valor);
                if (!iso) return { error: 'Fecha inválida (usa formato dd/mm/yyyy)' };
                // Mantener la hora actual si existe el atributo data-hora
                return { body: { fecha_inicio: iso + 'T12:00:00' }, displayed: new Date(iso + 'T12:00:00').toLocaleDateString('es-VE') };
            }
            if (campo === 'descripcion') {
                if (!valor) return { error: 'La descripción no puede quedar vacía' };
                return { body: { descripcion: valor }, displayed: valor };
            }
            return { error: 'Campo no editable: ' + campo };
        }

        async function chequearNominaCerrada(motoId, fechaIso) {
            if (!motoId || !fechaIso) return false;
            const fecha = fechaIso.split('T')[0];
            try {
                const r = await api('/api/nominas/esta-cerrada?motorizado_id=' + encodeURIComponent(motoId) + '&fecha=' + encodeURIComponent(fecha));
                return !!(r.data && r.data.cerrada);
            } catch { return false; }
        }

        async function guardarCelda(td) {
            const id = td.getAttribute('data-id');
            const campo = td.getAttribute('data-campo');
            const motoId = td.getAttribute('data-motorizado-id') || td.closest('tr')?.getAttribute('data-motorizado-id');
            const fechaIso = td.getAttribute('data-fecha-iso') || td.closest('tr')?.getAttribute('data-fecha-iso');
            const valorOriginal = td.getAttribute('data-valor-original');
            const valorNuevo = td.textContent;

            if (valorNuevo === valorOriginal) return; // sin cambio

            const parsed = buildPayload(campo, valorNuevo);
            if (parsed.error) {
                td.classList.add('editing-error');
                toast('❌ ' + parsed.error, 'err');
                td.textContent = valorOriginal;
                setTimeout(function(){ td.classList.remove('editing-error'); }, 1500);
                return;
            }

            td.classList.add('editing-saving');
            const r = await api('/api/servicios/' + id, { method: 'PUT', body: JSON.stringify(parsed.body) });
            td.classList.remove('editing-saving');

            if (!r.ok) {
                td.classList.add('editing-error');
                td.textContent = valorOriginal;
                toast('❌ ' + ((r.data && r.data.error) || 'Error al guardar'), 'err');
                setTimeout(function(){ td.classList.remove('editing-error'); }, 1500);
                return;
            }

            td.textContent = parsed.displayed;
            td.setAttribute('data-valor-original', parsed.displayed);
            td.classList.add('editing-saved');
            setTimeout(function(){ td.classList.remove('editing-saved'); }, 1200);

            // Aviso si el cambio cae sobre una semana con nómina cerrada
            const cerrada = await chequearNominaCerrada(motoId, fechaIso);
            if (cerrada) {
                toast('⚠ Guardado, pero la nómina del motorizado de esa semana ya está cerrada y NO se modifica', 'warn');
            } else {
                toast('✅ Guardado', 'ok');
            }
        }

        async function eliminarFila(btn) {
            const tr = btn.closest('tr');
            const id = tr.getAttribute('data-id');
            const desc = tr.getAttribute('data-desc') || 'este servicio';
            if (!confirm('¿Eliminar ' + desc + '?\\n\\nEsta acción NO se puede deshacer.')) return;
            tr.classList.add('row-deleting');
            const r = await api('/api/servicios/' + id, { method: 'DELETE' });
            if (r.ok) {
                tr.remove();
                toast('🗑️ Servicio eliminado', 'ok');
            } else {
                tr.classList.remove('row-deleting');
                toast('❌ ' + ((r.data && r.data.error) || 'Error al eliminar'), 'err');
            }
        }

        document.addEventListener('DOMContentLoaded', function(){
            // Editables: blur guarda, Enter confirma (sin saltar línea), Escape cancela.
            document.querySelectorAll('td.editable').forEach(function(td){
                td.setAttribute('contenteditable', 'true');
                td.setAttribute('data-valor-original', td.textContent.trim());
                td.addEventListener('blur', function(){ guardarCelda(td); });
                td.addEventListener('keydown', function(e){
                    if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
                    if (e.key === 'Escape') { td.textContent = td.getAttribute('data-valor-original'); td.blur(); }
                });
            });
            // Botones eliminar
            document.querySelectorAll('.btn-del').forEach(function(btn){
                btn.addEventListener('click', function(){ eliminarFila(btn); });
            });
        });
    })();
    </script>
`;

const fmt = v => '$' + parseFloat(v || 0).toFixed(2);
const hoy = () => new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const printBar = `<div class="print-bar"><button onclick="window.print()">🖨️ Imprimir</button><button onclick="window.close()">✕ Cerrar</button></div>`;

// ══ REPORTE SEMANAL ══════════════════════════════════════
router.get('/semanal', async (req, res) => {
    try {
        // Servicios de la semana (ventana canónica, corte 1 AM del lunes)
        const { rows: servicios } = await pool.query(`
            SELECT s.tipo, c.nombre_marca,
                   COUNT(*)::int AS cantidad,
                   SUM(s.monto) AS total
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            WHERE s.fecha_inicio >= ${weekStartSQL()}
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
            WHERE fecha_inicio >= ${weekStartSQL()}
              AND estado = 'completado'
        `);

        // Pagos de la semana
        const { rows: pagos } = await pool.query(`
            SELECT c.nombre_marca, SUM(p.monto) AS total_pagado
            FROM pagos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.fecha >= ${weekStartSQL()}::date
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

// ══ FACTURA POR CLIENTE ══════════════════════════════════
router.get('/factura/:clienteId', async (req, res) => {
    try {
        const { clienteId } = req.params;

        // Datos del cliente
        const { rows: cli } = await pool.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
        if (!cli[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
        const cliente = cli[0];

        // Servicios completados
        const { rows: servicios } = await pool.query(`
            SELECT s.*, m.nombre AS motorizado_nombre
            FROM servicios s
            LEFT JOIN motorizados m ON m.id = s.motorizado_id
            WHERE s.cliente_id = $1 AND s.estado = 'completado'
            ORDER BY s.fecha_inicio DESC
        `, [clienteId]);

        // Pagos realizados
        const { rows: pagos } = await pool.query(`
            SELECT * FROM pagos WHERE cliente_id = $1 ORDER BY fecha DESC
        `, [clienteId]);

        const totalFacturado = servicios.reduce((a, s) => a + parseFloat(s.monto || 0), 0);
        const totalPagado = pagos.reduce((a, p) => a + parseFloat(p.monto || 0), 0);
        const deuda = totalFacturado - totalPagado;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factura — ${cliente.nombre_marca}</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                    <h1>🧾 Estado de Cuenta</h1>
                    <div class="sub">${cliente.nombre_marca} — Generado: ${hoy()}</div>
                </div>
                <div style="text-align:right;font-size:.82rem;color:#7a9a7a;">
                    <div><strong style="color:#00dd00;">Eli7e Delivery</strong></div>
                    ${cliente.email ? '<div>📧 ' + cliente.email + '</div>' : ''}
                    ${cliente.telefono ? '<div>📞 ' + cliente.telefono + '</div>' : ''}
                    ${cliente.rif ? '<div>RIF: ' + cliente.rif + '</div>' : ''}
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val">${servicios.length}</div><div class="kpi-lbl">Servicios</div></div>
                <div class="kpi"><div class="kpi-val">${fmt(totalFacturado)}</div><div class="kpi-lbl">Total Facturado</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(totalPagado)}</div><div class="kpi-lbl">Total Pagado</div></div>
                <div class="kpi"><div class="kpi-val ${deuda > 0 ? 'warn' : 'green'}">${fmt(deuda)}</div><div class="kpi-lbl">Saldo Pendiente</div></div>
            </div>

            <div class="section">
                <div class="section-title">📦 Detalle de Servicios</div>
                <div class="info-bar">
                    <strong>💡 Edición rápida:</strong> haz click en la <strong>fecha</strong>, <strong>monto</strong> o <strong>ubicación</strong> para editarlos. Los cambios se guardan al salir de la celda y se reflejan en cobranza, KPIs y nóminas en vivo. <strong>Las nóminas ya cerradas mantienen su monto histórico</strong>.
                </div>
                <table>
                    <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Ubicación / Destino</th><th>Motorizado</th><th>Monto</th><th class="col-acciones">Acciones</th></tr></thead>
                    <tbody>
                        ${servicios.map((s, i) => {
                            const fechaIso = new Date(s.fecha_inicio).toISOString();
                            const fechaLocal = new Date(s.fecha_inicio).toLocaleDateString('es-VE');
                            return `<tr data-id="${s.id}" data-motorizado-id="${s.motorizado_id || ''}" data-fecha-iso="${fechaIso}" data-desc="${(s.descripcion || s.tipo).replace(/"/g, '&quot;')}">
                            <td>${i + 1}</td>
                            <td class="editable" data-id="${s.id}" data-campo="fecha_inicio">${fechaLocal}</td>
                            <td style="text-transform:capitalize;">${s.tipo}</td>
                            <td class="editable" data-id="${s.id}" data-campo="descripcion" style="font-size:.82rem;">${s.descripcion || '—'}</td>
                            <td>${s.motorizado_nombre || '—'}</td>
                            <td class="green editable" data-id="${s.id}" data-campo="monto">${fmt(s.monto)}</td>
                            <td class="col-acciones"><button class="btn-del" title="Eliminar este servicio">🗑️</button></td>
                        </tr>`;
                        }).join('')}
                        <tr class="total-row">
                            <td colspan="5"><strong>TOTAL FACTURADO</strong></td>
                            <td class="green"><strong>${fmt(totalFacturado)}</strong></td>
                            <td class="col-acciones"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            ${pagos.length ? `
            <div class="section">
                <div class="section-title">💰 Pagos Registrados</div>
                <table>
                    <thead><tr><th>Fecha</th><th>Monto</th><th>Referencia</th></tr></thead>
                    <tbody>
                        ${pagos.map(p => `<tr>
                            <td>${new Date(p.fecha).toLocaleDateString('es-VE')}</td>
                            <td class="green">${fmt(p.monto)}</td>
                            <td style="color:#7a9a7a;">${p.referencia || '—'}</td>
                        </tr>`).join('')}
                        <tr class="total-row">
                            <td><strong>TOTAL PAGADO</strong></td>
                            <td class="green"><strong>${fmt(totalPagado)}</strong></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>` : ''}

            <div style="text-align:center;padding:20px;background:#0f180f;border-radius:10px;border:1px solid rgba(0,221,0,.18);margin-bottom:20px;">
                <div style="font-size:.85rem;color:#7a9a7a;margin-bottom:4px;">SALDO PENDIENTE</div>
                <div style="font-size:2rem;font-weight:800;color:${deuda > 0 ? '#FFB800' : '#00dd00'};">${fmt(deuda)}</div>
            </div>

            <div class="footer">Eli7e Sistema de Gestión — Estado de cuenta generado automáticamente</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ REPORTE PERSONALIZADO ════════════════════════════════
router.get('/personalizado', async (req, res) => {
    try {
        const { cliente_id, desde, hasta } = req.query;
        if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos' });

        const isAll = !cliente_id || cliente_id === 'todos';

        // Servicios en el rango
        let srvQuery = `
            SELECT s.*, c.nombre_marca AS cliente_nombre, m.nombre AS motorizado_nombre
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            LEFT JOIN motorizados m ON m.id = s.motorizado_id
            WHERE DATE(s.fecha_inicio) >= $1 AND DATE(s.fecha_inicio) <= $2
        `;
        const srvParams = [desde, hasta];
        if (!isAll) {
            srvQuery += ' AND s.cliente_id = $3';
            srvParams.push(cliente_id);
        }
        srvQuery += ' ORDER BY s.fecha_inicio DESC';
        const { rows: servicios } = await pool.query(srvQuery, srvParams);

        // Pagos en el rango
        let pagQuery = `SELECT p.*, c.nombre_marca AS cliente_nombre FROM pagos p LEFT JOIN clientes c ON c.id = p.cliente_id WHERE DATE(p.fecha) >= $1 AND DATE(p.fecha) <= $2`;
        const pagParams = [desde, hasta];
        if (!isAll) {
            pagQuery += ' AND p.cliente_id = $3';
            pagParams.push(cliente_id);
        }
        pagQuery += ' ORDER BY p.fecha DESC';
        const { rows: pagos } = await pool.query(pagQuery, pagParams);

        // Cliente info
        let clienteNombre = 'Todas las marcas';
        if (!isAll) {
            const { rows: cli } = await pool.query('SELECT nombre_marca FROM clientes WHERE id=$1', [cliente_id]);
            clienteNombre = cli[0]?.nombre_marca || 'Cliente';
        }

        const totalServicios = servicios.length;
        const totalFacturado = servicios.reduce((a, s) => a + parseFloat(s.monto || 0), 0);
        const totalPagado = pagos.reduce((a, p) => a + parseFloat(p.monto || 0), 0);
        const saldo = totalFacturado - totalPagado;

        // Resumen por marca (si es "todos")
        let resumenMarcas = '';
        if (isAll && servicios.length) {
            const marcas = {};
            servicios.forEach(s => {
                let m = s.cliente_nombre || '';
                if (!m && s.descripcion) {
                    const match = s.descripcion.match(/Cliente:\s*([^|]+)/i);
                    if (match) m = match[1].trim();
                }
                if (!m) m = 'Sin marca';
                if (!marcas[m]) marcas[m] = { servicios: 0, facturado: 0 };
                marcas[m].servicios++;
                marcas[m].facturado += parseFloat(s.monto || 0);
            });
            resumenMarcas = `
            <div class="section">
                <div class="section-title">📊 Resumen por Marca</div>
                <table>
                    <thead><tr><th>Marca</th><th>Servicios</th><th>Facturado</th></tr></thead>
                    <tbody>
                        ${Object.entries(marcas).sort((a, b) => b[1].facturado - a[1].facturado).map(([nombre, d]) =>
                            `<tr><td><strong>${nombre}</strong></td><td>${d.servicios}</td><td class="green">${fmt(d.facturado)}</td></tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>`;
        }

        const fmtFecha = d => new Date(d + 'T12:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'short', year: 'numeric' });

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Reporte ${clienteNombre} — ${fmtFecha(desde)} a ${fmtFecha(hasta)}</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <h1>📊 Reporte Personalizado</h1>
            <div class="sub">${clienteNombre} — ${fmtFecha(desde)} al ${fmtFecha(hasta)}</div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val">${totalServicios}</div><div class="kpi-lbl">Servicios</div></div>
                <div class="kpi"><div class="kpi-val">${fmt(totalFacturado)}</div><div class="kpi-lbl">Facturado</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(totalPagado)}</div><div class="kpi-lbl">Pagado</div></div>
                <div class="kpi"><div class="kpi-val ${saldo > 0 ? 'warn' : 'green'}">${fmt(saldo)}</div><div class="kpi-lbl">Saldo</div></div>
            </div>

            ${resumenMarcas}

            <div class="section">
                <div class="section-title">📦 Detalle de Servicios (${totalServicios})</div>
                <div class="info-bar">
                    <strong>💡 Edición rápida:</strong> haz click en la <strong>fecha</strong>, <strong>monto</strong> o <strong>ubicación</strong> para editarlos. Los cambios se guardan al salir de la celda y se reflejan en cobranza, KPIs y nóminas en vivo. <strong>Las nóminas ya cerradas mantienen su monto histórico</strong> — si editas un servicio de una semana cerrada, te lo avisaremos.
                </div>
                <table>
                    <thead><tr><th>#</th><th>Fecha</th>${isAll ? '<th>Marca</th>' : ''}<th>Tipo</th><th>Ubicación / Destino</th><th>Motorizado</th><th>Monto</th><th>Estado</th><th class="col-acciones">Acciones</th></tr></thead>
                    <tbody>
                        ${servicios.map((s, i) => {
                            // Fallback: extraer nombre del cliente de la descripción si no hay cliente_id
                            let clienteLabel = s.cliente_nombre || '—';
                            if (clienteLabel === '—' && s.descripcion) {
                                const m = s.descripcion.match(/Cliente:\\s*([^|]+)/i);
                                if (m) clienteLabel = m[1].trim();
                            }
                            const fechaIso = new Date(s.fecha_inicio).toISOString();
                            const fechaLocal = new Date(s.fecha_inicio).toLocaleDateString('es-VE');
                            return `<tr data-id="${s.id}" data-motorizado-id="${s.motorizado_id || ''}" data-fecha-iso="${fechaIso}" data-desc="${(s.descripcion || s.tipo).replace(/"/g, '&quot;')}">
                            <td>${i + 1}</td>
                            <td class="editable" data-id="${s.id}" data-campo="fecha_inicio">${fechaLocal}</td>
                            ${isAll ? '<td>' + clienteLabel + '</td>' : ''}
                            <td style="text-transform:capitalize;">${s.tipo}</td>
                            <td class="editable" data-id="${s.id}" data-campo="descripcion" style="font-size:.82rem;">${s.descripcion || '—'}</td>
                            <td>${s.motorizado_nombre || '—'}</td>
                            <td class="green editable" data-id="${s.id}" data-campo="monto">${fmt(s.monto)}</td>
                            <td>${s.estado === 'completado' ? '<span class="badge badge-green">✓</span>' : '<span class="badge badge-yellow">Pend</span>'}</td>
                            <td class="col-acciones"><button class="btn-del" title="Eliminar este servicio">🗑️</button></td>
                        </tr>`;
                        }).join('') || `<tr><td colspan="${isAll ? 9 : 8}">Sin servicios en este rango</td></tr>`}
                        <tr class="total-row">
                            <td colspan="${isAll ? 6 : 5}"><strong>TOTAL</strong></td>
                            <td class="green"><strong>${fmt(totalFacturado)}</strong></td>
                            <td></td>
                            <td class="col-acciones"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            ${pagos.length ? `
            <div class="section">
                <div class="section-title">💰 Pagos Registrados (${pagos.length})</div>
                <table>
                    <thead><tr><th>Fecha</th>${isAll ? '<th>Marca</th>' : ''}<th>Monto</th><th>Referencia</th></tr></thead>
                    <tbody>
                        ${pagos.map(p => `<tr>
                            <td>${new Date(p.fecha).toLocaleDateString('es-VE')}</td>
                            ${isAll ? '<td>' + (p.cliente_nombre || '—') + '</td>' : ''}
                            <td class="green">${fmt(p.monto)}</td>
                            <td style="color:#7a9a7a;">${p.referencia || '—'}</td>
                        </tr>`).join('')}
                        <tr class="total-row">
                            <td ${isAll ? 'colspan="2"' : ''}><strong>TOTAL PAGADO</strong></td>
                            <td class="green"><strong>${fmt(totalPagado)}</strong></td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>` : ''}

            <div style="text-align:center;padding:20px;background:#0f180f;border-radius:10px;border:1px solid rgba(0,221,0,.18);margin-bottom:20px;">
                <div style="font-size:.85rem;color:#7a9a7a;margin-bottom:4px;">BALANCE DEL PERÍODO</div>
                <div style="font-size:2rem;font-weight:800;color:${saldo > 0 ? '#FFB800' : '#00dd00'};">${fmt(saldo)}</div>
            </div>

            <div class="footer">Eli7e Sistema de Gestión — Reporte personalizado generado automáticamente</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ RECIBO DE NÓMINA (motorizado) ═══════════════════════
router.get('/nomina/:motorizadoId', async (req, res) => {
    try {
        const motoId = req.params.motorizadoId;
        const semana = req.query.semana; // opcional: lunes de la semana

        // Datos del motorizado
        const { rows: motoRows } = await pool.query('SELECT * FROM motorizados WHERE id = $1', [motoId]);
        if (!motoRows[0]) return res.status(404).json({ error: 'Motorizado no encontrado' });
        const moto = motoRows[0];

        // Si se pide semana específica, buscar nómina cerrada; si no, calcular en vivo
        let nomina;
        if (semana) {
            const { rows: nomRows } = await pool.query(
                'SELECT * FROM nominas WHERE motorizado_id = $1 AND semana_inicio = $2', [motoId, semana]
            );
            nomina = nomRows[0];
        }

        if (!nomina) {
            // Calcular en vivo (semana actual) con corte canónico 1 AM
            const lunes = semana || getSemanaActual().lunes;
            const domD = new Date(lunes); domD.setDate(domD.getDate() + 6);
            const domingo = new Date(domD.getTime() - domD.getTimezoneOffset() * 60000).toISOString().split('T')[0];

            // Bruto normal (se aplica porcentaje empresa)
            const { rows: brutoRows } = await pool.query(
                `SELECT COALESCE(SUM(monto), 0) AS monto_bruto, COUNT(*) AS total_servicios
                 FROM servicios WHERE motorizado_id = $1 AND estado = 'completado'
                 AND ${weekWindow('fecha_inicio', '$2')}
                 AND (pago_completo IS NULL OR pago_completo = FALSE)`,
                [motoId, lunes]
            );
            // Bruto pago_completo (sin porcentaje empresa)
            const { rows: completoRows } = await pool.query(
                `SELECT COALESCE(SUM(monto), 0) AS monto_completo, COUNT(*) AS total_completos
                 FROM servicios WHERE motorizado_id = $1 AND estado = 'completado'
                 AND ${weekWindow('fecha_inicio', '$2')}
                 AND pago_completo = TRUE`,
                [motoId, lunes]
            );
            const { rows: params } = await pool.query('SELECT clave, valor FROM parametros_sistema');
            const paramMap = {}; params.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
            const pctEmpresa = paramMap.porcentaje_empresa || 30;
            const costoMoto = paramMap.costo_moto_semanal || 40;
            const montoBrutoNormal = parseFloat(brutoRows[0].monto_bruto);
            const montoBrutoCompleto = parseFloat(completoRows[0].monto_completo);
            const montoBruto = montoBrutoNormal + montoBrutoCompleto;
            const totalServicios = parseInt(brutoRows[0].total_servicios) + parseInt(completoRows[0].total_completos);
            const deduccionEmpresa = parseFloat((montoBrutoNormal * pctEmpresa / 100).toFixed(2));

            const { rows: prestActivos } = await pool.query(
                `SELECT COALESCE(SUM(cuota_semanal), 0) AS ded FROM prestamos
                 WHERE motorizado_id = $1 AND estado = 'aprobado' AND saldo_pendiente > 0`, [motoId]
            );
            const deduccionPrestamos = parseFloat(prestActivos[0].ded);
            const montoNeto = parseFloat((montoBruto - deduccionEmpresa - costoMoto - deduccionPrestamos).toFixed(2));

            nomina = {
                semana_inicio: lunes, semana_fin: domingo,
                total_servicios: totalServicios,
                monto_bruto: montoBruto, porcentaje_empresa: pctEmpresa,
                deduccion_empresa: deduccionEmpresa, deduccion_moto: costoMoto,
                deduccion_prestamos: deduccionPrestamos, monto_neto: montoNeto,
                estado: 'estimado'
            };
        }

        // Servicios de esa semana (misma ventana canónica)
        const { rows: servicios } = await pool.query(
            `SELECT s.tipo, s.monto, s.descripcion, s.fecha_inicio, c.nombre_marca
             FROM servicios s LEFT JOIN clientes c ON c.id = s.cliente_id
             WHERE s.motorizado_id = $1 AND s.estado = 'completado'
             AND ${weekWindow('s.fecha_inicio', '$2')}
             ORDER BY s.fecha_inicio ASC`,
            [motoId, nomina.semana_inicio]
        );

        const estadoLabel = nomina.estado === 'cerrado' ? '<span class="badge badge-green">CERRADA</span>'
            : '<span class="badge badge-yellow">ESTIMADO</span>';

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo Nómina — ${moto.nombre}</title>${estilos}</head><body>
        <div class="report">
            ${printBar}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                    <h1>🧾 Recibo de Nómina</h1>
                    <div class="sub">${moto.nombre} — Semana ${nomina.semana_inicio} al ${nomina.semana_fin}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:.82rem;color:#7a9a7a;">${estadoLabel}</div>
                    <div style="font-size:.78rem;color:#7a9a7a;margin-top:4px;">Cédula: ${moto.cedula || '—'}</div>
                </div>
            </div>

            <div class="kpi-row">
                <div class="kpi"><div class="kpi-val">${nomina.total_servicios || servicios.length}</div><div class="kpi-lbl">Servicios</div></div>
                <div class="kpi"><div class="kpi-val">${fmt(nomina.monto_bruto)}</div><div class="kpi-lbl">Bruto</div></div>
                <div class="kpi"><div class="kpi-val red">-${fmt(parseFloat(nomina.deduccion_empresa) + parseFloat(nomina.deduccion_moto) + parseFloat(nomina.deduccion_prestamos))}</div><div class="kpi-lbl">Deducciones</div></div>
                <div class="kpi"><div class="kpi-val green">${fmt(nomina.monto_neto)}</div><div class="kpi-lbl">Neto a Cobrar</div></div>
            </div>

            <div class="section">
                <div class="section-title">📦 Servicios Completados</div>
                <table>
                    <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Cliente</th><th>Detalle</th><th>Monto</th></tr></thead>
                    <tbody>
                        ${servicios.map((s, i) => `<tr>
                            <td>${i + 1}</td>
                            <td>${new Date(s.fecha_inicio).toLocaleDateString('es-VE')}</td>
                            <td style="text-transform:capitalize;">${s.tipo}</td>
                            <td>${s.nombre_marca || (s.descripcion && s.descripcion.match(/Cliente:\s*([^|]+)/i) ? s.descripcion.match(/Cliente:\s*([^|]+)/i)[1].trim() : '—')}</td>
                            <td style="font-size:.82rem;">${s.descripcion || '—'}</td>
                            <td class="green">${fmt(s.monto)}</td>
                        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#7a9a7a;">Sin servicios esta semana</td></tr>'}
                        ${servicios.length ? `<tr class="total-row"><td colspan="5"><strong>TOTAL BRUTO</strong></td><td class="green"><strong>${fmt(nomina.monto_bruto)}</strong></td></tr>` : ''}
                    </tbody>
                </table>
            </div>

            <div class="section">
                <div class="section-title">📉 Deducciones</div>
                <table>
                    <thead><tr><th>Concepto</th><th>Detalle</th><th>Monto</th></tr></thead>
                    <tbody>
                        <tr><td>Porcentaje empresa</td><td>${nomina.porcentaje_empresa}% del bruto</td><td class="red">-${fmt(nomina.deduccion_empresa)}</td></tr>
                        <tr><td>Uso de moto</td><td>Tarifa semanal fija</td><td class="red">-${fmt(nomina.deduccion_moto)}</td></tr>
                        <tr><td>Préstamos</td><td>Cuotas activas</td><td class="red">-${fmt(nomina.deduccion_prestamos)}</td></tr>
                        <tr class="total-row"><td colspan="2"><strong>TOTAL DEDUCCIONES</strong></td><td class="red"><strong>-${fmt(parseFloat(nomina.deduccion_empresa) + parseFloat(nomina.deduccion_moto) + parseFloat(nomina.deduccion_prestamos))}</strong></td></tr>
                    </tbody>
                </table>
            </div>

            <div style="text-align:center;padding:24px;background:#0f180f;border-radius:10px;border:2px solid rgba(0,221,0,.3);margin-bottom:20px;">
                <div style="font-size:.85rem;color:#7a9a7a;margin-bottom:4px;">MONTO NETO A COBRAR</div>
                <div style="font-size:2.4rem;font-weight:900;color:#00dd00;">${fmt(nomina.monto_neto)}</div>
            </div>

            <div class="footer">Eli7e Sistema de Gestión — Recibo de nómina generado el ${hoy()}</div>
        </div></body></html>`;

        res.send(html);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
