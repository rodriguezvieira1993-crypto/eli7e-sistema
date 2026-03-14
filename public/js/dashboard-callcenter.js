// dashboard-callcenter.js
let allClientesCC = [];
let allMotosCC = [];
let serviciosRecientes = [];
const TIPO_EMOJI = { mototaxi: '🛵', delivery: '📦', encomienda: '📬', compras: '🛒', flete: '🚛', transporte: '🚐' };

// Cargar zonas custom guardadas en localStorage
const zonasCustom = JSON.parse(localStorage.getItem('eli7e_zonas_custom') || '[]');

// Helper: genera los chips de monto reutilizables
function montoChipsHTML() {
    return `<div class="tipo-chips">
        <div class="monto-chip" data-monto="2" onclick="selectMonto(this)"><span class="tipo-icon">💵</span><span class="tipo-label">$2</span></div>
        <div class="monto-chip" data-monto="3" onclick="selectMonto(this)"><span class="tipo-icon">💵</span><span class="tipo-label">$3</span></div>
        <div class="monto-chip" data-monto="4" onclick="selectMonto(this)"><span class="tipo-icon">💵</span><span class="tipo-label">$4</span></div>
        <div class="monto-chip" data-monto="6" onclick="selectMonto(this)"><span class="tipo-icon">💵</span><span class="tipo-label">$6</span></div>
        <div class="monto-chip" data-monto="8" onclick="selectMonto(this)"><span class="tipo-icon">💵</span><span class="tipo-label">$8</span></div>
        <div class="monto-chip monto-custom" data-monto="custom" onclick="selectMonto(this)"><span class="tipo-icon">✏️</span><span class="tipo-label">Otro</span></div>
    </div>
    <input type="number" id="s_monto_custom" step="0.01" min="0.01" placeholder="Monto personalizado..."
        style="display:none;margin-top:10px;" oninput="document.getElementById('s_monto').value=this.value">`;
}

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

    if (['mototaxi', 'encomienda', 'compras', 'transporte'].includes(tipo)) {
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
                ${montoChipsHTML()}
            </div>

            <div class="field">
                <label>${tipo === 'compras' ? 'Local / Destino' : 'Ruta'}</label>
                <div style="display:flex;gap:10px;">
                    <div class="autocomplete-wrap" style="flex:1">
                        <input type="text" id="s_ruta_de" placeholder="${tipo === 'compras' ? '🏪 Local...' : '📍 De...'}" autocomplete="off">
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
    } else if (tipo === 'delivery') {
        container.innerHTML = `
            <div class="field">
                <label>Cliente / Marca *</label>
                <input type="hidden" id="s_cliente">
                <div class="autocomplete-wrap">
                    <input type="text" id="s_cliente_search" placeholder="Escriba el nombre de la marca..." autocomplete="off">
                    <div class="autocomplete-list" id="ac_cliente"></div>
                </div>
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
                ${montoChipsHTML()}
            </div>

            <div class="field">
                <label>Para (destino) *</label>
                <div class="autocomplete-wrap">
                    <input type="text" id="s_ruta_hasta" placeholder="📍 Zona de entrega..." autocomplete="off">
                    <div class="autocomplete-list" id="ac_hasta"></div>
                </div>
            </div>

            <div class="field">
                <label>Descripción / Observaciones</label>
                <textarea id="s_desc" rows="2" placeholder="Detalles del pedido..."></textarea>
            </div>`;
        fillMotosSelect();
        initClienteAutocomplete();
        initAutocomplete('s_ruta_hasta', 'ac_hasta');
    } else {
        // Campos por defecto para los demás tipos
        container.innerHTML = `
            <div class="field">
                <label>Cliente / Marca *</label>
                <input type="hidden" id="s_cliente">
                <div class="autocomplete-wrap">
                    <input type="text" id="s_cliente_search" placeholder="Escriba el nombre de la marca..." autocomplete="off">
                    <div class="autocomplete-list" id="ac_cliente"></div>
                </div>
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
        initClienteAutocomplete();
    }
}

function fillMotosSelect() {
    const sel = document.getElementById('s_motorizado');
    if (!sel) return;
    const activos = allMotosCC.filter(m => m.activo !== false && m.estado !== 'inactivo');
    sel.innerHTML = activos.length
        ? '<option value="">— Seleccionar —</option>' + activos.map(m => {
            const tag = m.estado === 'en_servicio' ? ' ⚡ (En servicio)' : '';
            return `<option value="${m.id}">🛵 ${m.nombre}${tag}</option>`;
          }).join('')
        : '<option value="">Sin motorizados</option>';
}

// ── Autocompletado predictivo de clientes ─────────────
function initClienteAutocomplete() {
    const input = document.getElementById('s_cliente_search');
    const list = document.getElementById('ac_cliente');
    const hidden = document.getElementById('s_cliente');
    if (!input || !list) return;

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase().trim();
        if (val.length < 1) { list.innerHTML = ''; list.style.display = 'none'; hidden.value = ''; return; }
        const matches = allClientesCC.filter(c => c.nombre_marca.toLowerCase().includes(val)).slice(0, 8);
        if (!matches.length) { list.innerHTML = '<div class="ac-item" style="color:var(--muted)">Sin resultados</div>'; list.style.display = 'block'; return; }
        list.innerHTML = matches.map(c => `<div class="ac-item" onmousedown="selectCliente('${c.id}','${c.nombre_marca.replace(/'/g, "\\'")}')"><strong>${c.nombre_marca.replace(
            new RegExp('(' + val + ')', 'gi'), '<u>$1</u>'
        )}</strong></div>`).join('');
        list.style.display = 'block';
    });

    input.addEventListener('focus', () => {
        if (input.value.length >= 1) input.dispatchEvent(new Event('input'));
    });
    input.addEventListener('blur', () => {
        setTimeout(() => { list.style.display = 'none'; }, 150);
    });
}

function selectCliente(id, nombre) {
    document.getElementById('s_cliente').value = id;
    document.getElementById('s_cliente_search').value = nombre;
    document.getElementById('ac_cliente').style.display = 'none';
}

// ── Autocompletado de zonas ──────────────────────────
function initAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;

    const allZonas = () => [...ZONAS, ...zonasCustom.filter(z => !ZONAS.includes(z))];

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase().trim();
        if (val.length < 1) { list.innerHTML = ''; list.style.display = 'none'; return; }

        const matches = allZonas().filter(z => z.toLowerCase().includes(val)).slice(0, 8);
        if (matches.length === 0) {
            list.innerHTML = `<div class="ac-item" style="color:var(--g1)" onmousedown="selectZona('${inputId}','${listId}','${input.value.replace(/'/g, "\\'")}')">➕ Guardar "${input.value}"</div>`;
            list.style.display = 'block';
            return;
        }

        list.innerHTML = matches.map(z => `<div class="ac-item" onmousedown="selectZona('${inputId}','${listId}','${z.replace(/'/g, "\\'")}')"> ${z.replace(
            new RegExp(`(${val})`, 'gi'), '<strong>$1</strong>'
        )}</div>`).join('');
        list.style.display = 'block';
    });

    input.addEventListener('focus', () => {
        if (input.value.length >= 1) input.dispatchEvent(new Event('input'));
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            list.style.display = 'none';
            // Si el usuario escribió algo que no está en la lista, guardarlo
            const typed = input.value.trim();
            if (typed && !allZonas().some(z => z.toLowerCase() === typed.toLowerCase())) {
                saveCustomZona(typed);
            }
        }, 200);
    });
}

