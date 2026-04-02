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
        <button class="btn-icon" onclick="editarCliente('${c.id}')" title="Editar">✏️</button>
        <button class="btn-icon" style="color:#FF4444;" onclick="eliminarCliente('${c.id}','${c.nombre_marca.replace(/'/g, "\\\'")}')" title="Eliminar">🗑️</button>
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

async function eliminarCliente(id, nombre) {
    if (!confirm('⚠️ ¿Seguro que quieres eliminar al cliente "' + nombre + '"?\n\nEsta acción NO se puede deshacer.')) return;
    const res = await apiFetch('/clientes/' + id, { method: 'DELETE' });
    if (res?.ok) {
        showToast('🗑️ Cliente ' + nombre + ' eliminado');
        loadClientes();
        loadDashboard();
    } else {
        showToast('❌ ' + (res?.error || 'Error al eliminar cliente'), 'err');
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
        <button class="btn-icon" onclick="cambiarClaveMoto('${m.id}','${m.nombre}')" title="Cambiar clave">🔑</button>
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
        cedula: document.getElementById('m_cedula').value,
        telefono: document.getElementById('m_tel').value || null,
        password: document.getElementById('m_pass').value || '123456',
    };
    if (!data.cedula) { showToast('La cédula es obligatoria para login', 'err'); return; }
    const res = await apiFetch('/motorizados', { method: 'POST', body: data });
    if (res?.id) {
        showToast('Motorizado agregado: ' + res.nombre);
        closeModal('modalMoto');
        document.getElementById('formMoto').reset();
        document.getElementById('m_pass').value = '123456';
        loadFlota();
    } else {
        showToast(res?.error || 'Error', 'err');
    }
}

