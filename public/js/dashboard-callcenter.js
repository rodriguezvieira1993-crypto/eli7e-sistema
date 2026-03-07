// dashboard-callcenter.js
let allClientesCC = [];
let motosDisponibles = [];

// ── Zonas de Puerto Ordaz y San Félix ────────────────
const ZONAS = [
    // Puerto Ordaz
    'Alta Vista', 'Alta Vista Sur', 'Altamira', 'Andrés Eloy Blanco',
    'Cachamay', 'Campo A', 'Caronoco', 'Caroní', 'Castillito',
    'Centro Cívico', 'Chirica', 'Ciudad Bolívar (referencia)',
    'Coranzón de Jesús', 'Country Club', 'Dalla Costa',
    'El Golfito', 'El Marqués', 'El Roble', 'El Medio',
    'Ferrominera', 'Guaiparo', 'Guaraguao',
    'Jardines de Caroní', 'La Churuata', 'La Grúa',
    'Las Américas', 'Las Delicias', 'Las Moreas', 'Loefling',
    'Los Olivos', 'Los Próceres', 'Macagua',
    'Manoa', 'Menca de Leoni', 'Mendoza del Medio',
    'Orinoco', 'Orinokia Mall', 'Paseo Caroní',
    'Puerto de Hierro', 'Puerto Ordaz Centro',
    'San Martín de Turumbán', 'Sierra Grande',
    'Terminal de Puerto Ordaz', 'Tascabaña',
    'Unare I', 'Unare II', 'Unare III',
    'Universidad', 'Urb. Angostura', 'Urb. Paraíso',
    'Urb. Villa Africana', 'Urb. Villa Asia', 'Urb. Villa Brasil',
    'Urb. Villa Colombia', 'Urb. Villa Europa',
    'Urb. Villa Alianza', 'Urb. Villa Antillana',
    'Urb. Villa Central', 'Urb. Villa Floresta',
    'Urb. Villa Granada', 'Urb. Villa Icabarú',
    'Urb. Villa Bahía', 'Villa Colombo',
    // San Félix
    'San Félix Centro', 'San Félix Terminal',
    'Bicentenario', 'Cambalache', 'Caruachi',
    'Chirica (San Félix)', 'Dalla Costa (San Félix)',
    'El Perú', 'La Paragua', 'La Sabanita',
    'Los Monos', 'Manoa (San Félix)', 'Mango Verde',
    'Mercado de San Félix', 'Pica Pica',
    'San Félix - AV. Guayana', 'San Pedro',
    'Simón Bolívar', 'Tumeremo', 'Vista al Sol',
    'Vista Hermosa', 'W', 'Zulia',
    // Zonas Industriales / Comerciales
    'Zona Industrial UD-321', 'Zona Industrial Matanzas',
    'Zona Industrial Chirica', 'Zona Industrial Los Pinos',
    'C.C. Alta Vista', 'C.C. Orinokia', 'C.C. Churún Merú',
    'Heres', 'Caicara del Orinoco',
    'Aeropuerto', 'Terminal de San Félix',
    'Puente Angosturita', 'Puente Orinoquia',
    // Otros
    'Otro (escribir)'
];

