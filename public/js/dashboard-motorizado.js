// dashboard-motorizado.js — Lógica del panel Motorizado

const motoUser = getUser();
const isAdmin = motoUser && motoUser.rol === 'admin';
if (!motoUser || (motoUser.rol !== 'motorizado' && motoUser.rol !== 'admin')) {
    localStorage.removeItem('eli7e_token');
    localStorage.removeItem('eli7e_user');
    window.location.href = '/';
}

// Si es admin, mostrar selector de motorizado
let _motoIdOverride = null;
function getMotoId() { return _motoIdOverride || motoUser.id; }

async function initAdminSelector() {
    if (!isAdmin) return;
    const motos = await apiFetch('/motorizados');
    if (!motos || !motos.length) return;
    _motoIdOverride = motos[0].id;
    const bar = document.createElement('div');
    bar.style.cssText = 'background:rgba(0,221,0,.08);border:1px solid var(--border);border-radius:10px;padding:10px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
    bar.innerHTML = `<span style="font-size:.82rem;color:var(--muted);">🔧 Modo Admin — viendo como:</span>
        <select id="adminMotoSelect" style="flex:1;min-width:150px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--g1);font-weight:600;font-family:inherit;">
            ${motos.map(m => `<option value="${m.id}">${m.nombre} (${m.cedula || 'sin cédula'})</option>`).join('')}
        </select>`;
    const content = document.querySelector('.content');
    content.insertBefore(bar, content.firstChild);
    document.getElementById('adminMotoSelect').addEventListener('change', (e) => {
        _motoIdOverride = e.target.value;
        loadResumen();
    });
}

function showSpinner(el) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (el) el.innerHTML = '<div class="spinner-wrap"><div class="spinner"></div><span>Cargando...</span></div>';
}

// ─── RESUMEN (carga inicial) ──────────────────────────────
async function loadResumen() {
    const id = getMotoId();
    showSpinner('serviciosHoyList');
    showSpinner('nominaResumen');

    // Servicios hoy (detalle del motorizado)
    const detalle = await apiFetch(`/motorizados/${id}`);
    if (detalle) {
        document.getElementById('kpi-servicios-hoy').textContent = detalle.resumen.count_dia || 0;
        document.getElementById('kpi-ganancia-hoy').textContent = fmt(detalle.resumen.ganancia_neta != null ? detalle.resumen.ganancia_neta : detalle.resumen.total_dia);
        renderServiciosHoy(detalle.servicios_hoy);
    }

    // Nómina semanal estimada
    const nomina = await apiFetch(`/nominas/semana-actual/${id}`);
    if (nomina) {
        document.getElementById('kpi-bruto-semana').textContent = fmt(nomina.monto_bruto);
        document.getElementById('kpi-neto-semana').textContent = fmt(nomina.monto_neto);
        renderNominaResumen(nomina);
    }
}