async function cambiarClaveMoto(id, nombre) {
    const newPass = prompt('Nueva contraseña para ' + nombre + ':');
    if (!newPass || newPass.length < 4) {
        if (newPass !== null) showToast('La contraseña debe tener al menos 4 caracteres', 'err');
        return;
    }
    const res = await apiFetch('/motorizados/' + id + '/password', {
        method: 'PATCH',
        body: { password: newPass }
    });
    if (res?.ok) showToast('Contraseña actualizada para ' + nombre);
    else showToast(res?.error || 'Error al cambiar contraseña', 'err');
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
      <td><button class="btn-icon" onclick="verFactura('${c.id}')" title="Ver factura">🧾</button></td>
    </tr>`).join('') || '<tr><td colspan="7" class="loading-txt">Sin datos</td></tr>';
}

function verFactura(clienteId) {
    window.open('/api/reportes/factura/' + clienteId + '?token=' + getToken(), '_blank');
}

async function enviarCorreo(id, nombre) {
    showToast(`Enviando reporte a ${nombre}...`);
    const res = await apiFetch('/cobranza/enviar/' + id, { method: 'POST' });
    if (res?.ok) showToast(`Reporte enviado a ${nombre}`);
    else showToast('Error enviando correo', 'err');
}

async function enviarCierresMasivos() {
    showToast('Enviando cierres a todas las marcas...');
    const res = await apiFetch('/cobranza/enviar-masivo', { method: 'POST' });
    if (res?.ok) showToast(`Cierres enviados a ${res.count} marcas`);
    else showToast('Error', 'err');
}

function exportarReporte(tipo) {
    window.open('/api/reportes/' + tipo + '?token=' + getToken(), '_blank');
}

// ── Usuarios ────────────────────────────────────────────
async function loadUsuarios() {
    const data = await apiFetch('/usuarios');
    if (!data) return;
    const tbody = document.getElementById('usuariosBody');
    const rolBadges = {
        admin: '<span class="badge badge-green">Administrador</span>',
        call_center: '<span class="badge badge-yellow">Call Center</span>',
        contable: '<span class="badge badge-blue" style="background:rgba(0,150,255,.15);color:#0096ff;">Contable</span>',
        motorizado: '<span class="badge badge-yellow" style="background:rgba(255,152,0,.15);color:#FF9800;">Motorizado</span>',
    };
    tbody.innerHTML = data.map(u => `
    <tr>
      <td><strong>${u.nombre}</strong></td>
      <td style="color:var(--muted);">${u.email}</td>
      <td>${rolBadges[u.rol] || u.rol}</td>
      <td>${u.ultimo_acceso ? fmtDate(u.ultimo_acceso) : '—'}</td>
      <td>${u.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-red">Inactivo</span>'}</td>
      <td>
        <button class="btn-icon" onclick="editarUsuario('${u.id}','${u.nombre}','${u.email}','${u.rol}')" title="Editar">✏️</button>
        <button class="btn-icon" onclick="cambiarClaveUsuario('${u.id}','${u.nombre}')" title="Cambiar clave">🔑</button>
        <button class="btn-icon" style="color:#FF4444;" onclick="eliminarUsuario('${u.id}','${u.nombre}')" title="Eliminar">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="6" class="loading-txt">Sin usuarios</td></tr>';
}

async function crearUsuario(e) {
    e.preventDefault();
    const body = {
        nombre: document.getElementById('u_nombre').value,
        email: document.getElementById('u_email').value,
        password: document.getElementById('u_pass').value,
        rol: document.getElementById('u_rol').value,
    };
    const res = await apiFetch('/usuarios', { method: 'POST', body });
    if (res?.id) {
        showToast('✅ Usuario creado: ' + res.nombre);
        closeModal('modalUsuario');
        document.getElementById('formUsuario').reset();
        loadUsuarios();
    } else {
        showToast('❌ ' + (res?.error || 'Error al crear usuario'), 'err');
    }
}

function editarUsuario(id, nombre, email, rol) {
    document.getElementById('eu_id').value = id;
    document.getElementById('eu_nombre').value = nombre;
    document.getElementById('eu_email').value = email;
    document.getElementById('eu_rol').value = rol;
    openModal('modalEditUsuario');
}

async function guardarEdicionUsuario(e) {
    e.preventDefault();
    const id = document.getElementById('eu_id').value;
    const body = {
        nombre: document.getElementById('eu_nombre').value,
        email: document.getElementById('eu_email').value,
        rol: document.getElementById('eu_rol').value,
    };
    const res = await apiFetch('/usuarios/' + id, { method: 'PUT', body });
    if (res?.id || res?.ok) {
        showToast('✅ Usuario actualizado');
        closeModal('modalEditUsuario');
        loadUsuarios();
    } else {
        showToast('❌ ' + (res?.error || 'Error'), 'err');
    }
}

async function cambiarClaveUsuario(id, nombre) {
    const newPass = prompt('🔑 Nueva contraseña para ' + nombre + ':');
    if (!newPass || newPass.length < 6) {
        if (newPass !== null) showToast('❌ La contraseña debe tener al menos 6 caracteres', 'err');
        return;
    }
    const res = await apiFetch('/usuarios/' + id + '/password', {
        method: 'PUT',
        body: { password: newPass }
    });
    if (res?.ok) {
        showToast('✅ Contraseña actualizada para ' + nombre);
    } else {
        showToast('❌ Error al cambiar contraseña', 'err');
    }
}

async function eliminarUsuario(id, nombre) {
    if (!confirm('⚠️ ¿Seguro que quieres ELIMINAR al usuario "' + nombre + '"?\n\nEsta acción NO se puede deshacer.')) return;
    const res = await apiFetch('/usuarios/' + id, { method: 'DELETE' });
    if (res?.ok) {
        showToast('🗑️ Usuario ' + nombre + ' eliminado');
        loadUsuarios();
    } else {
        showToast('❌ ' + (res?.error || 'Error al eliminar'), 'err');
    }
}

async function resetDatos() {
    if (!confirm('⚠️ ¿Seguro que quieres borrar TODOS los servicios, pagos, cierres y notas?\n\nEsta acción NO se puede deshacer.')) return;
    const res = await apiFetch('/admin/reset-db', { method: 'POST', body: {} });
    if (res?.ok) {
        showToast('✅ Datos de prueba limpiados');
        loadDashboard();
    } else {
        showToast('❌ ' + (res?.error || 'Error al limpiar'), 'err');
    }
}

// ── Tarifas Rápidas ────────────────────────────────────────
async function loadTarifas() {
    const data = await apiFetch('/tarifas');
    if (!data) return;
    const grid = document.getElementById('tarifasGrid');
    if (!data.length) {
        grid.innerHTML = '<p class="loading-txt">Sin tarifas configuradas. Agrega una con el botón "+"</p>';
        return;
    }
    grid.innerHTML = data.map(t => `
    <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(0,221,0,.06);border:1px solid rgba(0,221,0,.18);border-radius:10px;min-width:120px;">
        <span style="font-size:1.3rem;font-weight:700;color:var(--g1);">$${parseFloat(t.monto).toFixed(2)}</span>
        ${t.etiqueta ? '<span style="font-size:.75rem;color:var(--muted);">' + t.etiqueta + '</span>' : ''}
        <div style="margin-left:auto;display:flex;gap:4px;">
            <button class="btn-icon" onclick="editarTarifa('${t.id}')" title="Editar" style="font-size:.75rem;">✏️</button>
            <button class="btn-icon" style="color:#FF4444;font-size:.75rem;" onclick="eliminarTarifa('${t.id}','${parseFloat(t.monto).toFixed(2)}')" title="Eliminar">🗑️</button>
        </div>
    </div>`).join('');
}

function abrirModalTarifa() {
    document.getElementById('tarifaModeTitle').textContent = '+ Nueva Tarifa';
    document.getElementById('formTarifa').reset();
    document.getElementById('tar_id').value = '';
    openModal('modalTarifa');
}

async function editarTarifa(id) {
    const tarifas = await apiFetch('/tarifas');
    const t = tarifas?.find(x => x.id === id);
    if (!t) return;
    document.getElementById('tarifaModeTitle').textContent = '✏️ Editar Tarifa';
    document.getElementById('tar_id').value = t.id;
    document.getElementById('tar_monto').value = t.monto;
    document.getElementById('tar_label').value = t.etiqueta || '';
    openModal('modalTarifa');
}

async function guardarTarifa(e) {
    e.preventDefault();
    const id = document.getElementById('tar_id').value;
    const body = {
        monto: parseFloat(document.getElementById('tar_monto').value),
        etiqueta: document.getElementById('tar_label').value || null,
    };
    const url = id ? '/tarifas/' + id : '/tarifas';
    const method = id ? 'PUT' : 'POST';
    const res = await apiFetch(url, { method, body });
    if (res?.id) {
        showToast('✅ Tarifa ' + (id ? 'actualizada' : 'creada') + ': $' + parseFloat(res.monto).toFixed(2));
        closeModal('modalTarifa');
        loadTarifas();
    } else {
        showToast('❌ ' + (res?.error || 'Error al guardar tarifa'), 'err');
    }
}

async function eliminarTarifa(id, monto) {
    if (!confirm('¿Eliminar la tarifa de $' + monto + '?')) return;
    const res = await apiFetch('/tarifas/' + id, { method: 'DELETE' });
    if (res?.ok) {
        showToast('🗑️ Tarifa $' + monto + ' eliminada');
        loadTarifas();
    } else {
        showToast('❌ Error al eliminar', 'err');
    }
}

// ══════════════════════════════════════════════════════════
// ── NÓMINAS (Admin) ───────────────────────────────────────
// ══════════════════════════════════════════════════════════
async function loadNominasAdmin() {
    const input = document.getElementById('nominaSemanaInput');
    let semana = input?.value || '';

    // Si no hay fecha, calcular lunes actual
    if (!semana) {
        const hoy = new Date();
        const day = hoy.getDay();
        const diff = hoy.getDate() - day + (day === 0 ? -6 : 1);
        const lunes = new Date(hoy);
        lunes.setDate(diff);
        semana = lunes.toISOString().split('T')[0];
        if (input) input.value = semana;
    }

    const data = await apiFetch(`/nominas/resumen-semanal?semana=${semana}`);
    if (!data) return;

    document.getElementById('nominaSemanaLabel').textContent =
        `Semana: ${data.semana_inicio} → ${data.semana_fin}`;

    const tbody = document.getElementById('nominasAdminBody');
    if (!data.motorizados?.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-txt">Sin motorizados activos</td></tr>';
        return;
    }

    tbody.innerHTML = data.motorizados.map(m => {
        const cerrada = m.nomina_estado === 'cerrado';
        return `
        <tr>
            <td><strong>${m.nombre}</strong></td>
            <td>${m.total_servicios}</td>
            <td style="font-weight:600;">${fmt(m.monto_bruto)}</td>
            <td style="color:#FF6B6B;">-${fmt(m.deduccion_empresa)}</td>
            <td style="color:#FF6B6B;">-${fmt(m.deduccion_moto)}</td>
            <td style="color:#FF6B6B;">-${fmt(m.deduccion_prestamos)}</td>
            <td style="font-weight:800;color:var(--g1);font-size:1.05rem;">${fmt(m.monto_neto)}</td>
            <td>${cerrada
                ? '<span class="badge badge-green">Cerrada</span>'
                : '<span class="badge badge-yellow">Abierta</span>'}</td>
            <td>
                <button class="btn-icon" onclick="window.open('/api/reportes/nomina/${m.motorizado_id}?semana=${semana}&token='+getToken(),'_blank')" title="Imprimir recibo">🖨️</button>
                ${cerrada
                ? ''
                : `<button class="btn-icon" onclick="cerrarNominaUno('${m.motorizado_id}','${semana}','${m.nombre}')" title="Cerrar nómina">🔒</button>`}
            </td>
        </tr>`;
    }).join('');
}

async function cerrarNominaUno(motorizadoId, semana, nombre) {
    if (!confirm(`¿Cerrar nómina de ${nombre} para la semana del ${semana}?`)) return;
    const res = await apiFetch('/nominas/cerrar', {
        method: 'POST',
        body: { motorizado_id: motorizadoId, semana_inicio: semana }
    });
    if (res && !res.error) {
        showToast(`Nómina de ${nombre} cerrada`);
        loadNominasAdmin();
    } else {
        showToast(res?.error || 'Error al cerrar nómina', 'err');
    }
}

async function cerrarTodasNominas() {
    const input = document.getElementById('nominaSemanaInput');
    const semana = input?.value;
    if (!semana) { showToast('Selecciona una semana primero', 'err'); return; }
    if (!confirm(`¿Cerrar nóminas de TODOS los motorizados para la semana del ${semana}?`)) return;

    const res = await apiFetch('/nominas/cerrar-todas', {
        method: 'POST',
        body: { semana_inicio: semana }
    });
    if (res && !res.error) {
        showToast(`${res.cerradas} nóminas cerradas`);
        loadNominasAdmin();
    } else {
        showToast(res?.error || 'Error al cerrar nóminas', 'err');
    }
}

// ══════════════════════════════════════════════════════════
// ── PRÉSTAMOS (Admin) ─────────────────────────────────────
// ══════════════════════════════════════════════════════════
async function loadPrestamosAdmin() {
    const data = await apiFetch('/prestamos');
    const tbody = document.getElementById('prestamosAdminBody');
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="loading-txt">Sin préstamos registrados</td></tr>';
        return;
    }

    const estadoMap = {
        pendiente: '<span class="badge badge-yellow">Pendiente</span>',
        aprobado: '<span class="badge badge-blue">Aprobado</span>',
        rechazado: '<span class="badge badge-red">Rechazado</span>',
        pagado: '<span class="badge badge-green">Pagado</span>'
    };

    tbody.innerHTML = data.map(p => `
    <tr>
        <td><strong>${p.motorizado_nombre || '—'}</strong></td>
        <td>${p.motorizado_cedula || '—'}</td>
        <td style="font-weight:700;">${fmt(p.monto)}</td>
        <td>${p.cuotas}</td>
        <td>${fmt(p.cuota_semanal)}</td>
        <td style="color:${parseFloat(p.saldo_pendiente) > 0 ? '#FF6B6B' : 'var(--g1)'};">${fmt(p.saldo_pendiente)}</td>
        <td>${estadoMap[p.estado] || p.estado}</td>
        <td style="font-size:.8rem;">${fmtDate(p.solicitado_en)}</td>
        <td>
            ${p.estado === 'pendiente' ? `
                <button class="btn-icon" onclick="abrirAprobarPrestamo('${p.id}','${(p.motorizado_nombre || '').replace(/'/g, "\\'")}','${p.monto}','${p.cuotas}')" title="Aprobar" style="color:var(--g1);">✅</button>
                <button class="btn-icon" onclick="rechazarPrestamo('${p.id}')" title="Rechazar" style="color:#FF4444;">❌</button>
            ` : '—'}
        </td>
    </tr>`).join('');
}

