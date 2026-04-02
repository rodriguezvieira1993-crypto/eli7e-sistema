// pwa.js — Instalación PWA + Push Notifications
(function () {
    let _deferredPrompt = null;
    let _swRegistration = null;

    // ─── REGISTRO DEL SERVICE WORKER ────────────────────────────
    async function registerSW() {
        if (!('serviceWorker' in navigator)) return null;
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            _swRegistration = reg;
            console.log('✅ Service Worker registrado');
            return reg;
        } catch (err) {
            console.log('⚠️ SW error:', err.message);
            return null;
        }
    }

    // ─── BANNER DE INSTALACIÓN ──────────────────────────────────
    function showInstallBanner() {
        // No mostrar si ya está instalado como PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if (window.navigator.standalone === true) return;

        // No mostrar si el usuario ya lo descartó esta sesión
        if (sessionStorage.getItem('eli7e_install_dismissed')) return;

        // Crear banner
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                <img src="/img/icon-192.png" alt="Eli7e" style="width:40px;height:40px;border-radius:10px;flex-shrink:0;">
                <div style="min-width:0;">
                    <div style="font-weight:700;font-size:.92rem;color:#E4F5E4;">Instalar Eli7e</div>
                    <div style="font-size:.72rem;color:#7A9A7A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Acceso rápido + notificaciones</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="pwa-install-btn" style="background:linear-gradient(135deg,#00DD00,#007700);color:#000;border:none;border-radius:8px;padding:8px 18px;font-weight:700;font-family:inherit;font-size:.82rem;cursor:pointer;">Instalar</button>
                <button id="pwa-dismiss-btn" style="background:none;border:1px solid rgba(0,221,0,.2);border-radius:8px;padding:8px 12px;color:#7A9A7A;font-family:inherit;font-size:.82rem;cursor:pointer;">Luego</button>
            </div>
        `;
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#0F180F;border-top:1px solid rgba(0,221,0,.2);padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 -4px 20px rgba(0,0,0,.5);animation:slideUp .4s ease-out;';

        // Agregar animación
        const style = document.createElement('style');
        style.textContent = '@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.head.appendChild(style);

        document.body.appendChild(banner);

        // Botón instalar
        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (_deferredPrompt) {
                _deferredPrompt.prompt();
                const { outcome } = await _deferredPrompt.userChoice;
                _deferredPrompt = null;
                if (outcome === 'accepted') {
                    banner.remove();
                    // Después de instalar, pedir permisos de notificación
                    setTimeout(() => requestNotificationPermission(), 1500);
                }
            } else {
                // En iOS o navegadores sin beforeinstallprompt
                banner.innerHTML = `
                    <div style="text-align:center;width:100%;padding:8px 0;">
                        <div style="font-weight:700;font-size:.88rem;color:#E4F5E4;margin-bottom:6px;">Para instalar Eli7e:</div>
                        <div style="font-size:.78rem;color:#7A9A7A;">Toca <strong style="color:#00DD00;">Compartir ↗</strong> y luego <strong style="color:#00DD00;">"Agregar a pantalla de inicio"</strong></div>
                        <button onclick="this.parentElement.parentElement.remove();sessionStorage.setItem('eli7e_install_dismissed','1')" style="margin-top:10px;background:none;border:1px solid rgba(0,221,0,.2);border-radius:8px;padding:6px 16px;color:#7A9A7A;font-family:inherit;font-size:.78rem;cursor:pointer;">Entendido</button>
                    </div>`;
            }
        });

        // Botón descartar
        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
            banner.remove();
            sessionStorage.setItem('eli7e_install_dismissed', '1');
        });
    }

    // Capturar evento de instalación
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        // Mostrar banner después de un momento
        setTimeout(showInstallBanner, 2000);
    });

    // Si ya se instaló
    window.addEventListener('appinstalled', () => {
        _deferredPrompt = null;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.remove();
        setTimeout(() => requestNotificationPermission(), 1000);
    });

    // ─── PUSH NOTIFICATIONS ─────────────────────────────────────
    async function requestNotificationPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            await subscribeToPush();
            return;
        }
        if (Notification.permission === 'denied') return;

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            await subscribeToPush();
        }
    }

    async function subscribeToPush() {
        if (!_swRegistration) return;

        try {
            // Obtener clave pública VAPID del servidor
            const resp = await fetch('/api/push/vapid-key');
            if (!resp.ok) return;
            const { publicKey } = await resp.json();
            if (!publicKey) return;

            // Convertir clave a Uint8Array
            const appServerKey = urlBase64ToUint8Array(publicKey);

            // Suscribirse a push
            const subscription = await _swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: appServerKey
            });

            // Enviar suscripción al servidor
            const token = localStorage.getItem('eli7e_token');
            if (!token) return;

            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ subscription: subscription.toJSON() })
            });

            console.log('✅ Push subscription guardada');
        } catch (err) {
            console.log('⚠️ Push subscribe error:', err.message);
        }
    }

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // ─── INIT ───────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async () => {
        const reg = await registerSW();

        // Si ya tiene permiso de notificaciones, re-suscribir
        if (reg && Notification.permission === 'granted') {
            await subscribeToPush();
        }

        // Mostrar banner de instalación si no está instalado
        // (en navegadores que no disparan beforeinstallprompt, mostrarlo después de un delay)
        if (!window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
            // En iOS, no existe beforeinstallprompt — mostrar banner instructivo
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            if (isIOS && !sessionStorage.getItem('eli7e_install_dismissed')) {
                setTimeout(showInstallBanner, 3000);
            }
        }
    });
})();
