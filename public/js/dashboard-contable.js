// dashboard-contable.js
if (!requireRole('contable', 'admin')) throw new Error('redirect');
let cobranzaData = [];

async function loadCobranza() {
    const data = await apiFetch('/cobranza');
    if (!data) return;
    cobranzaData = data;

    // Llenar filtro de marcas (una sola vez)
    const selMarca = document.getElementById('filtroMarca');
    if (selMarca && selMarca.options.length <= 1) {
        data.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre_marca;
            selMarca.appendChild(opt);
        });
    }

    // KPIs
    const deudaTotal = data.reduce((a, c) => a + parseFloat(c.deuda_calculada || 0), 0);
    const criticas = data.filter(c => parseFloat(c.deuda_calculada) > 50).length;
    document.getElementById('kpi-totalDeuda').textContent = fmt(deudaTotal);
    document.getElementById('kpi-criticas').textContent = criticas;

    // Filtros
    const filtroDeuda = document.getElementById('filtroDeuda')?.value || 'todas';
    const filtroMarca = document.getElementById('filtroMarca')?.value || 'todas';
    let lista = [...data];

    if (filtroMarca !== 'todas') lista = lista.filter(c => c.id === filtroMarca);
    if (filtroDeuda === 'critica') lista = lista.filter(c => parseFloat(c.deuda_calculada) > 50);
    if (filtroDeuda === 'alerta') lista = lista.filter(c => parseFloat(c.deuda_calculada) > 20 && parseFloat(c.deuda_calculada) <= 50);
    if (filtroDeuda === 'normal') lista = lista.filter(c => parseFloat(c.deuda_calculada) <= 20 && parseFloat(c.deuda_calculada) > 0);

    lista.sort((a, b) => parseFloat(b.deuda_calculada) - parseFloat(a.deuda_calculada));

    const tbody = document.getElementById('cobranzaBody');
    tbody.innerHTML = lista.map(c => `
    <tr>
      <td><strong style="color:var(--text)">${c.nombre_marca}</strong></td>
      <td>${c.servicios_pendientes || 0}</td>
      <td>${fmt(c.facturado_total)}</td>
      <td>${fmt(c.pagado_total)}</td>
      <td style="color:${parseFloat(c.deuda_calculada) > 0 ? 'var(--warn)' : 'var(--g1)'};font-weight:700">${fmt(c.deuda_calculada)}</td>
      <td>${semaforoDeuda(c.deuda_calculada)}</td>
      <td style="display:flex;gap:6px;">
        ${parseFloat(c.deuda_calculada) > 0
            ? '<button class="btn-icon" onclick="abrirPagoRapido(\'' + c.id + '\',\'' + c.nombre_marca + '\',' + c.deuda_calculada + ')">💰 Pagar</button>' +
            '<button class="btn-icon" onclick="generarNotaPago(\'' + c.id + '\',\'' + c.nombre_marca + '\')">📄 Nota</button>'
            : '—'}
      </td>
    </tr>`).join('') || '<tr><td colspan="7">Sin datos</td></tr>';
}

