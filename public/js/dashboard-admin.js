// dashboard-admin.js — Lógica del panel Admin
let todosClientes = [];
let todosMoto = [];

async function loadDashboard() {
    // KPIs básicos desde cobranza
    const cob = await apiFetch('/cobranza');
    if (cob) {
        const deudaTotal = cob.reduce((a, c) => a + parseFloat(c.deuda_calculada || 0), 0);
        document.getElementById('kpi-deuda').textContent = fmt(deudaTotal);

        const tbody = document.getElementById('deudaBody');
        const top5 = [...cob].sort((a, b) => b.deuda_calculada - a.deuda_calculada).slice(0, 5);
        tbody.innerHTML = top5.map(c => `
      <tr>
        <td>${c.nombre_marca}</td>
        <td>${fmt(c.deuda_calculada)}</td>
        <td>${semaforoDeuda(c.deuda_calculada)}</td>
      </tr>`).join('') || '<tr><td colspan="3">Sin deudas 🎉</td></tr>';
    }

    // Flota
    await loadFlotaStatus();
}

async function loadFlotaStatus() {
    const motos = await apiFetch('/motorizados');
    if (!motos) return;
    todosMoto = motos;

    const activas = motos.filter(m => m.estado === 'en_servicio').length;
    document.getElementById('kpi-motos').textContent = activas;

    const el = document.getElementById('flotaStatus');
    const dotClass = { disponible: 'dot-verde', en_servicio: 'dot-amar', inactivo: 'dot-rojo' };
    el.innerHTML = motos.map(m => `
    <div class="moto-row">
      <div class="moto-dot ${dotClass[m.estado]}"></div>
      <span style="font-size:.88rem;font-weight:600">${m.nombre}</span>
      <span style="margin-left:auto">${estadoBadge(m.estado)}</span>
    </div>`).join('');
}

async function loadClientes() {
    const data = await apiFetch('/clientes');
    if (!data) return;
    todosClientes = data;
    renderClientes(data);
}

function renderClientes(list) {
    const tbody = document.getElementById('clientesBody');
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-txt">Sin clientes registrados</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong style="color:var(--text)">${c.nombre_marca}</strong></td>
      <td>${c.email || '—'}</td>
      <td>${c.telefono || '—'}</td>
      <td style="color:${parseFloat(c.saldo_pendiente) > 0 ? 'var(--warn)' : 'var(--g1)'}">${fmt(c.saldo_pendiente)}</td>
      <td>${c.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td>
        <button class="btn-icon" onclick="editarCliente('${c.id}','${c.nombre_marca}')">✏️</button>
      </td>
    </tr>`).join('');
}

function filterClientes() {
    const q = document.getElementById('searchCliente').value.toLowerCase();
    renderClientes(todosClientes.filter(c => c.nombre_marca.toLowerCase().includes(q)));
}

async function crearCliente(e) {
    e.preventDefault();
    const data = {
        nombre_marca: document.getElementById('c_nombre').value,
        email: document.getElementById('c_email').value || null,
        telefono: document.getElementById('c_tel').value || null,
        rif: document.getElementById('c_rif').value || null,
    };
    const res = await apiFetch('/clientes', { method: 'POST', body: data });
    if (res?.id) {
        showToast('✅ Cliente creado: ' + res.nombre_marca);
        closeModal('modalCliente');
        document.getElementById('formCliente').reset();
        loadClientes();
    } else {
        showToast('❌ Error al crear cliente', 'err');
    }
}

async function loadFlota() {
    const motos = await apiFetch('/motorizados');
    if (!motos) return;
    const grid = document.getElementById('motosGrid');
    grid.innerHTML = motos.map(m => `
    <div class="moto-card ${m.estado}">
      <div class="moto-icon">🛵</div>
      <div class="moto-name">${m.nombre}</div>
      <div class="moto-estado ${`estado-${m.estado}`}">${m.estado.replace('_', ' ')}</div>
      <div style="margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap;">
        <button class="btn-icon" onclick="cambiarEstado('${m.id}','disponible')">✅</button>
        <button class="btn-icon" onclick="cambiarEstado('${m.id}','en_servicio')">🔄</button>
        <button class="btn-icon" onclick="cambiarEstado('${m.id}','inactivo')">⏸</button>
      </div>
    </div>`).join('');
}

async function cambiarEstado(id, estado) {
    const res = await apiFetch(`/motorizados/${id}/estado`, { method: 'PATCH', body: { estado } });
    if (res?.id) { showToast(`✅ ${res.nombre} → ${estado}`); loadFlota(); }
    else showToast('❌ Error', 'err');
}

async function crearMoto(e) {
    e.preventDefault();
    const data = {
        nombre: document.getElementById('m_nombre').value,
        cedula: document.getElementById('m_cedula').value || null,
        telefono: document.getElementById('m_tel').value || null,
    };
    const res = await apiFetch('/motorizados', { method: 'POST', body: data });
    if (res?.id) {
        showToast('✅ Motorizado agregado: ' + res.nombre);
        closeModal('modalMoto');
        document.getElementById('formMoto').reset();
        loadFlota();
    } else {
        showToast('❌ Error', 'err');
    }
}

async function loadCobranza() {
    const data = await apiFetch('/cobranza');
    if (!data) return;
    const tbody = document.getElementById('cobranzaBody');
    tbody.innerHTML = data.map(c => `
    <tr>
      <td><strong style="color:var(--text)">${c.nombre_marca}</strong></td>
      <td>${c.servicios_pendientes || 0}</td>
      <td>${fmt(c.facturado_total)}</td>
      <td>${fmt(c.pagado_total)}</td>
      <td style="color:${parseFloat(c.deuda_calculada) > 0 ? 'var(--warn)' : 'var(--g1)'};font-weight:700">${fmt(c.deuda_calculada)}</td>
      <td>${semaforoDeuda(c.deuda_calculada)}</td>
      <td><button class="btn-icon" onclick="enviarCorreo('${c.id}','${c.nombre_marca}')">📧</button></td>
    </tr>`).join('') || '<tr><td colspan="7">Sin datos</td></tr>';
}

async function enviarCorreo(id, nombre) {
    showToast(`📧 Enviando reporte a ${nombre}...`);
    const res = await apiFetch('/cobranza/enviar/' + id, { method: 'POST' });
    if (res?.ok) showToast(`✅ Reporte enviado a ${nombre}`);
    else showToast('❌ Error enviando correo', 'err');
}

async function enviarCierresMasivos() {
    showToast('📧 Enviando cierres a todas las marcas...');
    const res = await apiFetch('/cobranza/enviar-masivo', { method: 'POST' });
    if (res?.ok) showToast(`✅ Cierres enviados a ${res.count} marcas`);
    else showToast('❌ Error', 'err');
}

function exportarReporte(tipo) {
    window.open('/api/reportes/' + tipo + '?token=' + getToken(), '_blank');
}

// ── Init
loadDashboard();
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'clientes') loadClientes();
    if (view === 'flota') loadFlota();
    if (view === 'cobranza') loadCobranza();
    if (view === 'dashboard') loadDashboard();
});
