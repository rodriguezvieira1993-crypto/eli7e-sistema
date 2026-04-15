// ─── api.js — helpers globales para todos los dashboards ───────────────────

const API = '/api';
const _gsap = () => typeof gsap !== 'undefined';

function getToken() {
    return localStorage.getItem('eli7e_token');
}
function getUser() {
    const u = localStorage.getItem('eli7e_user');
    return u ? JSON.parse(u) : null;
}

// Mapa de dashboards por rol
const ROLE_DASHBOARD = {
    admin: '/dashboard-admin.html',
    call_center: '/dashboard-callcenter.html',
    contable: '/dashboard-contable.html',
    motorizado: '/dashboard-motorizado.html',
};

// Redirige al dashboard correcto si el rol no coincide con los permitidos
function requireRole(...allowedRoles) {
    const user = getUser();
    if (!user || !getToken()) { window.location.href = '/'; return false; }
    if (!allowedRoles.includes(user.rol)) {
        const dest = ROLE_DASHBOARD[user.rol];
        if (dest) window.location.href = dest;
        else { logout(); }
        return false;
    }
    return true;
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

// ─── ESCAPE HTML (XSS protection) ─────────────────────
// Usar SIEMPRE al inyectar datos provenientes de la API en innerHTML.
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── TOAST (GSAP-enhanced) ────────────────────────────
function showToast(msg, type = 'ok', duration = 3500) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;

    if (_gsap()) {
        t.className = `toast show ${type}`;
        gsap.killTweensOf(t);
        gsap.fromTo(t,
            { y: 40, opacity: 0, scale: 0.92 },
            {
                y: 0, opacity: 1, scale: 1,
                duration: 0.35, ease: 'back.out(1.4)',
                onComplete: () => {
                    gsap.to(t, {
                        y: 20, opacity: 0,
                        duration: 0.25, ease: 'power2.in',
                        delay: duration / 1000,
                        onComplete: () => t.classList.remove('show'),
                    });
                },
            }
        );
    } else {
        t.className = `toast show ${type}`;
        setTimeout(() => t.classList.remove('show'), duration);
    }
}

// ─── MODAL (GSAP-enhanced) ────────────────────────────
function openModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('open');

    if (_gsap()) {
        const modal = overlay.querySelector('.modal');
        const fields = modal ? modal.querySelectorAll('.field') : [];

        gsap.fromTo(overlay,
            { opacity: 0 },
            { opacity: 1, duration: 0.2, ease: 'power2.out' }
        );
        if (modal) {
            gsap.fromTo(modal,
                { scale: 0.88, y: 24, opacity: 0 },
                { scale: 1, y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.2)', delay: 0.04 }
            );
        }
        if (fields.length) {
            gsap.fromTo(fields,
                { y: 8, opacity: 0 },
                { y: 0, opacity: 1, duration: 0.2, stagger: 0.04, ease: 'power2.out', delay: 0.12 }
            );
        }
    }
}

function closeModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;

    if (_gsap()) {
        const modal = overlay.querySelector('.modal');
        const tl = gsap.timeline({
            onComplete: () => {
                overlay.classList.remove('open');
                gsap.set([overlay, modal].filter(Boolean), { clearProps: 'all' });
            },
        });
        if (modal) tl.to(modal, { scale: 0.92, y: 12, opacity: 0, duration: 0.18, ease: 'power2.in' });
        tl.to(overlay, { opacity: 0, duration: 0.18, ease: 'power2.in' }, '-=0.08');
    } else {
        overlay.classList.remove('open');
    }
}

// Logout
function logout() {
    localStorage.removeItem('eli7e_token');
    localStorage.removeItem('eli7e_user');
    window.location.href = '/';
}