function abrirAprobarPrestamo(id, nombre, monto, cuotas) {
    document.getElementById('ap_id').value = id;
    document.getElementById('ap_nombre').value = nombre;
    document.getElementById('ap_monto').value = '$' + parseFloat(monto).toFixed(2);
    document.getElementById('ap_cuotas').value = cuotas;
    calcApCuota();
    openModal('modalAprobarPrestamo');
}

function calcApCuota() {
    const montoStr = document.getElementById('ap_monto').value.replace('$', '');
    const monto = parseFloat(montoStr) || 0;
    const cuotas = parseInt(document.getElementById('ap_cuotas').value) || 1;
    document.getElementById('ap_cuota_est').value = fmt(monto / cuotas) + ' / semana';
}

// Listener para recalcular cuota al cambiar
document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('ap_cuotas');
    if (el) el.addEventListener('input', calcApCuota);
});

async function confirmarAprobarPrestamo(e) {
    e.preventDefault();
    const id = document.getElementById('ap_id').value;
    const cuotas = parseInt(document.getElementById('ap_cuotas').value);
    const res = await apiFetch(`/prestamos/${id}/aprobar`, {
        method: 'PATCH',
        body: { cuotas }
    });
    if (res && !res.error) {
        showToast('Préstamo aprobado');
        closeModal('modalAprobarPrestamo');
        loadPrestamosAdmin();
    } else {
        showToast(res?.error || 'Error al aprobar', 'err');
    }
}