// ── GENERAR NOTA DE PAGO (HTML imprimible) ──────────
async function generarNotaPago(clienteId, nombreMarca, montoPagado) {
    showToast('📄 Generando nota de pago...');

    const servicios = await apiFetch('/servicios/cliente/' + clienteId);
    if (!servicios || !servicios.length) {
        showToast('⚠ No hay servicios completados para este cliente', 'err');
        return;
    }

    const total = servicios.reduce((a, s) => a + parseFloat(s.monto || 0), 0);
    const hoy = new Date();
    const fechaNota = hoy.toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
    const numNota = 'NP-' + hoy.getFullYear() + String(hoy.getMonth() + 1).padStart(2, '0') + String(hoy.getDate()).padStart(2, '0') + '-' + clienteId.slice(0, 4).toUpperCase();

    var filasHTML = servicios.map(function (s, i) {
        var d = s.fecha_inicio ? new Date(s.fecha_inicio) : null;
        var fecha = d ? d.toLocaleDateString('es-VE') + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '—';
        return '<tr>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;">' + (i + 1) + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;">' + fecha + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;text-transform:capitalize;">' + s.tipo + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;">' + (s.motorizado_nombre || '—') + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;max-width:200px;font-size:.8rem;">' + (s.descripcion || '—') + '</td>' +
            '<td style="padding:10px 12px;border-bottom:1px solid #1a3a1a;text-align:right;font-weight:700;">$' + parseFloat(s.monto).toFixed(2) + '</td>' +
            '</tr>';
    }).join('');

    var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
        '<title>Nota de Pago — ' + nombreMarca + '</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap" rel="stylesheet">' +
        '<style>' +
        '* { margin:0; padding:0; box-sizing:border-box; }' +
        'body { font-family:"Outfit",sans-serif; background:#0a0f0a; color:#e0e0e0; padding:40px; }' +
        '.nota-container { max-width:800px; margin:0 auto; background:#111a11; border-radius:16px; border:1px solid #1a3a1a; overflow:hidden; }' +
        '.nota-header { background:linear-gradient(135deg,#0d1f0d,#1a3a1a); padding:30px 40px; display:flex; justify-content:space-between; align-items:flex-start; }' +
        '.nota-brand h1 { font-size:1.8rem; font-weight:800; background:linear-gradient(135deg,#00dd00,#00ff41); -webkit-background-clip:text; -webkit-text-fill-color:transparent; letter-spacing:-1px; }' +
        '.nota-brand span { font-size:.8rem; color:#666; display:block; margin-top:2px; }' +
        '.nota-info { text-align:right; font-size:.85rem; color:#888; }' +
        '.nota-info strong { color:#00dd00; display:block; font-size:1rem; margin-bottom:4px; }' +
        '.nota-cliente { padding:24px 40px; border-bottom:1px solid #1a3a1a; }' +
        '.nota-cliente h3 { color:#00dd00; font-size:.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }' +
        '.nota-cliente p { font-size:1.1rem; font-weight:600; }' +
        '.nota-table { width:100%; border-collapse:collapse; font-size:.88rem; }' +
        '.nota-table thead th { background:#0d1f0d; color:#00dd00; text-align:left; padding:12px; font-size:.72rem; text-transform:uppercase; letter-spacing:.5px; }' +
        '.nota-table tbody tr:hover { background:rgba(0,221,0,.03); }' +
        '.nota-total { padding:24px 40px; background:#0d1f0d; display:flex; justify-content:flex-end; align-items:center; gap:20px; }' +
        '.nota-total .label { font-size:.85rem; color:#888; }' +
        '.nota-total .amount { font-size:1.6rem; font-weight:800; color:#00dd00; }' +
        '.nota-footer { padding:20px 40px; text-align:center; font-size:.75rem; color:#555; border-top:1px solid #1a3a1a; }' +
        '.nota-actions { display:flex; gap:12px; justify-content:center; padding:20px; }' +
        '.nota-actions button { padding:12px 28px; border-radius:10px; border:none; font-family:inherit; font-weight:700; cursor:pointer; font-size:.88rem; transition:all .2s; }' +
        '.btn-print { background:linear-gradient(135deg,#00dd00,#00aa00); color:#000; }' +
        '.btn-print:hover { transform:translateY(-2px); box-shadow:0 4px 20px rgba(0,221,0,.3); }' +
        '.btn-close { background:#222; color:#888; border:1px solid #333 !important; }' +
        '.btn-close:hover { color:#fff; }' +
        '@media print { body { background:#fff; color:#111; padding:20px; }' +
        '.nota-container { border:1px solid #ddd; background:#fff; }' +
        '.nota-header { background:#f8f8f8 !important; }' +
        '.nota-brand h1 { -webkit-text-fill-color:#006600; }' +
        '.nota-info strong { color:#006600; }' +
        '.nota-cliente h3 { color:#006600; }' +
        '.nota-table thead th { background:#f0f0f0; color:#006600; }' +
        '.nota-table tbody td { border-bottom:1px solid #eee !important; color:#111; }' +
        '.nota-total { background:#f8f8f8; }' +
        '.nota-total .amount { color:#006600; }' +
        '.nota-footer { color:#999; border-top:1px solid #eee; }' +
        '.nota-actions { display:none !important; } }' +
        '</style></head><body>' +
        '<div class="nota-container">' +
        '<div class="nota-header"><div class="nota-brand"><div><h1>Eli7e</h1><span>Servicios de Mensajería &amp; Delivery</span></div></div>' +
        '<div class="nota-info"><strong>' + numNota + '</strong>Fecha: ' + fechaNota + '<br>Servicios: ' + servicios.length + '</div></div>' +
        '<div class="nota-cliente"><h3>Facturado a</h3><p>' + nombreMarca + '</p></div>' +
        '<table class="nota-table"><thead><tr>' +
        '<th>#</th><th>Fecha</th><th>Tipo</th><th>Motorizado</th><th>Detalle</th><th style="text-align:right;">Monto</th>' +
        '</tr></thead><tbody>' + filasHTML + '</tbody></table>';

    // Resumen: pago parcial vs total
    var resumenHTML = '';
    if (montoPagado && montoPagado < total) {
        var pendiente = total - montoPagado;
        resumenHTML = '<div class="nota-total" style="flex-direction:column;align-items:flex-end;gap:6px;">' +
            '<div style="display:flex;gap:20px;align-items:center;"><span class="label">TOTAL DEUDA</span><span style="font-size:1.1rem;font-weight:700;color:#888;">$' + total.toFixed(2) + '</span></div>' +
            '<div style="display:flex;gap:20px;align-items:center;"><span class="label">ABONADO</span><span style="font-size:1.1rem;font-weight:700;color:#00dd00;">$' + montoPagado.toFixed(2) + '</span></div>' +
            '<div style="display:flex;gap:20px;align-items:center;border-top:1px solid #1a3a1a;padding-top:8px;"><span class="label" style="color:#ff6b6b;">DEUDA PENDIENTE</span><span class="amount" style="color:#ff6b6b;">$' + pendiente.toFixed(2) + '</span></div>' +
            '</div>';
    } else {
        resumenHTML = '<div class="nota-total"><span class="label">TOTAL PAGADO</span><span class="amount">$' + (montoPagado || total).toFixed(2) + '</span></div>';
    }

    html += resumenHTML +
        '<div class="nota-footer">Nota de pago generada por el sistema Eli7e &middot; ' + fechaNota + '<br>Este documento es un comprobante de servicios prestados.</div>' +
        '</div>' +
        '<div class="nota-actions">' +
        '<button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>' +
        '<button class="btn-close" onclick="window.close()">Cerrar</button>' +
        '</div></body></html>';

    var w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
}