// ── Seleccionar tipo de servicio ─────────────────────
function selectTipo(el) {
    document.querySelectorAll('.tipo-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('s_tipo').value = el.dataset.tipo;
    renderCampos(el.dataset.tipo);
}

// ── Renderizar campos dinámicos según tipo ───────────
function renderCampos(tipo) {
    const container = document.getElementById('camposDinamicos');

    if (tipo === 'mototaxi') {
        container.innerHTML = `
            <div class="field">
                <label>Cliente *</label>
                <input type="text" id="s_cliente_nombre" placeholder="Nombre del cliente" required>
            </div>

            <div class="field">
                <label>Motorizado *</label>
                <select id="s_motorizado" required>
                    <option value="">— Seleccionar —</option>
                </select>
            </div>

            <div class="field">
                <label>Monto (USD) *</label>
                <input type="hidden" id="s_monto">
                <div class="tipo-chips">
                    <div class="monto-chip" data-monto="2" onclick="selectMonto(this)">
                        <span class="tipo-icon">💵</span>
                        <span class="tipo-label">$2</span>
                    </div>
                    <div class="monto-chip" data-monto="4" onclick="selectMonto(this)">
                        <span class="tipo-icon">💵</span>
                        <span class="tipo-label">$4</span>
                    </div>
                    <div class="monto-chip" data-monto="6" onclick="selectMonto(this)">
                        <span class="tipo-icon">💵</span>
                        <span class="tipo-label">$6</span>
                    </div>
                    <div class="monto-chip" data-monto="8" onclick="selectMonto(this)">
                        <span class="tipo-icon">💵</span>
                        <span class="tipo-label">$8</span>
                    </div>
                    <div class="monto-chip monto-custom" data-monto="custom" onclick="selectMonto(this)">
                        <span class="tipo-icon">✏️</span>
                        <span class="tipo-label">Otro</span>
                    </div>
                </div>
                <input type="number" id="s_monto_custom" step="0.01" min="0.01" placeholder="Monto personalizado..."
                    style="display:none;margin-top:10px;" oninput="document.getElementById('s_monto').value=this.value">
            </div>

            <div class="field">
                <label>Ruta</label>
                <div style="display:flex;gap:10px;">
                    <div class="autocomplete-wrap" style="flex:1">
                        <input type="text" id="s_ruta_de" placeholder="📍 De..." autocomplete="off">
                        <div class="autocomplete-list" id="ac_de"></div>
                    </div>
                    <div class="autocomplete-wrap" style="flex:1">
                        <input type="text" id="s_ruta_hasta" placeholder="📍 Hasta..." autocomplete="off">
                        <div class="autocomplete-list" id="ac_hasta"></div>
                    </div>
                </div>
            </div>

            <div class="field">
                <label>Descripción / Observaciones</label>
                <textarea id="s_desc" rows="2" placeholder="Detalles adicionales..."></textarea>
            </div>`;
        fillMotosSelect();
        initAutocomplete('s_ruta_de', 'ac_de');
        initAutocomplete('s_ruta_hasta', 'ac_hasta');
    } else {
        // Campos por defecto para los demás tipos
        container.innerHTML = `
            <div class="field">
                <label>Cliente / Marca *</label>
                <select id="s_cliente" required>
                    <option value="">— Seleccionar —</option>
                </select>
            </div>

            <div class="field">
                <label>Motorizado *</label>
                <select id="s_motorizado" required>
                    <option value="">— Seleccionar —</option>
                </select>
            </div>

            <div class="field">
                <label>Monto acordado (USD) *</label>
                <input type="number" id="s_monto" step="0.01" min="0.01" required placeholder="0.00">
            </div>

            <div class="field">
                <label>Descripción / Observaciones</label>
                <textarea id="s_desc" rows="3" placeholder="Origen, destino, detalles del pedido..."></textarea>
            </div>`;
        fillMotosSelect();
        fillClientesSelect();
    }
}

function fillMotosSelect() {
    const sel = document.getElementById('s_motorizado');
    if (!sel) return;
    sel.innerHTML = motosDisponibles.length
        ? '<option value="">— Seleccionar —</option>' + motosDisponibles.map(m => `<option value="${m.id}">🛵 ${m.nombre}</option>`).join('')
        : '<option value="">Sin motorizados disponibles</option>';
}

function fillClientesSelect() {
    const sel = document.getElementById('s_cliente');
    if (!sel) return;
    sel.innerHTML = allClientesCC.length
        ? '<option value="">— Seleccionar —</option>' + allClientesCC.map(c => `<option value="${c.id}">${c.nombre_marca}</option>`).join('')
        : '<option value="">Sin clientes</option>';
}

// ── Autocompletado de zonas ──────────────────────────
function initAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase().trim();
        if (val.length < 1) { list.innerHTML = ''; list.style.display = 'none'; return; }

        const matches = ZONAS.filter(z => z.toLowerCase().includes(val)).slice(0, 8);
        if (matches.length === 0) { list.innerHTML = ''; list.style.display = 'none'; return; }

        list.innerHTML = matches.map(z => `<div class="ac-item" onmousedown="selectZona('${inputId}','${listId}','${z.replace(/'/g, "\\'")}')">${z.replace(
            new RegExp(`(${val})`, 'gi'), '<strong>$1</strong>'
        )}</div>`).join('');
        list.style.display = 'block';
    });

    input.addEventListener('focus', () => {
        if (input.value.length >= 1) input.dispatchEvent(new Event('input'));
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { list.style.display = 'none'; }, 150);
    });
}