function selectZona(inputId, listId, zona) {
    document.getElementById(inputId).value = zona;
    document.getElementById(listId).style.display = 'none';
    // Guardar si es nueva
    const allZonas = [...ZONAS, ...zonasCustom];
    if (!allZonas.some(z => z.toLowerCase() === zona.toLowerCase())) {
        saveCustomZona(zona);
    }
}

function saveCustomZona(zona) {
    if (!zonasCustom.some(z => z.toLowerCase() === zona.toLowerCase())) {
        zonasCustom.push(zona);
        localStorage.setItem('eli7e_zonas_custom', JSON.stringify(zonasCustom));
    }
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
    await loadClientesRegistro(); // Carga todos para el select
    await loadClientesCC();       // Carga cobranza para la tabla
    await loadUltimos();
}

async function loadClientesRegistro() {
    const data = await apiFetch('/clientes');
    if (data && Array.isArray(data)) {
        allClientesCC = data;
    }
}

async function loadFlotaDisp() {
    const motos = await apiFetch('/motorizados');
    if (!motos) return;
    allMotosCC = motos;

    // Panel lateral — muestra TODOS con su estado
    const el = document.getElementById('flotaDisp');
    el.innerHTML = motos.length
        ? motos.filter(m => m.activo !== false).map(m => {
            let dotClass, badgeClass, label;
            if (m.estado === 'disponible') {
                dotClass = 'dot-verde'; badgeClass = 'badge-green'; label = 'Libre';
            } else if (m.estado === 'en_servicio') {
                dotClass = 'dot-amar'; badgeClass = 'badge-yellow'; label = 'En Servicio';
            } else {
                dotClass = 'dot-rojo'; badgeClass = 'badge-red'; label = 'Inactivo';
            }
            return `
            <div class="moto-row">
              <div class="moto-dot ${dotClass}"></div>
              <span style="font-size:.88rem;font-weight:600">${m.nombre}</span>
              <span class="badge ${badgeClass} badge-click" style="margin-left:auto;font-size:.7rem;cursor:pointer"
                    onclick="cambiarEstadoMoto('${m.id}','${m.estado}')" title="Clic para cambiar estado">
                ${label}
              </span>
            </div>`;
        }).join('')
        : '<p style="color:var(--err);font-size:.85rem">⚠ Sin motorizados registrados</p>';
}