// Toggle sidebar (mobile)
function toggleSidebar(forceClose) {
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('sidebarBackdrop');
    if (!sb) return;

    const isOpen = forceClose === true || sb.classList.contains('open');

    if (isOpen) {
        // Cerrar
        if (_gsap()) {
            gsap.to(sb, {
                x: -260, duration: 0.25, ease: 'power3.in',
                onComplete: () => { sb.classList.remove('open'); gsap.set(sb, { clearProps: 'x' }); },
            });
        } else {
            sb.classList.remove('open');
        }
        if (bd) bd.classList.remove('visible');
    } else {
        // Abrir
        sb.classList.add('open');
        if (bd) bd.classList.add('visible');
        if (_gsap()) {
            gsap.fromTo(sb, { x: -260 }, { x: 0, duration: 0.3, ease: 'power3.out' });
        }
    }
}

// Cerrar sidebar al seleccionar un link del menú (móvil)
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.sb-link').forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) toggleSidebar(true);
        });
    });
});

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

// Semáforo de deuda (umbrales dinámicos desde parámetros del sistema)
let _umbralCritica = 50, _umbralAlerta = 20, _umbralesCargados = false;
async function cargarUmbralesDeuda() {
    if (_umbralesCargados) return;
    const data = await apiFetch('/parametros/umbrales');
    if (data && !data.error) {
        _umbralCritica = data.critica;
        _umbralAlerta = data.alerta;
        _umbralesCargados = true;
    }
}
function semaforoDeuda(deuda) {
    const d = parseFloat(deuda);
    if (d > _umbralCritica) return '<span class="badge badge-red">🔴 Crítica</span>';
    if (d > _umbralAlerta) return '<span class="badge badge-yellow">🟡 Alerta</span>';
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

// ─── VIEW TRANSITIONS (GSAP-enhanced) ─────────────────
let _currentViewId = null;

function switchView(viewName) {
    const fromEl = _currentViewId ? document.getElementById('view-' + _currentViewId) : document.querySelector('.view.active');
    const toEl = document.getElementById('view-' + viewName);
    if (!toEl || toEl === fromEl) return;

    if (_gsap() && fromEl && fromEl !== toEl) {
        gsap.to(fromEl, {
            opacity: 0, y: -8, duration: 0.18, ease: 'power2.in',
            onComplete: () => {
                fromEl.classList.remove('active');
                gsap.set(fromEl, { clearProps: 'all' });
                toEl.classList.add('active');
                gsap.fromTo(toEl,
                    { opacity: 0, y: 12 },
                    { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
                );
                if (typeof ELI7E !== 'undefined') ELI7E.animateViewContent(toEl);
            },
        });
    } else {
        if (fromEl) { fromEl.classList.remove('active'); }
        toEl.classList.add('active');
        if (_gsap()) {
            gsap.fromTo(toEl,
                { opacity: 0, y: 12 },
                { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
            );
            if (typeof ELI7E !== 'undefined') ELI7E.animateViewContent(toEl);
        }
    }
    _currentViewId = viewName;
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

    // Track initial active view
    const initialView = document.querySelector('.view.active');
    if (initialView) _currentViewId = initialView.id.replace('view-', '');

    // Navegación por tabs (GSAP-enhanced)
    document.querySelectorAll('.sb-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const view = link.dataset.view;
            if (!view) return;          // links reales (href externo) navegan normal
            e.preventDefault();

            // Sidebar active state
            const oldActive = document.querySelector('.sb-link.active');
            document.querySelectorAll('.sb-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            if (typeof ELI7E !== 'undefined') ELI7E.animateSidebarSwitch(oldActive, link);

            // View transition
            switchView(view);

            // Actualizar título topbar
            const title = document.getElementById('pageTitle');
            if (title) title.textContent = link.textContent.trim().replace(/^[\p{Emoji}\s]+/u, '');

            // En móvil cerrar sidebar
            const sb = document.getElementById('sidebar');
            if (sb && sb.classList.contains('open')) {
                if (_gsap()) {
                    gsap.to(sb, {
                        x: -260, duration: 0.3, ease: 'power3.in',
                        onComplete: () => { sb.classList.remove('open'); gsap.set(sb, { clearProps: 'x' }); },
                    });
                } else {
                    sb.classList.remove('open');
                }
            }

            // Disparar evento para que los scripts carguen datos
            document.dispatchEvent(new CustomEvent('viewChange', { detail: { view } }));
        });
    });
})();