async function rechazarPrestamo(id) {
    if (!confirm('¿Rechazar este préstamo?')) return;
    const res = await apiFetch(`/prestamos/${id}/rechazar`, { method: 'PATCH' });
    if (res && !res.error) {
        showToast('Préstamo rechazado');
        loadPrestamosAdmin();
    } else {
        showToast(res?.error || 'Error al rechazar', 'err');
    }
}

// ══════════════════════════════════════════════════════════
// ── PARÁMETROS DEL SISTEMA (Admin) ────────────────────────
// ══════════════════════════════════════════════════════════
async function loadParametros() {
    const data = await apiFetch('/parametros');
    const grid = document.getElementById('parametrosGrid');
    if (!data || !data.length) {
        grid.innerHTML = '<p class="loading-txt">Sin parámetros configurados</p>';
        return;
    }

    const iconos = {
        porcentaje_empresa: '📊',
        costo_moto_semanal: '🛵',
        umbral_deuda_critica: '🔴',
        umbral_deuda_alerta: '🟡',
        max_cuotas_prestamo: '🏦',
        password_default_moto: '🔑'
    };

    grid.innerHTML = data.map(p => `
    <div class="card" style="padding:20px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
            <span style="font-size:2rem;">${iconos[p.clave] || '⚙️'}</span>
            <div>
                <div style="font-weight:700;font-size:1rem;">${p.clave.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</div>
                <div style="font-size:.78rem;color:var(--muted);">${p.descripcion || ''}</div>
            </div>
        </div>
        <div class="field">
            <label>Valor actual</label>
            <div style="display:flex;gap:8px;">
                <input type="number" step="0.01" id="param_${p.clave}" value="${p.valor}"
                    style="flex:1;padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--g1);font-weight:700;font-size:1.1rem;">
                <button class="btn-primary" onclick="guardarParametro('${p.clave}')">Guardar</button>
            </div>
        </div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:8px;">
            Última actualización: ${p.actualizado_en ? fmtDate(p.actualizado_en) : 'Nunca'}
        </div>
    </div>`).join('');

    // Preview de fórmula
    const paramMap = {};
    data.forEach(p => paramMap[p.clave] = parseFloat(p.valor));
    const pct = paramMap.porcentaje_empresa || 30;
    const moto = paramMap.costo_moto_semanal || 40;
    document.getElementById('formulaPreview').innerHTML = `
    <div style="font-family:monospace;font-size:1rem;color:var(--text);line-height:2;">
        <div><strong>Monto Bruto</strong> = Suma de servicios completados en la semana</div>
        <div style="color:#FF6B6B;"><strong>− Empresa (${pct}%)</strong> = Bruto × ${pct/100}</div>
        <div style="color:#FF6B6B;"><strong>− Uso de moto</strong> = $${moto.toFixed(2)} fijo semanal</div>
        <div style="color:#FF6B6B;"><strong>− Préstamos</strong> = Cuotas semanales activas</div>
        <hr style="border:none;border-top:2px solid var(--g1);margin:12px 0;">
        <div style="color:var(--g1);font-size:1.15rem;"><strong>= SUELDO NETO</strong></div>
    </div>`;
}