// ── Cambiar estado de motorizado con clic ────────────
async function cambiarEstadoMoto(id, estadoActual) {
    const ciclo = { disponible: 'en_servicio', en_servicio: 'inactivo', inactivo: 'disponible' };
    const nuevoEstado = ciclo[estadoActual] || 'disponible';
    const labels = { disponible: 'Libre', en_servicio: 'En Servicio', inactivo: 'Inactivo' };

    const res = await apiFetch(`/motorizados/${id}/estado`, {
        method: 'PATCH',
        body: { estado: nuevoEstado }
    });

    if (res?.id) {
        showToast(`🛵 ${res.nombre} → ${labels[nuevoEstado]}`);
        await loadFlotaDisp();
        // Actualizar select de motorizado si está visible
        fillMotosSelect();
    } else {
        showToast('❌ Error al cambiar estado', 'err');
    }
}

async function loadClientesCC() {
    const data = await apiFetch('/cobranza');
    if (data && Array.isArray(data)) {
        renderClientesCC(data);
    } else {
        // Fallback: si cobranza falla, mostrar lista básica de clientes
        const fallback = await apiFetch('/clientes');
        if (fallback && Array.isArray(fallback)) {
            renderClientesCC(fallback.map(c => ({ ...c, deuda_calculada: 0 })));
        }
    }
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
      <td style="color:${parseFloat(c.deuda_calculada) > 0 ? 'var(--warn)' : 'var(--g1)'}">${fmt(c.deuda_calculada)}</td>
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

    // Construir descripción con ruta según tipo
    let descripcion = document.getElementById('s_desc')?.value || '';
    if (['mototaxi', 'encomienda', 'compras', 'transporte'].includes(tipo)) {
        const de = document.getElementById('s_ruta_de')?.value || '';
        const hasta = document.getElementById('s_ruta_hasta')?.value || '';
        const clienteNombre = document.getElementById('s_cliente_nombre')?.value || '';
        if (de || hasta) {
            descripcion = `🚩 ${de} → ${hasta}${clienteNombre ? ' | Cliente: ' + clienteNombre : ''}${descripcion ? ' | ' + descripcion : ''}`;
        }
    } else if (tipo === 'delivery') {
        const hasta = document.getElementById('s_ruta_hasta')?.value || '';
        if (hasta) {
            descripcion = `📦 Para: ${hasta}${descripcion ? ' | ' + descripcion : ''}`;
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

        // Agregar al historial reciente
        serviciosRecientes.unshift({
            id: res.id,
            tipo: res.tipo,
            monto: res.monto,
            estado: res.estado || 'pendiente',
            descripcion: descripcion || '',
            hora: new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
            motorizado_nombre: allMotosCC.find(m => m.id === body.motorizado_id)?.nombre || '—'
        });
        if (serviciosRecientes.length > 10) serviciosRecientes.pop();
        renderUltimos();

        await loadFlotaDisp();
    } else {
        showToast('❌ Error al registrar servicio', 'err');
    }
}

// ── Renderizar mini historial de últimos servicios ───
function renderUltimos() {
    const container = document.getElementById('ultimosServicios');
    if (!container) return;
    if (serviciosRecientes.length === 0) {
        container.innerHTML = '<p class="loading-txt" style="font-size:.82rem;">Sin registros aún.</p>';
        return;
    }
    container.innerHTML = serviciosRecientes.map(s => {
        const btns = s.estado === 'pendiente'
            ? `<div style="display:flex;gap:4px;margin-top:6px;">
                 <button class="btn-icon" style="flex:1;font-size:.72rem;padding:5px;background:rgba(0,221,0,.1);border:1px solid rgba(0,221,0,.2);border-radius:6px;color:#00dd00;" onclick="cerrarDesdeUltimos('${s.id}')">✅ Cerrar</button>
                 <button class="btn-icon" style="flex:1;font-size:.72rem;padding:5px;background:rgba(0,150,255,.1);border:1px solid rgba(0,150,255,.2);border-radius:6px;color:#0096ff;" onclick="editarServicio('${s.id}')">✏️ Editar</button>
                 <button class="btn-icon" style="flex:1;font-size:.72rem;padding:5px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);border-radius:6px;color:#FF4444;" onclick="eliminarServicio('${s.id}')">🗑️ Borrar</button>
               </div>`
            : `<div style="display:flex;gap:4px;margin-top:6px;align-items:center;">
                 <span class="badge badge-green" style="font-size:.7rem;">Completado</span>
                 <button class="btn-icon" style="margin-left:auto;font-size:.72rem;padding:5px;background:rgba(255,68,68,.1);border:1px solid rgba(255,68,68,.2);border-radius:6px;color:#FF4444;" onclick="eliminarServicio('${s.id}')">🗑️</button>
               </div>`;
        return `
      <div class="ultimo-card">
        <div class="ultimo-top">
          <span class="ultimo-tipo">${TIPO_EMOJI[s.tipo] || '📋'} ${s.tipo.toUpperCase()}</span>
          <span class="ultimo-monto">${fmt(s.monto)}</span>
        </div>
        <div class="ultimo-detalle">
          ${s.motorizado_nombre ? '🛵 ' + s.motorizado_nombre : ''}
          ${s.hora ? ' · ' + s.hora : ''}
        </div>
        ${s.descripcion ? '<div class="ultimo-desc">' + s.descripcion + '</div>' : ''}
        ${btns}
      </div>`;
    }).join('');
}

async function loadUltimos() {
    const data = await apiFetch('/servicios?hoy=1&limit=10');
    if (!data || !data.length) return;
    serviciosRecientes = data.map(s => ({
        id: s.id,
        tipo: s.tipo,
        monto: s.monto,
        estado: s.estado,
        cliente_id: s.cliente_id,
        motorizado_id: s.motorizado_id,
        descripcion: s.descripcion || '',
        hora: s.fecha_inicio ? new Date(s.fecha_inicio).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '',
        motorizado_nombre: s.motorizado_nombre || '—'
    }));
    renderUltimos();
}

// ── Cerrar servicio desde últimos registrados ─────────
async function cerrarDesdeUltimos(id) {
    const res = await apiFetch('/servicios/' + id + '/cerrar', { method: 'PATCH' });
    if (res?.ok) {
        showToast('✅ Servicio cerrado — reflejado en cobranza');
        const s = serviciosRecientes.find(x => x.id === id);
        if (s) s.estado = 'completado';
        renderUltimos();
        await loadFlotaDisp();
        fillMotosSelect();
    } else {
        showToast('❌ Error al cerrar servicio', 'err');
    }
}

// ── Editar servicio ───────────────────────────────────
async function editarServicio(id) {
    const s = serviciosRecientes.find(x => x.id === id);
    if (!s) return;

    // Llenar modal de edición
    document.getElementById('es_id').value = id;
    document.getElementById('es_monto').value = s.monto;
    document.getElementById('es_desc').value = s.descripcion || '';

    // Llenar select de motorizado
    const selMoto = document.getElementById('es_motorizado');
    const activos = allMotosCC.filter(m => m.activo !== false && m.estado !== 'inactivo');
    selMoto.innerHTML = activos.map(m => {
        const tag = m.estado === 'en_servicio' ? ' ⚡' : '';
        return `<option value="${m.id}" ${m.id === s.motorizado_id ? 'selected' : ''}>🛵 ${m.nombre}${tag}</option>`;
    }).join('');

    openModal('modalEditServicio');
}

async function guardarEdicionServicio(e) {
    e.preventDefault();
    const id = document.getElementById('es_id').value;
    const body = {
        motorizado_id: document.getElementById('es_motorizado').value,
        monto: parseFloat(document.getElementById('es_monto').value),
        descripcion: document.getElementById('es_desc').value,
    };
    const res = await apiFetch('/servicios/' + id, { method: 'PUT', body });
    if (res?.id) {
        showToast('✅ Servicio actualizado');
        closeModal('modalEditServicio');
        await loadUltimos();
        await loadFlotaDisp();
    } else {
        showToast('❌ ' + (res?.error || 'Error al editar'), 'err');
    }
}

// ── Eliminar servicio ─────────────────────────────────
async function eliminarServicio(id) {
    if (!confirm('⚠️ ¿Seguro que quieres eliminar este servicio?\n\nEsta acción no se puede deshacer.')) return;
    const res = await apiFetch('/servicios/' + id, { method: 'DELETE' });
    if (res?.ok) {
        showToast('🗑️ Servicio eliminado');
        serviciosRecientes = serviciosRecientes.filter(x => x.id !== id);
        renderUltimos();
        await loadFlotaDisp();
        fillMotosSelect();
    } else {
        showToast('❌ ' + (res?.error || 'Error al eliminar'), 'err');
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