// ── Detalle de deuda al seleccionar marca ────────────
async function loadDetalleDeuda() {
    const clienteId = document.getElementById('p_cliente').value;
    const container = document.getElementById('detalleDeuda');
    if (!clienteId) { container.innerHTML = ''; return; }

    // Obtener deuda real desde el texto del dropdown (ya viene de cobranza)
    const sel = document.getElementById('p_cliente');
    const textoOpcion = sel.options[sel.selectedIndex].text;
    var deudaMatch = textoOpcion.match(/\$([0-9.]+)/);
    var deudaReal = deudaMatch ? parseFloat(deudaMatch[1]) : 0;

    const servicios = await apiFetch('/servicios/cliente/' + clienteId);
    const pagos = await apiFetch('/cobranza/pagos?cliente_id=' + clienteId) || [];

    var totalServicios = servicios ? servicios.reduce(function(a, s) { return a + parseFloat(s.monto || 0); }, 0) : 0;
    var totalPagado = pagos.filter(function(p) { return p.cliente_id === clienteId; }).reduce(function(a, p) { return a + parseFloat(p.monto || 0); }, 0);

    var html = '<div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:12px;max-height:250px;overflow-y:auto;">';

    // Servicios
    if (servicios && servicios.length) {
        html += '<div style="font-size:.72rem;color:var(--g1);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;font-weight:700;">Servicios (' + servicios.length + ')</div>';
        servicios.forEach(function(s) {
            var d = s.fecha_inicio ? new Date(s.fecha_inicio) : null;
            var fecha = d ? d.toLocaleDateString('es-VE') : '';
            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.8rem;border-bottom:1px solid rgba(255,255,255,.04);">' +
                '<span style="color:var(--muted)">' + fecha + ' · <span style="text-transform:capitalize">' + s.tipo + '</span></span>' +
                '<strong style="color:var(--text)">$' + parseFloat(s.monto).toFixed(2) + '</strong></div>';
        });
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.82rem;"><span style="color:var(--muted)">Total servicios</span><span>$' + totalServicios.toFixed(2) + '</span></div>';
    }

    // Pagos previos
    if (totalPagado > 0) {
        html += '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:.82rem;"><span style="color:#00dd00;">Pagado</span><strong style="color:#00dd00;">-$' + totalPagado.toFixed(2) + '</strong></div>';
    }

    // Deuda pendiente
    html += '<div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:6px;border-top:1px solid var(--border);">' +
        '<strong style="color:var(--g1);font-size:.82rem;">DEUDA PENDIENTE</strong>' +
        '<strong style="color:' + (deudaReal > 0 ? 'var(--warn)' : 'var(--g1)') + ';font-size:.95rem;">$' + deudaReal.toFixed(2) + '</strong>' +
        '</div></div>';

    container.innerHTML = html;

    // Auto-llenar con la deuda real
    document.getElementById('p_monto').value = deudaReal.toFixed(2);
}