function selectZona(inputId, listId, zona) {
    document.getElementById(inputId).value = zona;
    document.getElementById(listId).style.display = 'none';
}

// ── Seleccionar monto chip ───────────────────────────
function selectMonto(el) {
    document.querySelectorAll('.monto-chip').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');

    const customInput = document.getElementById('s_monto_custom');
    const hiddenMonto = document.getElementById('s_monto');

    if (el.dataset.monto === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
        hiddenMonto.value = customInput.value || '';
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
        hiddenMonto.value = el.dataset.monto;
    }
}

// ── Init ─────────────────────────────────────────────
async function initCC() {
    await loadFlotaDisp();
    await loadClientesCC();
}

async function loadFlotaDisp() {
    const motos = await apiFetch('/motorizados/disponibles');
    if (!motos) return;
    motosDisponibles = motos;

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

// ── Crear servicio (dinámico según tipo) ─────────────
async function crearServicio(e) {
    e.preventDefault();
    const tipo = document.getElementById('s_tipo').value;
    if (!tipo) {
        showToast('⚠ Selecciona un tipo de servicio', 'err');
        return;
    }

    const monto = parseFloat(document.getElementById('s_monto')?.value);
    if (!monto || monto <= 0) {
        showToast('⚠ Selecciona o ingresa un monto', 'err');
        return;
    }

    // Construir descripción con ruta si es mototaxi
    let descripcion = document.getElementById('s_desc')?.value || '';
    if (tipo === 'mototaxi') {
        const de = document.getElementById('s_ruta_de')?.value || '';
        const hasta = document.getElementById('s_ruta_hasta')?.value || '';
        const clienteNombre = document.getElementById('s_cliente_nombre')?.value || '';
        if (de || hasta) {
            descripcion = `🚩 ${de} → ${hasta}${clienteNombre ? ' | Cliente: ' + clienteNombre : ''}${descripcion ? ' | ' + descripcion : ''}`;
        }
    }

    const body = {
        tipo,
        cliente_id: document.getElementById('s_cliente')?.value || null,
        motorizado_id: document.getElementById('s_motorizado').value,
        monto,
        descripcion,
    };

    const res = await apiFetch('/servicios', { method: 'POST', body });
    if (res?.id) {
        showToast(`✅ Servicio registrado — ${res.tipo}`);
        document.getElementById('formServicio').reset();
        document.getElementById('s_tipo').value = '';
        document.querySelectorAll('.tipo-chip').forEach(c => c.classList.remove('selected'));
        document.getElementById('camposDinamicos').innerHTML = '';

        // Mostrar último servicio
        document.getElementById('ultimoServicio').innerHTML = `
      <div style="padding:10px;background:var(--card2);border-radius:8px;border:1px solid var(--border)">
        <div style="color:var(--g1);font-weight:700">${res.tipo.toUpperCase()} — ${fmt(res.monto)}</div>
        <div style="margin-top:4px">${descripcion || 'Registrado correctamente'}</div>
      </div>`;

        await loadFlotaDisp();
    } else {
        showToast('❌ Error al registrar servicio', 'err');
    }
}

// ── Vistas: En Curso, Historial, Flota ───────────────
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