async function guardarParametro(clave) {
    const input = document.getElementById('param_' + clave);
    const valor = parseFloat(input?.value);
    if (isNaN(valor)) { showToast('Valor inválido', 'err'); return; }

    const res = await apiFetch('/parametros/' + clave, {
        method: 'PUT',
        body: { valor }
    });
    if (res && !res.error) {
        showToast(`Parámetro "${clave}" actualizado a ${valor}`);
        loadParametros();
    } else {
        showToast(res?.error || 'Error al guardar', 'err');
    }
}

async function guardarGmail() {
    const gmail_user = document.getElementById('gmailUser').value;
    const gmail_pass = document.getElementById('gmailPass').value;
    const res = await apiFetch('/configuracion', {
        method: 'PUT',
        body: { gmail_user, gmail_pass }
    });
    if (res?.ok) showToast('Configuración de Gmail guardada');
    else showToast(res?.error || 'Error al guardar Gmail', 'err');
}

async function guardarEmpresa() {
    const empresa_nombre = document.getElementById('empresaNombre').value;
    const empresa_telefono = document.getElementById('empresaTel').value;
    const res = await apiFetch('/configuracion', {
        method: 'PUT',
        body: { empresa_nombre, empresa_telefono }
    });
    if (res?.ok) showToast('Datos de empresa guardados');
    else showToast(res?.error || 'Error al guardar', 'err');
}

async function loadConfig() {
    const data = await apiFetch('/configuracion');
    if (!data) return;
    const map = {};
    data.forEach(c => map[c.clave] = c.valor);
    const el = (id, val) => { const e = document.getElementById(id); if (e && val) e.value = val; };
    el('gmailUser', map.gmail_user);
    el('gmailPass', map.gmail_pass);
    el('empresaNombre', map.empresa_nombre);
    el('empresaTel', map.empresa_telefono);
}

// ── Init
cargarUmbralesDeuda().then(() => loadDashboard());
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'clientes') loadClientes();
    if (view === 'flota') loadFlota();
    if (view === 'servicios') { loadServicios(); loadTarifas(); }
    if (view === 'cobranza') loadCobranza();
    if (view === 'nominas') loadNominasAdmin();
    if (view === 'prestamos') loadPrestamosAdmin();
    if (view === 'parametros') loadParametros();
    if (view === 'cierres') loadCierresAdmin();
    if (view === 'usuarios') loadUsuarios();
    if (view === 'config') loadConfig();
    if (view === 'dashboard') loadDashboard();
});
