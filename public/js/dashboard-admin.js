// dashboard-admin.js — Lógica del panel Admin
let todosClientes = [];
let todosMoto = [];

async function loadDashboard() {
    // KPIs del día desde resumen de cierre
    const resumen = await apiFetch('/cierres/resumen-hoy');
    if (resumen) {
        document.getElementById('kpi-ingresos').textContent = fmt(resumen.total_facturado);
        document.getElementById('kpi-servicios').textContent = resumen.total_servicios || 0;
    }

    // KPIs de deuda desde cobranza
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
        <button class="btn-icon" onclick="editarCliente('${c.id}')">✏️</button>
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

async function editarCliente(id) {
    const data = await apiFetch('/clientes/' + id);
    if (!data?.cliente) { showToast('❌ No se pudo cargar el cliente', 'err'); return; }
    const c = data.cliente;
    document.getElementById('ec_id').value = c.id;
    document.getElementById('ec_nombre').value = c.nombre_marca || '';
    document.getElementById('ec_email').value = c.email || '';
    document.getElementById('ec_tel').value = c.telefono || '';
    document.getElementById('ec_rif').value = c.rif || '';
    openModal('modalEditCliente');
}

async function guardarEdicionCliente(e) {
    e.preventDefault();
    const id = document.getElementById('ec_id').value;
    const body = {
        nombre_marca: document.getElementById('ec_nombre').value,
        email: document.getElementById('ec_email').value || null,
        telefono: document.getElementById('ec_tel').value || null,
        rif: document.getElementById('ec_rif').value || null,
    };
    const res = await apiFetch('/clientes/' + id, { method: 'PUT', body });
    if (res?.id) {
        showToast('✅ Cliente actualizado');
        closeModal('modalEditCliente');
        loadClientes();
    } else {
        showToast('❌ Error al actualizar', 'err');
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
        <button class="btn-icon" style="color:var(--err);" onclick="eliminarMoto('${m.id}','${m.nombre}')">🗑️</button>
      </div>
    </div>`).join('');
}

async function cambiarEstado(id, estado) {
    const res = await apiFetch(`/motorizados/${id}/estado`, { method: 'PATCH', body: { estado } });
    if (res?.id) { showToast(`✅ ${res.nombre} → ${estado}`); loadFlota(); }
    else showToast('❌ Error', 'err');
}

async function eliminarMoto(id, nombre) {
    if (!confirm('¿Eliminar a ' + nombre + ' de la flota?')) return;
    const res = await apiFetch('/motorizados/' + id, { method: 'DELETE' });
    if (res?.ok) {
        showToast('🗑️ ' + nombre + ' eliminado de la flota');
        loadFlota();
        loadDashboard();
    } else {
        showToast('❌ Error al eliminar', 'err');
    }
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

// ── Tipos de Servicio (catálogo) ────────────────────────
async function loadServicios() {
    const data = await apiFetch('/tipos-servicio');
    if (!data) return;
    const grid = document.getElementById('tiposServicioGrid');
    if (!data.length) {
        grid.innerHTML = '<p class="loading-txt">Sin tipos de servicio registrados</p>';
        return;
    }
    grid.innerHTML = data.map(t => `
    <div class="moto-card ${t.activo ? '' : 'inactivo'}" style="text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:8px;">${t.icono || '📋'}</div>
        <div class="moto-name" style="text-transform:capitalize;">${t.nombre}</div>
        <div style="color:var(--muted);font-size:.78rem;margin:4px 0;">${t.descripcion || '—'}</div>
        <div style="font-size:1.2rem;font-weight:700;color:var(--g1);margin:8px 0;">${fmt(t.precio_base)}</div>
        <div>${t.activo
            ? '<span class="badge badge-green">Activo</span>'
            : '<span class="badge badge-red">Inactivo</span>'}</div>
        <div style="margin-top:10px;">
            <button class="btn-icon" onclick="editarTipoServicio('${t.id}')">✏️</button>
        </div>
    </div>`).join('');
}

function abrirModalTipoServicio() {
    document.getElementById('tsModeTitle').textContent = '+ Nuevo Tipo de Servicio';
    document.getElementById('formTipoServicio').reset();
    document.getElementById('ts_id').value = '';
    openModal('modalTipoServicio');
}

async function editarTipoServicio(id) {
    const tipos = await apiFetch('/tipos-servicio');
    const t = tipos?.find(x => x.id === id);
    if (!t) return;
    document.getElementById('tsModeTitle').textContent = '✏️ Editar Tipo de Servicio';
    document.getElementById('ts_id').value = t.id;
    document.getElementById('ts_icono').value = t.icono || '';
    document.getElementById('ts_nombre').value = t.nombre || '';
    document.getElementById('ts_desc').value = t.descripcion || '';
    document.getElementById('ts_precio').value = t.precio_base || '';
    openModal('modalTipoServicio');
}

async function guardarTipoServicio(e) {
    e.preventDefault();
    const id = document.getElementById('ts_id').value;
    const body = {
        nombre: document.getElementById('ts_nombre').value,
        icono: document.getElementById('ts_icono').value || '📋',
        descripcion: document.getElementById('ts_desc').value || null,
        precio_base: parseFloat(document.getElementById('ts_precio').value) || 0,
    };
    const url = id ? '/tipos-servicio/' + id : '/tipos-servicio';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body });
    if (res?.id) {
        showToast('✅ ' + (id ? 'Actualizado' : 'Creado'));
        closeModal('modalTipoServicio');
        loadServicios();
    } else {
        showToast('❌ Error: ' + (res?.error || 'desconocido'), 'err');
    }
}

// ── Cierres (vista admin) ───────────────────────────────
async function loadCierresAdmin() {
    const data = await apiFetch('/cierres');
    if (!data) return;
    const tbody = document.getElementById('cierresBody');
    tbody.innerHTML = data.map(c => `
    <tr>
      <td>${c.fecha}</td>
      <td>${c.total_servicios}</td>
      <td>${fmt(c.total_facturado)}</td>
      <td>${fmt(c.total_cobrado)}</td>
      <td style="color:${parseFloat(c.diferencia) < 0 ? 'var(--err)' : 'var(--g1)'}">${fmt(c.diferencia)}</td>
      <td>${c.estado === 'validado' ? '<span class="badge badge-green">✅ Validado</span>' : '<span class="badge badge-yellow">⏳ Pendiente</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="loading-txt">Sin cierres</td></tr>';
}

// ── Cobranza (vista admin) ──────────────────────────────
async function loadCobranza() {
    const data = await apiFetch('/cobranza');
    if (!data) return;
    const tbody = document.getElementById('cobranzaBody');
    tbody.innerHTML = data.map(c => `
    <tr>
      <td><strong>${c.nombre_marca}</strong></td>
      <td>${c.servicios_pendientes || 0}</td>
      <td>${fmt(c.facturado_total)}</td>
      <td>${fmt(c.pagado_total)}</td>
      <td style="color:var(--warn);">${fmt(c.deuda_calculada)}</td>
      <td>${semaforoDeuda(c.deuda_calculada)}</td>
      <td>—</td>
    </tr>`).join('') || '<tr><td colspan="7" class="loading-txt">Sin datos</td></tr>';
}

// ── Init
loadDashboard();
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'clientes') loadClientes();
    if (view === 'flota') loadFlota();
    if (view === 'servicios') loadServicios();
    if (view === 'cobranza') loadCobranza();
    if (view === 'cierres') loadCierresAdmin();
    if (view === 'dashboard') loadDashboard();
});
