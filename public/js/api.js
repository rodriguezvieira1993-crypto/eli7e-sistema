// ─── api.js — helpers globales para todos los dashboards ───────────────────

const API = '/api';

function getToken() {
    return localStorage.getItem('eli7e_token');
}
function getUser() {
    const u = localStorage.getItem('eli7e_user');
    return u ? JSON.parse(u) : null;
}

// Fetch autenticado
async function apiFetch(path, opts = {}) {
    const token = getToken();
    const res = await fetch(API + path, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(opts.headers || {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    if (res.status === 401) {
        logout();
        return null;
    }
    return res.json();
}

// Toast notification
function showToast(msg, type = 'ok', duration = 3500) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.classList.remove('show'), duration);
}

// Modal helpers
function openModal(id) {
    document.getElementById(id).classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// Logout
function logout() {
    localStorage.removeItem('eli7e_token');
    localStorage.removeItem('eli7e_user');
    window.location.href = '/';
}

// Toggle sidebar (mobile)
function toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
}

// Formatear moneda
function fmt(v) {
    return '$' + parseFloat(v || 0).toFixed(2);
}

// Formatear fecha/hora
function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-VE') + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

// Semáforo de deuda
function semaforoDeuda(deuda) {
    const d = parseFloat(deuda);
    if (d > 50) return '<span class="badge badge-red">🔴 Crítica</span>';
    if (d > 20) return '<span class="badge badge-yellow">🟡 Alerta</span>';
    if (d > 0) return '<span class="badge badge-green">🟢 Bajo</span>';
    return '<span class="badge badge-blue">✅ Al día</span>';
}

// Estado motorizado
function estadoBadge(e) {
    const map = {
        disponible: '<span class="badge badge-green">Disponible</span>',
        en_servicio: '<span class="badge badge-yellow">En Servicio</span>',
        inactivo: '<span class="badge badge-red">Inactivo</span>',
    };
    return map[e] || e;
}

// Verificar sesión al cargar
(function initSession() {
    const user = getUser();
    const token = getToken();
    if (!user || !token) { window.location.href = '/'; return; }

    // Mostrar nombre en sidebar
    const el = document.getElementById('userName');
    if (el) el.textContent = user.nombre;

    // Fecha en topbar
    const df = document.getElementById('topbarDate');
    if (df) {
        const now = new Date();
        df.textContent = now.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    // Navegación por tabs
    document.querySelectorAll('.sb-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            if (!view) return;
            document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            const target = document.getElementById('view-' + view);
            if (target) {
                target.classList.add('active');
                // Actualizar título topbar
                const title = document.getElementById('pageTitle');
                if (title) title.textContent = link.textContent.trim().replace(/^[\p{Emoji}\s]+/u, '');
            }
            // En móvil cerrar sidebar
            document.getElementById('sidebar')?.classList.remove('open');
            // Disparar evento para que los scripts carguen datos
            document.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
        });
    });
})();
