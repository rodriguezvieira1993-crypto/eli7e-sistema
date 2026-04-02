// pwa.js — Instalación PWA + Push Notifications
(function () {
    let _deferredPrompt = null;
    let _swRegistration = null;
    let _bannerShown = false;

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
        if (_bannerShown) return;
        // No mostrar si ya está instalado como PWA
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        if (window.navigator.standalone === true) return;
        // No mostrar si ya descartó esta sesión
        if (sessionStorage.getItem('eli7e_install_dismissed')) return;
        _bannerShown = true;

        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                <img src="/img/icon-192.png" alt="Eli7e" style="width:44px;height:44px;border-radius:12px;flex-shrink:0;background:#060B06;">
                <div style="min-width:0;">
                    <div style="font-weight:700;font-size:.95rem;color:#E4F5E4;">Descargar Eli7e</div>
                    <div style="font-size:.74rem;color:#7A9A7A;">Instala la app para recibir notificaciones</div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="pwa-install-btn" style="background:linear-gradient(135deg,#00DD00,#007700);color:#000;border:none;border-radius:10px;padding:10px 20px;font-weight:700;font-family:inherit;font-size:.88rem;cursor:pointer;">Descargar</button>
                <button id="pwa-dismiss-btn" style="background:none;border:1px solid rgba(0,221,0,.25);border-radius:10px;padding:10px 14px;color:#7A9A7A;font-family:inherit;font-size:.82rem;cursor:pointer;">Luego</button>
            </div>
        `;
        banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:#0A140A;border-top:2px solid rgba(0,221,0,.3);padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;box-shadow:0 -6px 30px rgba(0,0,0,.7);animation:pwaSlideUp .5s ease-out;';

        const style = document.createElement('style');
        style.textContent = '@keyframes pwaSlideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.head.appendChild(style);

        document.body.appendChild(banner);

        // Botón instalar
        document.getElementById('pwa-install-btn').addEventListener('click', async () => {
            if (_deferredPrompt) {
                // Chrome: usar el prompt nativo
                _deferredPrompt.prompt();
                const { outcome } = await _deferredPrompt.userChoice;
                _deferredPrompt = null;
                if (outcome === 'accepted') {
                    banner.remove();
                    setTimeout(() => requestNotificationPermission(), 1500);
                }
            } else {
                // Android sin prompt / iOS / otros: mostrar instrucciones
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                const isAndroid = /Android/.test(navigator.userAgent);

                let instructions = '';
                if (isIOS) {
                    instructions = 'Toca el botón <strong style="color:#00DD00;">Compartir ↗</strong> abajo y luego <strong style="color:#00DD00;">"Agregar a pantalla de inicio"</strong>';
                } else if (isAndroid) {
                    instructions = 'Toca los <strong style="color:#00DD00;">3 puntos ⋮</strong> del navegador y luego <strong style="color:#00DD00;">"Instalar app"</strong> o <strong style="color:#00DD00;">"Agregar a pantalla de inicio"</strong>';
                } else {
                    instructions = 'Usa el menú del navegador para <strong style="color:#00DD00;">"Instalar"</strong> o <strong style="color:#00DD00;">"Agregar a pantalla de inicio"</strong>';
                }

                banner.innerHTML = `
                    <div style="width:100%;padding:4px 0;">
                        <div style="font-weight:700;font-size:.92rem;color:#E4F5E4;margin-bottom:8px;">📲 Para instalar Eli7e:</div>
                        <div style="font-size:.82rem;color:#7A9A7A;line-height:1.5;">${instructions}</div>
                        <button onclick="this.parentElement.parentElement.remove();sessionStorage.setItem('eli7e_install_dismissed','1')" style="margin-top:12px;background:linear-gradient(135deg,#00DD00,#007700);color:#000;border:none;border-radius:8px;padding:8px 20px;font-weight:700;font-family:inherit;font-size:.82rem;cursor:pointer;">Entendido</button>
                    </div>`;
            }
        });

        // Botón descartar
        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
            banner.remove();
            sessionStorage.setItem('eli7e_install_dismissed', '1');
        });
    }

    // Capturar evento de instalación (Chrome en Android/Desktop)
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        showInstallBanner();
    });

    // Después de instalar
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
            const resp = await fetch('/api/push/vapid-key');
            if (!resp.ok) return;
            const { publicKey } = await resp.json();
            if (!publicKey) return;

            const appServerKey = urlBase64ToUint8Array(publicKey);

            const subscription = await _swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: appServerKey
            });

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

        // Si ya tiene permiso, re-suscribir silenciosamente
        if (reg && 'Notification' in window && Notification.permission === 'granted') {
            await subscribeToPush();
        }

        // Mostrar banner de instalación en TODOS los dispositivos móviles
        // después de 3 segundos (da tiempo a que cargue la página)
        if (!window.matchMedia('(display-mode: standalone)').matches && !window.navigator.standalone) {
            setTimeout(showInstallBanner, 3000);
        }
    });
})();