async function loadCierre() {
    const hoy = new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('fechaCierre').textContent = hoy;

    const data = await apiFetch('/cierres/resumen-hoy');
    if (data) {
        // Iconos por tipo
        const iconos = {
            mototaxi: '🛵', delivery: '📦', encomienda: '📬',
            compras: '🛒', transporte: '🚐'
        };

        // Desglose por tipo
        const desglose = document.getElementById('cierreDesglose');
        if (data.por_tipo && data.por_tipo.length > 0) {
            desglose.innerHTML = data.por_tipo.map(t => `
                <div class="stat-row" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                    <span>
                        <span style="font-size:1.1rem;">${iconos[t.tipo] || '📋'}</span>
                        <strong style="text-transform:capitalize;margin-left:4px;">${t.tipo}</strong>
                        <span style="color:var(--muted);margin-left:4px;">(${t.cantidad})</span>
                    </span>
                    <strong style="color:var(--g1);">${fmt(t.subtotal)}</strong>
                </div>
            `).join('');
        } else {
            desglose.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:12px 0;">Sin servicios completados hoy</p>';
        }

        // Totales
        document.getElementById('cs-servicios').textContent = data.total_servicios || 0;
        document.getElementById('cs-facturado').textContent = fmt(data.total_facturado);
        document.getElementById('cs-pagosHoy').textContent = fmt(data.pagos_hoy);

        // Si ya fue validado — bloquear todo
        const validarCard = document.querySelector('#view-cierre .grid-2 .card:last-child');
        const checkCard = document.querySelector('#view-cierre .card:nth-child(3)');
        if (data.cierre_validado && data.cierre) {
            const c = data.cierre;
            if (validarCard) {
                validarCard.innerHTML = `
                    <div class="card-hdr">✅ Día Cerrado</div>
                    <div style="text-align:center;padding:20px;">
                        <div style="font-size:2.5rem;margin-bottom:8px;">✅</div>
                        <h3 style="color:var(--g1);margin-bottom:12px;">Cierre Validado</h3>
                        <div class="stat-row" style="margin-bottom:6px;"><span>Cobrado:</span><strong style="color:var(--g1);">${fmt(c.total_cobrado)}</strong></div>
                        <div class="stat-row" style="margin-bottom:6px;"><span>Facturado:</span><strong>${fmt(c.total_facturado)}</strong></div>
                        <div class="stat-row"><span>Diferencia:</span><strong style="color:${parseFloat(c.diferencia) < 0 ? 'var(--err)' : 'var(--g1)'};">${fmt(c.diferencia)}</strong></div>
                        ${c.notas ? '<p style="color:var(--muted);font-size:.8rem;margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">📝 ' + c.notas + '</p>' : ''}
                    </div>`;
            }
            if (checkCard) checkCard.style.display = 'none';
        } else {
            if (checkCard) checkCard.style.display = '';
        }
    }

    const hist = await apiFetch('/cierres');
    if (hist) {
        const tbody = document.getElementById('cierresHistBody');
        tbody.innerHTML = hist.map(c => `
      <tr>
        <td>${c.fecha}</td>
        <td>${c.total_servicios}</td>
        <td>${fmt(c.total_facturado)}</td>
        <td>${fmt(c.total_cobrado)}</td>
        <td style="color:${parseFloat(c.diferencia) < 0 ? 'var(--err)' : 'var(--g1)'}">${fmt(c.diferencia)}</td>
        <td>${c.estado === 'validado'
                ? '<span class="badge badge-green">✅ Validado</span>'
                : '<span class="badge badge-yellow">⏳ Pendiente</span>'}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="loading-txt">Sin cierres</td></tr>';
    }

    // Solo cargar checkboxes si NO está validado
    if (!data?.cierre_validado) {
        loadServiciosHoy();
    }
}

// ── SERVICIOS DEL DÍA CON CHECKBOXES ──────────────────
const iconosTipo = {
    mototaxi: '🛵', delivery: '📦', encomienda: '📬',
    compras: '🛒', transporte: '🚐'
};

let serviciosHoyData = [];
let filtroTipoActivo = 'todos';

async function loadServiciosHoy() {
    serviciosHoyData = await apiFetch('/cierres/servicios-hoy') || [];
    const container = document.getElementById('serviciosHoyList');

    if (serviciosHoyData.length === 0) {
        container.innerHTML = '<p style="color:var(--muted);text-align:center;padding:16px;">Sin servicios completados hoy</p>';
        document.getElementById('filtrosTipoServ').innerHTML = '';
        return;
    }

    // Generar chips de filtro
    const tipos = [...new Set(serviciosHoyData.map(s => s.tipo))];
    const filtrosEl = document.getElementById('filtrosTipoServ');
    filtrosEl.innerHTML = `
        <button class="chip-filter ${filtroTipoActivo === 'todos' ? 'active' : ''}" onclick="filtrarServiciosTipo('todos')">📊 Todos (${serviciosHoyData.length})</button>
        ${tipos.map(t => {
            const cnt = serviciosHoyData.filter(s => s.tipo === t).length;
            return `<button class="chip-filter ${filtroTipoActivo === t ? 'active' : ''}" onclick="filtrarServiciosTipo('${t}')">${iconosTipo[t] || '📋'} ${t.charAt(0).toUpperCase() + t.slice(1)} (${cnt})</button>`;
        }).join('')}
    `;

    renderServiciosHoy();
}

function renderServiciosHoy() {
    const container = document.getElementById('serviciosHoyList');
    let lista = serviciosHoyData;
    if (filtroTipoActivo !== 'todos') {
        lista = lista.filter(s => s.tipo === filtroTipoActivo);
    }

    // Agrupar por tipo
    const grupos = {};
    lista.forEach(s => {
        if (!grupos[s.tipo]) grupos[s.tipo] = [];
        grupos[s.tipo].push(s);
    });

    let html = '';
    for (const tipo in grupos) {
        const servicios = grupos[tipo];
        const subtotal = servicios.reduce((a, s) => a + parseFloat(s.monto), 0);
        const icono = iconosTipo[tipo] || '📋';

        html += `
        <div style="border-bottom:2px solid rgba(0,255,100,0.15);margin-bottom:2px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(0,255,100,0.04);">
                <span style="font-weight:700;font-size:.9rem;">
                    ${icono} ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                    <span style="color:var(--muted);font-weight:400;">(${servicios.length})</span>
                </span>
                <strong style="color:var(--g1);font-size:.9rem;">${fmt(subtotal)}</strong>
            </div>`;

        servicios.forEach(s => {
            const hora = new Date(s.fecha_inicio).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
            const cliente = s.cliente_nombre || '—';
            const moto = s.motorizado_nombre || '—';
            html += `
            <label style="display:flex;align-items:center;gap:10px;padding:7px 12px 7px 20px;border-bottom:1px solid rgba(255,255,255,0.03);cursor:pointer;transition:background .15s;"
                   onmouseover="this.style.background='rgba(0,255,100,0.04)'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="srv-check" data-monto="${s.monto}" onchange="recalcCobrados()"
                       style="width:18px;height:18px;accent-color:var(--g1);cursor:pointer;">
                <span style="flex:1;">
                    <span style="color:var(--muted);font-size:.78rem;">${hora}</span>
                    <span style="font-size:.82rem;margin-left:6px;">🏍 ${moto}</span>
                    <span style="font-size:.82rem;margin-left:4px;">· 🏪 ${cliente}</span>
                </span>
                <strong style="color:var(--g1);min-width:55px;text-align:right;font-size:.9rem;">${fmt(s.monto)}</strong>
            </label>`;
        });

        html += '</div>';
    }

    container.innerHTML = html;
    recalcCobrados();
}

function filtrarServiciosTipo(tipo) {
    filtroTipoActivo = tipo;
    // Update active chip
    document.querySelectorAll('.chip-filter').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    renderServiciosHoy();
}

function recalcCobrados() {
    const checks = document.querySelectorAll('.srv-check');
    let total = 0;
    checks.forEach(cb => {
        if (cb.checked) total += parseFloat(cb.dataset.monto || 0);
    });
    document.getElementById('sumaCobrados').textContent = fmt(total);
    document.getElementById('efectivoCobrado').value = total.toFixed(2);
}

function toggleAllServicios(checked) {
    document.querySelectorAll('.srv-check').forEach(cb => cb.checked = checked);
    recalcCobrados();
}

async function validarCierre() {
    const cobrado = parseFloat(document.getElementById('efectivoCobrado').value);
    const notas = document.getElementById('notasCierre').value;
    if (!cobrado) { showToast('❌ Ingresa el efectivo cobrado', 'err'); return; }

    const res = await apiFetch('/cierres/validar', {
        method: 'POST',
        body: { total_cobrado: cobrado, notas }
    });
    if (res?.ok) {
        showToast('✅ Cierre del día validado correctamente');
        document.getElementById('efectivoCobrado').value = '';
        document.getElementById('notasCierre').value = '';
        loadCierre();
    } else {
        showToast('❌ Error: ' + (res?.error || 'desconocido'), 'err');
    }
}

async function loadPagosForm() {
    // Cargar cobranza para tener la deuda de cada marca
    const cobData = cobranzaData.length ? cobranzaData : await apiFetch('/cobranza') || [];
    const sel = document.getElementById('p_cliente');
    sel.innerHTML = '<option value="">— Seleccionar —</option>' +
        cobData
            .filter(c => parseFloat(c.deuda_calculada) > 0)
            .sort((a, b) => parseFloat(b.deuda_calculada) - parseFloat(a.deuda_calculada))
            .map(c => '<option value="' + c.id + '">' + c.nombre_marca + ' — Deuda: ' + fmt(c.deuda_calculada) + '</option>')
            .join('');
    await loadUltimosPagos();
}

async function loadUltimosPagos() {
    const data = await apiFetch('/cobranza/pagos?limit=10');
    if (!data) return;
    const tbody = document.getElementById('ultimosPagos');
    tbody.innerHTML = data.map(p => `
    <tr>
      <td>${p.nombre_marca}</td>
      <td>${fmt(p.monto)}</td>
      <td>${p.fecha}</td>
    </tr>`).join('') || '<tr><td colspan="3" class="loading-txt">Sin pagos</td></tr>';
}

async function registrarPago(e) {
    e.preventDefault();
    const clienteId = document.getElementById('p_cliente').value;
    const sel = document.getElementById('p_cliente');
    const nombreMarca = sel.options[sel.selectedIndex].text.split(' — ')[0];
    const body = {
        cliente_id: clienteId,
        monto: parseFloat(document.getElementById('p_monto').value),
        metodo: document.querySelector('input[name="p_metodo"]:checked')?.value || 'efectivo',
        referencia: document.getElementById('p_ref').value || null,
    };
    const res = await apiFetch('/cobranza/pago', { method: 'POST', body });
    if (res?.id) {
        showToast('✅ Pago registrado correctamente');
        // Generar nota de pago automáticamente
        generarNotaPago(clienteId, nombreMarca, body.monto);
        document.getElementById('formPago').reset();
        document.getElementById('detalleDeuda').innerHTML = '';
        loadUltimosPagos();
        loadCobranza();
    } else {
        showToast('❌ Error al registrar pago', 'err');
    }
}

async function abrirPagoRapido(clienteId, nombre, deuda) {
    document.getElementById('pr_clienteId').value = clienteId;
    document.getElementById('pr_label').textContent = 'Marca: ' + nombre + ' — Deuda: ' + fmt(deuda);
    document.getElementById('pr_monto').value = parseFloat(deuda).toFixed(2);

    // Cargar detalle en modal
    const container = document.getElementById('pr_detalleDeuda');
    const servicios = await apiFetch('/servicios/cliente/' + clienteId);
    if (servicios && servicios.length) {
        container.innerHTML =
            '<div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;max-height:160px;overflow-y:auto;font-size:.8rem;">' +
            servicios.map(function (s) {
                var d = s.fecha_inicio ? new Date(s.fecha_inicio).toLocaleDateString('es-VE') : '';
                return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);">' +
                    '<span style="color:var(--muted)">' + d + ' · ' + s.tipo + '</span>' +
                    '<strong>$' + parseFloat(s.monto).toFixed(2) + '</strong></div>';
            }).join('') + '</div>';
    } else {
        container.innerHTML = '';
    }

    openModal('modalPagoRapido');
}

async function confirmarPagoRapido() {
    const body = {
        cliente_id: document.getElementById('pr_clienteId').value,
        monto: parseFloat(document.getElementById('pr_monto').value),
        metodo: document.querySelector('input[name="pr_metodo"]:checked')?.value || 'efectivo',
    };
    const res = await apiFetch('/cobranza/pago', { method: 'POST', body });
    if (res?.id) {
        showToast('✅ Pago registrado');
        closeModal('modalPagoRapido');
        loadCobranza();
    } else {
        showToast('❌ Error', 'err');
    }
}

function exportarReporte(tipo) {
    const token = localStorage.getItem('eli7e_token');
    window.open('/api/reportes/' + tipo + '?token=' + token, '_blank');
}

// ── Reporte Personalizado ─────────────────────────────
async function loadReportesView() {
    // Llenar select de clientes
    const sel = document.getElementById('rp_cliente');
    if (sel && sel.options.length <= 1) {
        const clientes = await apiFetch('/clientes');
        if (clientes && Array.isArray(clientes)) {
            clientes.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.nombre_marca;
                sel.appendChild(opt);
            });
        }
    }
    // Defaults: desde = inicio del mes, hasta = hoy
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    document.getElementById('rp_desde').value = inicio.toISOString().split('T')[0];
    document.getElementById('rp_hasta').value = hoy.toISOString().split('T')[0];
}

function generarReportePersonalizado() {
    const cliente = document.getElementById('rp_cliente').value;
    const desde = document.getElementById('rp_desde').value;
    const hasta = document.getElementById('rp_hasta').value;

    if (!desde || !hasta) {
        showToast('⚠️ Selecciona las fechas desde y hasta', 'err');
        return;
    }
    if (desde > hasta) {
        showToast('⚠️ La fecha "desde" no puede ser mayor que "hasta"', 'err');
        return;
    }

    const token = localStorage.getItem('eli7e_token');
    const url = `/api/reportes/personalizado?cliente_id=${cliente}&desde=${desde}&hasta=${hasta}&token=${token}`;
    window.open(url, '_blank');
}

// ── Init
cargarUmbralesDeuda().then(() => loadCobranza());
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'cobranza') loadCobranza();
    if (view === 'cierre') loadCierre();
    if (view === 'pagos') loadPagosForm();
    if (view === 'reportes') loadReportesView();
});
