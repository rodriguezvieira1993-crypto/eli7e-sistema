// dashboard-contable.js
let cobranzaData = [];

async function loadCobranza() {
    const data = await apiFetch('/cobranza');
    if (!data) return;
    cobranzaData = data;

    // KPIs
    const deudaTotal = data.reduce((a, c) => a + parseFloat(c.deuda_calculada || 0), 0);
    const criticas = data.filter(c => parseFloat(c.deuda_calculada) > 50).length;
    document.getElementById('kpi-totalDeuda').textContent = fmt(deudaTotal);
    document.getElementById('kpi-criticas').textContent = criticas;

    const filtro = document.getElementById('filtroDeuda')?.value || 'todas';
    let lista = [...data];
    if (filtro === 'critica') lista = lista.filter(c => parseFloat(c.deuda_calculada) > 50);
    if (filtro === 'alerta') lista = lista.filter(c => parseFloat(c.deuda_calculada) > 20 && parseFloat(c.deuda_calculada) <= 50);
    if (filtro === 'normal') lista = lista.filter(c => parseFloat(c.deuda_calculada) <= 20 && parseFloat(c.deuda_calculada) > 0);

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
      <td>
        ${parseFloat(c.deuda_calculada) > 0
            ? `<button class="btn-icon" onclick="abrirPagoRapido('${c.id}','${c.nombre_marca}',${c.deuda_calculada})">💰 Pagar</button>`
            : '—'}
      </td>
    </tr>`).join('') || '<tr><td colspan="7">Sin datos</td></tr>';
}

async function loadCierre() {
    const hoy = new Date().toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    document.getElementById('fechaCierre').textContent = hoy;

    const data = await apiFetch('/cierres/resumen-hoy');
    if (data) {
        document.getElementById('cs-servicios').textContent = data.total_servicios || 0;
        document.getElementById('cs-facturado').textContent = fmt(data.total_facturado);
        document.getElementById('cs-pendiente').textContent = fmt(parseFloat(data.total_facturado || 0) - parseFloat(data.total_cobrado || 0));
    }

    // Historial
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
    const clientes = await apiFetch('/clientes');
    if (clientes) {
        const sel = document.getElementById('p_cliente');
        sel.innerHTML = clientes.map(c => `<option value="${c.id}">${c.nombre_marca}</option>`).join('');
    }
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
      <td>${p.metodo}</td>
      <td>${p.fecha}</td>
    </tr>`).join('') || '<tr><td colspan="4" class="loading-txt">Sin pagos</td></tr>';
}

async function registrarPago(e) {
    e.preventDefault();
    const body = {
        cliente_id: document.getElementById('p_cliente').value,
        monto: parseFloat(document.getElementById('p_monto').value),
        metodo: document.getElementById('p_metodo').value,
        referencia: document.getElementById('p_ref').value || null,
    };
    const res = await apiFetch('/cobranza/pago', { method: 'POST', body });
    if (res?.id) {
        showToast('✅ Pago registrado correctamente');
        document.getElementById('formPago').reset();
        loadUltimosPagos();
    } else {
        showToast('❌ Error al registrar pago', 'err');
    }
}

function abrirPagoRapido(clienteId, nombre, deuda) {
    document.getElementById('pr_clienteId').value = clienteId;
    document.getElementById('pr_label').textContent = `Marca: ${nombre} — Deuda: ${fmt(deuda)}`;
    document.getElementById('pr_monto').value = parseFloat(deuda).toFixed(2);
    openModal('modalPagoRapido');
}

async function confirmarPagoRapido() {
    const body = {
        cliente_id: document.getElementById('pr_clienteId').value,
        monto: parseFloat(document.getElementById('pr_monto').value),
        metodo: document.getElementById('pr_metodo').value,
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
    window.open('/api/reportes/' + tipo + '?token=' + getToken(), '_blank');
}

// ── Init
loadCobranza();
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'cobranza') loadCobranza();
    if (view === 'cierre') loadCierre();
    if (view === 'pagos') loadPagosForm();
});