function renderServiciosHoy(servicios) {
    const el = document.getElementById('serviciosHoyList');
    if (!servicios || !servicios.length) {
        el.innerHTML = '<p class="loading-txt" style="padding:20px;">Sin servicios hoy</p>';
        return;
    }
    el.innerHTML = servicios.map(s => {
        const iconos = { delivery: '📦', mototaxi: '🛵', encomienda: '📬', compras: '🛒', transporte: '🚐' };
        const estadoCls = { pendiente: 'badge-yellow', en_curso: 'badge-blue', completado: 'badge-green', cancelado: 'badge-red' };
        const btnCompletar = (s.estado === 'pendiente' || s.estado === 'en_curso')
            ? `<button onclick="completarServicio('${s.id}')" style="margin-top:4px;padding:5px 10px;font-size:.72rem;font-weight:700;font-family:inherit;background:rgba(0,221,0,.15);border:1px solid rgba(0,221,0,.3);border-radius:6px;color:#00DD00;cursor:pointer;">✅ Completar</button>`
            : '';
        return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);">
            <span style="font-size:1.4rem">${iconos[s.tipo] || '📋'}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:.88rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${s.descripcion || s.tipo}</div>
                <div style="font-size:.78rem;color:var(--muted);">${s.nombre_marca || '—'} · ${fmtDate(s.fecha_inicio)}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:700;color:var(--g1);">${fmt(s.monto)}</div>
                <span class="badge ${estadoCls[s.estado] || ''}" style="font-size:.7rem;">${s.estado}</span>
                ${btnCompletar}
            </div>
        </div>`;
    }).join('');
}

function renderNominaResumen(n) {
    const el = document.getElementById('nominaResumen');
    el.innerHTML = `
    <div style="padding:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.85rem;">
            <span>Semana:</span>
            <span style="color:var(--g1);font-weight:600;">${n.semana_inicio} → ${n.semana_fin}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:.85rem;">
            <span>Servicios completados:</span>
            <span style="font-weight:600;">${n.total_servicios}</span>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin:12px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span>Monto bruto</span>
            <span style="font-weight:700;">${fmt(n.monto_bruto)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#FF6B6B;">
            <span>− Empresa (${n.porcentaje_empresa}%)</span>
            <span>-${fmt(n.deduccion_empresa)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#FF6B6B;">
            <span>− Uso de moto</span>
            <span>-${fmt(n.deduccion_moto)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;color:#FF6B6B;">
            <span>− Préstamos</span>
            <span>-${fmt(n.deduccion_prestamos)}</span>
        </div>
        <hr style="border:none;border-top:2px solid var(--g1);margin:12px 0;">
        <div style="display:flex;justify-content:space-between;font-size:1.1rem;">
            <span style="font-weight:800;color:var(--g1);">NETO ESTIMADO</span>
            <span style="font-weight:800;color:var(--g1);font-size:1.3rem;">${fmt(n.monto_neto)}</span>
        </div>
    </div>`;
}

// ─── MIS SERVICIOS (semana actual) ──────────────────────────
async function loadMisServicios() {
    const tbody = document.getElementById('serviciosBody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner-wrap"><div class="spinner"></div><span>Cargando...</span></div></td></tr>';
    const data = await apiFetch(`/servicios?motorizado_id=${getMotoId()}`);
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-txt">Sin servicios esta semana</td></tr>';
        return;
    }
    // Filtrar solo esta semana
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - (hoy.getDay() === 0 ? 6 : hoy.getDay() - 1));
    lunes.setHours(0, 0, 0, 0);

    const serviciosSemana = data.filter(s => new Date(s.fecha_inicio) >= lunes);
    if (!serviciosSemana.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-txt">Sin servicios esta semana</td></tr>';
        return;
    }

    const iconos = { delivery: '📦', mototaxi: '🛵', encomienda: '📬', compras: '🛒', transporte: '🚐' };
    const estadoCls = { pendiente: 'badge-yellow', en_curso: 'badge-blue', completado: 'badge-green', cancelado: 'badge-red' };

    tbody.innerHTML = serviciosSemana.map(s => {
        const btnCompletar = (s.estado === 'pendiente' || s.estado === 'en_curso')
            ? `<td><button onclick="completarServicio('${s.id}')" style="padding:5px 10px;font-size:.72rem;font-weight:700;font-family:inherit;background:rgba(0,221,0,.15);border:1px solid rgba(0,221,0,.3);border-radius:6px;color:#00DD00;cursor:pointer;">✅ Completar</button></td>`
            : '<td></td>';
        return `
        <tr>
            <td>${fmtDate(s.fecha_inicio)}</td>
            <td>${iconos[s.tipo] || ''} ${s.tipo}</td>
            <td style="font-weight:600;">${s.cliente_nombre || '—'}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.descripcion || '—'}</td>
            <td style="font-weight:700;color:var(--g1);">${fmt(s.monto)}</td>
            <td><span class="badge ${estadoCls[s.estado] || ''}">${s.estado}</span></td>
            ${btnCompletar}
        </tr>`;
    }).join('');
}

// ─── MI NÓMINA DETALLADA ──────────────────────────────
async function loadNominaDetalle() {
    const el = document.getElementById('nominaDetalle');
    showSpinner(el);
    const nomina = await apiFetch(`/nominas/semana-actual/${getMotoId()}`);
    if (!nomina) {
        el.innerHTML = '<p class="loading-txt">Error cargando nómina</p>';
        return;
    }

    el.innerHTML = `
    <div style="padding:20px;">
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:.82rem;color:var(--muted);margin-bottom:4px;">Semana del</div>
            <div style="font-size:1.2rem;font-weight:700;color:var(--g1);">${nomina.semana_inicio} al ${nomina.semana_fin}</div>
        </div>

        <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px;">INGRESOS</div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
                <span>Servicios completados</span>
                <span style="font-weight:600;">${nomina.total_servicios}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;">
                <span style="font-weight:700;">Monto Bruto</span>
                <span style="font-weight:800;font-size:1.1rem;">${fmt(nomina.monto_bruto)}</span>
            </div>
        </div>

        <div style="background:var(--bg);border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px;">DEDUCCIONES</div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);color:#FF6B6B;">
                <span>Porcentaje empresa (${nomina.porcentaje_empresa}%)</span>
                <span style="font-weight:600;">-${fmt(nomina.deduccion_empresa)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);color:#FF6B6B;">
                <span>Uso de moto (semanal)</span>
                <span style="font-weight:600;">-${fmt(nomina.deduccion_moto)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;color:#FF6B6B;">
                <span>Cuotas préstamos</span>
                <span style="font-weight:600;">-${fmt(nomina.deduccion_prestamos)}</span>
            </div>
        </div>

        <div style="background:linear-gradient(135deg, rgba(0,221,0,0.1), rgba(0,187,0,0.05));border:2px solid var(--g1);border-radius:12px;padding:20px;text-align:center;">
            <div style="font-size:.85rem;color:var(--muted);margin-bottom:4px;">TU SUELDO NETO ESTIMADO</div>
            <div style="font-size:2rem;font-weight:900;color:var(--g1);">${fmt(nomina.monto_neto)}</div>
        </div>

        <div style="margin-top:16px;padding:12px;background:var(--bg);border-radius:8px;font-size:.78rem;color:var(--muted);text-align:center;">
            Fórmula: Bruto − ${nomina.porcentaje_empresa}% empresa − $${nomina.deduccion_moto} moto − préstamos = Neto
        </div>
    </div>`;

    // Historial de nóminas cerradas
    const historial = await apiFetch(`/nominas/historial/${getMotoId()}`);
    const tbody = document.getElementById('nominasHistBody');
    if (!historial || !historial.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading-txt">Sin nóminas anteriores</td></tr>';
        return;
    }
    tbody.innerHTML = historial.map(n => {
        const deducciones = parseFloat(n.deduccion_empresa) + parseFloat(n.deduccion_moto) + parseFloat(n.deduccion_prestamos);
        return `
        <tr>
            <td>${n.semana_inicio} → ${n.semana_fin}</td>
            <td style="font-weight:600;">${fmt(n.monto_bruto)}</td>
            <td style="color:#FF6B6B;">-${fmt(deducciones)}</td>
            <td style="font-weight:700;color:var(--g1);">${fmt(n.monto_neto)}</td>
            <td><span class="badge ${n.estado === 'cerrado' ? 'badge-green' : 'badge-yellow'}">${n.estado === 'cerrado' ? 'Cerrada' : 'Borrador'}</span></td>
        </tr>`;
    }).join('');
}

// ─── PRÉSTAMOS ──────────────────────────────────────────
async function loadPrestamos() {
    const tbody = document.getElementById('prestamosBody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner-wrap"><div class="spinner"></div><span>Cargando...</span></div></td></tr>';
    const data = await apiFetch('/prestamos');
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-txt">No tienes préstamos registrados</td></tr>';
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
        <td>${fmtDate(p.solicitado_en)}</td>
        <td style="font-weight:700;">${fmt(p.monto)}</td>
        <td>${p.cuotas}</td>
        <td>${fmt(p.cuota_semanal)}</td>
        <td style="color:${parseFloat(p.saldo_pendiente) > 0 ? '#FF6B6B' : 'var(--g1)'};">${fmt(p.saldo_pendiente)}</td>
        <td>${estadoMap[p.estado] || p.estado}</td>
    </tr>`).join('');
}

// Calcular cuota estimada en modal
document.addEventListener('DOMContentLoaded', () => {
    const montoInput = document.getElementById('prestamoMonto');
    const cuotasInput = document.getElementById('prestamoCuotas');
    const estInput = document.getElementById('prestamoCuotaEst');

    function calcCuota() {
        const monto = parseFloat(montoInput?.value) || 0;
        const cuotas = parseInt(cuotasInput?.value) || 1;
        if (estInput) estInput.value = cuotas > 0 ? fmt(monto / cuotas) + ' / semana' : '$0.00';
    }
    if (montoInput) montoInput.addEventListener('input', calcCuota);
    if (cuotasInput) cuotasInput.addEventListener('input', calcCuota);
});

async function solicitarPrestamo(e) {
    e.preventDefault();
    const monto = parseFloat(document.getElementById('prestamoMonto').value);
    const cuotas = parseInt(document.getElementById('prestamoCuotas').value);
    const nota = document.getElementById('prestamoNota').value;

    const res = await apiFetch('/prestamos', {
        method: 'POST',
        body: { monto, cuotas, nota }
    });

    if (res && !res.error) {
        showToast('Solicitud de préstamo enviada');
        closeModal('modalPrestamo');
        document.getElementById('prestamoMonto').value = '';
        document.getElementById('prestamoCuotas').value = '4';
        document.getElementById('prestamoNota').value = '';
        document.getElementById('prestamoCuotaEst').value = '';
        loadPrestamos();
    } else {
        showToast(res?.error || 'Error al solicitar', 'err');
    }
}

// ─── HISTORIAL ──────────────────────────────────────────
async function loadHistorial() {
    const desde = document.getElementById('histDesde').value;
    const hasta = document.getElementById('histHasta').value;
    const tbody = document.getElementById('historialBody');
    tbody.innerHTML = '<tr><td colspan="6"><div class="spinner-wrap"><div class="spinner"></div><span>Cargando...</span></div></td></tr>';

    let url = `/servicios?motorizado_id=${getMotoId()}`;
    if (desde) url += `&desde=${desde}`;
    if (hasta) url += `&hasta=${hasta}`;

    const data = await apiFetch(url);
    if (!data || !data.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-txt">Sin servicios en este período</td></tr>';
        return;
    }

    const iconos = { delivery: '📦', mototaxi: '🛵', encomienda: '📬', compras: '🛒', transporte: '🚐' };
    const estadoCls = { pendiente: 'badge-yellow', en_curso: 'badge-blue', completado: 'badge-green', cancelado: 'badge-red' };

    tbody.innerHTML = data.map(s => `
    <tr>
        <td>${fmtDate(s.fecha_inicio)}</td>
        <td>${iconos[s.tipo] || ''} ${s.tipo}</td>
        <td>${s.nombre_marca || '—'}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.descripcion || '—'}</td>
        <td style="font-weight:700;color:var(--g1);">${fmt(s.monto)}</td>
        <td><span class="badge ${estadoCls[s.estado] || ''}">${s.estado}</span></td>
    </tr>`).join('');
}

// ─── IMPRIMIR RECIBO DE NÓMINA ──────────────────────────
function imprimirNomina() {
    const token = getToken();
    window.open(`/api/reportes/nomina/${getMotoId()}?token=${token}`, '_blank');
}

// ─── CAMBIAR CONTRASEÑA ──────────────────────────────
async function cambiarMiClave(e) {
    e.preventDefault();
    const actual = document.getElementById('claveActual').value;
    const nueva = document.getElementById('claveNueva').value;
    const confirmar = document.getElementById('claveConfirmar').value;

    if (nueva !== confirmar) { showToast('Las contraseñas no coinciden', 'err'); return; }
    if (nueva.length < 4) { showToast('Mínimo 4 caracteres', 'err'); return; }

    const res = await apiFetch(`/motorizados/${getMotoId()}/password`, {
        method: 'PATCH',
        body: { password_actual: actual, password: nueva }
    });
    if (res?.ok) {
        showToast('Contraseña actualizada');
        closeModal('modalCambiarClave');
        document.getElementById('claveActual').value = '';
        document.getElementById('claveNueva').value = '';
        document.getElementById('claveConfirmar').value = '';
    } else {
        showToast(res?.error || 'Error al cambiar contraseña', 'err');
    }
}

// ─── COMPLETAR SERVICIO ──────────────────────────────
async function completarServicio(id) {
    if (!confirm('¿Marcar este servicio como completado?')) return;
    const res = await apiFetch(`/servicios/${id}/cerrar`, { method: 'PATCH' });
    if (res && !res.error) {
        showToast('✅ Servicio completado');
        loadResumen();
        loadMisServicios();
    } else {
        showToast(res?.error || 'Error al completar', 'err');
    }
}

// ─── VIEW CHANGE HANDLER ──────────────────────────────
document.addEventListener('viewChange', (e) => {
    const v = e.detail.view;
    if (v === 'resumen') loadResumen();
    if (v === 'servicios') loadMisServicios();
    if (v === 'nomina') loadNominaDetalle();
    if (v === 'prestamos') loadPrestamos();
    if (v === 'historial') { /* esperar que el usuario filtre */ }
});

// Carga inicial
document.addEventListener('DOMContentLoaded', async () => {
    await initAdminSelector();
    loadResumen();

    // Poner fechas por defecto en historial
    const hoy = new Date();
    const hace30 = new Date(hoy);
    hace30.setDate(hoy.getDate() - 30);
    const histDesde = document.getElementById('histDesde');
    const histHasta = document.getElementById('histHasta');
    if (histDesde) histDesde.value = hace30.toISOString().split('T')[0];
    if (histHasta) histHasta.value = hoy.toISOString().split('T')[0];
});
