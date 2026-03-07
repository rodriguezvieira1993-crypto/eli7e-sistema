// dashboard-callcenter.js
let allClientesCC = [];

function selectTipo(el) {
    document.querySelectorAll('.tipo-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('s_tipo').value = el.dataset.tipo;
}
async function initCC() {
    await loadFlotaDisp();
    await loadClientesCC();
}

async function loadFlotaDisp() {
    const motos = await apiFetch('/motorizados/disponibles');
    if (!motos) return;

    // Select del formulario
    const sel = document.getElementById('s_motorizado');
    sel.innerHTML = motos.length
        ? motos.map(m => `<option value="${m.id}">🛵 ${m.nombre}</option>`).join('')
        : '<option value="">Sin motorizados disponibles</option>';

    // Panel lateral
    const el = document.getElementById('flotaDisp');
    el.innerHTML = motos.length
        ? motos.map(m => `
        <div class="moto-row">
          <div class="moto-dot dot-verde"></div>
          <span style="font-size:.88rem;font-weight:600">${m.nombre}</span>
          <span class="badge badge-green" style="margin-left:auto;font-size:.7rem">Libre</span>
        </div>`).join('')
        : '<p style="color:var(--err);font-size:.85rem">⚠ Sin motos disponibles ahora</p>';
}

async function loadClientesCC() {
    const data = await apiFetch('/clientes');
    if (!data) return;
    allClientesCC = data;

    const sel = document.getElementById('s_cliente');
    sel.innerHTML = data.map(c => `<option value="${c.id}">${c.nombre_marca}</option>`).join('');

    renderClientesCC(data);
}

function filterClientesCC() {
    const q = document.getElementById('searchClienteCC').value.toLowerCase();
    renderClientesCC(allClientesCC.filter(c => c.nombre_marca.toLowerCase().includes(q)));
}

function renderClientesCC(list) {
    const tbody = document.getElementById('clientesCCBody');
    tbody.innerHTML = list.map(c => `
    <tr>
      <td><strong style="color:var(--text)">${c.nombre_marca}</strong></td>
      <td>${c.email || '—'}</td>
      <td>${c.telefono || '—'}</td>
      <td style="color:${parseFloat(c.saldo_pendiente) > 0 ? 'var(--warn)' : 'var(--g1)'}">${fmt(c.saldo_pendiente)}</td>
    </tr>`).join('') || '<tr><td colspan="4">Sin resultados</td></tr>';
}

async function crearServicio(e) {
    e.preventDefault();
    const tipo = document.getElementById('s_tipo').value;
    if (!tipo) {
        showToast('⚠ Selecciona un tipo de servicio', 'err');
        return;
    }
    const body = {
        tipo,
        cliente_id: document.getElementById('s_cliente').value,
        motorizado_id: document.getElementById('s_motorizado').value,
        monto: parseFloat(document.getElementById('s_monto').value),
        descripcion: document.getElementById('s_desc').value || null,
    };

    const res = await apiFetch('/servicios', { method: 'POST', body });
    if (res?.id) {
        showToast(`✅ Servicio registrado — ${res.tipo}`);
        document.getElementById('formServicio').reset();
        document.getElementById('s_tipo').value = '';
        document.querySelectorAll('.tipo-chip').forEach(c => c.classList.remove('selected'));

        // Mostrar último servicio
        document.getElementById('ultimoServicio').innerHTML = `
      <div style="padding:10px;background:var(--card2);border-radius:8px;border:1px solid var(--border)">
        <div style="color:var(--g1);font-weight:700">${res.tipo.toUpperCase()} — ${fmt(res.monto)}</div>
        <div style="margin-top:4px">Registrado correctamente</div>
      </div>`;

        await loadFlotaDisp(); // refrescar flota
    } else {
        showToast('❌ Error al registrar servicio', 'err');
    }
}

async function loadActivos() {
    const data = await apiFetch('/servicios?estado=en_curso');
    if (!data) return;
    const tbody = document.getElementById('activosBody');
    tbody.innerHTML = data.length
        ? data.map(s => `
        <tr>
          <td>${fmtDate(s.fecha_inicio)}</td>
          <td>${s.tipo}</td>
          <td>${s.cliente_nombre || '—'}</td>
          <td>${s.motorizado_nombre || '—'}</td>
          <td>${fmt(s.monto)}</td>
          <td>
            <button class="btn-icon" onclick="abrirCierre('${s.id}')">✅ Cerrar</button>
          </td>
        </tr>`).join('')
        : '<tr><td colspan="6" class="loading-txt">Sin servicios en curso</td></tr>';
}

async function loadHistorial() {
    const data = await apiFetch('/servicios?hoy=1');
    if (!data) return;
    const tbody = document.getElementById('historialBody');
    tbody.innerHTML = data.length
        ? data.map(s => `
        <tr>
          <td>${fmtDate(s.fecha_inicio)}</td>
          <td>${s.tipo}</td>
          <td>${s.cliente_nombre || '—'}</td>
          <td>${s.motorizado_nombre || '—'}</td>
          <td>${fmt(s.monto)}</td>
          <td>${estadoBadge(s.estado)}</td>
          <td>${s.tiene_nota ? '<span class="badge badge-green">✓</span>' : '—'}</td>
        </tr>`).join('')
        : '<tr><td colspan="7" class="loading-txt">Sin servicios hoy</td></tr>';
}

async function loadFlotaCC() {
    const motos = await apiFetch('/motorizados');
    if (!motos) return;
    const grid = document.getElementById('motosGridCC');
    grid.innerHTML = motos.map(m => `
    <div class="moto-card ${m.estado}">
      <div class="moto-icon">🛵</div>
      <div class="moto-name">${m.nombre}</div>
      <div class="moto-estado estado-${m.estado}">${m.estado.replace('_', ' ')}</div>
    </div>`).join('');
}

function abrirCierre(id) {
    document.getElementById('cierre_id').value = id;
    openModal('modalCierre');
}

async function cerrarServicio() {
    const id = document.getElementById('cierre_id').value;
    const res = await apiFetch(`/servicios/${id}/cerrar`, { method: 'PATCH' });
    if (res?.ok) {
        showToast('✅ Servicio cerrado — Nota de entrega generada');
        closeModal('modalCierre');
        loadActivos();
    } else {
        showToast('❌ Error', 'err');
    }
}

// ── Init
initCC();
document.addEventListener('viewChange', ({ detail: { view } }) => {
    if (view === 'activos') loadActivos();
    if (view === 'historial') loadHistorial();
    if (view === 'flota') loadFlotaCC();
    if (view === 'clientes') loadClientesCC();
});
