// chat.js — Chat interno tipo WhatsApp (compartido entre todos los dashboards)
(function () {
    let socket = null;
    let canalActual = 'general';
    let chatAbierto = false;
    let unreadCount = 0;
    let todosUsuarios = [];

    const CANALES = [
        { id: 'general', nombre: 'General', icono: '💬' },
        { id: 'operaciones', nombre: 'Operaciones', icono: '🛵' },
        { id: 'admin', nombre: 'Administración', icono: '👑' }
    ];

    const ROL_COLOR = {
        admin: '#FFD700',
        call_center: '#00BFFF',
        contable: '#FF69B4',
        motorizado: '#00DD00'
    };

    const ROL_LABEL = {
        admin: 'Admin',
        call_center: 'Call Center',
        contable: 'Contable',
        motorizado: 'Motorizado'
    };

    function getUser() {
        try { return JSON.parse(localStorage.getItem('eli7e_user')); } catch { return null; }
    }

    function getToken() {
        return localStorage.getItem('eli7e_token');
    }

    // ─── CREAR UI ──────────────────────────────────────────
    function createChatUI() {
        const style = document.createElement('style');
        style.textContent = `
            #chatFloatBtn {
                position:fixed;bottom:24px;right:24px;z-index:9990;
                width:56px;height:56px;border-radius:50%;
                background:linear-gradient(135deg,#00DD00,#007700);
                border:none;cursor:pointer;
                display:flex;align-items:center;justify-content:center;
                font-size:1.6rem;
                box-shadow:0 4px 20px rgba(0,221,0,.4);
                transition:transform .2s,box-shadow .2s;
            }
            #chatFloatBtn:hover { transform:scale(1.1);box-shadow:0 6px 30px rgba(0,221,0,.5); }
            #chatBadge {
                position:absolute;top:-4px;right:-4px;
                background:#FF4444;color:#fff;font-size:.68rem;font-weight:700;
                min-width:20px;height:20px;border-radius:10px;
                display:none;align-items:center;justify-content:center;padding:0 5px;
            }
            #chatPanel {
                position:fixed;bottom:90px;right:24px;z-index:9991;
                width:380px;max-width:calc(100vw - 32px);height:520px;max-height:calc(100vh - 120px);
                background:#0A140A;border:1px solid rgba(0,221,0,.25);
                border-radius:16px;overflow:hidden;
                display:none;flex-direction:column;
                box-shadow:0 10px 50px rgba(0,0,0,.7);
                animation:chatSlideUp .3s ease-out;
            }
            @keyframes chatSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
            #chatPanel.open { display:flex; }
            .chat-header {
                background:#0F180F;padding:14px 16px;
                display:flex;align-items:center;gap:10px;
                border-bottom:1px solid rgba(0,221,0,.15);
            }
            .chat-header-title { font-weight:700;font-size:.95rem;color:#E4F5E4;flex:1; }
            .chat-close { background:none;border:none;color:#7A9A7A;font-size:1.2rem;cursor:pointer;padding:4px 8px; }
            .chat-close:hover { color:#FF4444; }
            .chat-canales {
                display:flex;gap:0;background:#0F180F;border-bottom:1px solid rgba(0,221,0,.1);
                overflow-x:auto;
            }
            .chat-canal-btn {
                flex:1;padding:8px 4px;background:none;border:none;
                border-bottom:2px solid transparent;
                color:#7A9A7A;font-size:.75rem;font-family:inherit;cursor:pointer;
                white-space:nowrap;text-align:center;transition:all .2s;
            }
            .chat-canal-btn.active { color:#00DD00;border-bottom-color:#00DD00; }
            .chat-canal-btn:hover { color:#E4F5E4; }
            .chat-messages {
                flex:1;overflow-y:auto;padding:12px 14px;
                display:flex;flex-direction:column;gap:6px;
            }
            .chat-messages::-webkit-scrollbar { width:4px; }
            .chat-messages::-webkit-scrollbar-thumb { background:rgba(0,221,0,.2);border-radius:4px; }
            .chat-msg {
                max-width:85%;padding:8px 12px;border-radius:12px;
                font-size:.82rem;line-height:1.4;word-break:break-word;
            }
            .chat-msg.self {
                align-self:flex-end;
                background:rgba(0,221,0,.12);
                border:1px solid rgba(0,221,0,.2);
                border-bottom-right-radius:4px;
            }
            .chat-msg.other {
                align-self:flex-start;
                background:#0F180F;
                border:1px solid rgba(255,255,255,.06);
                border-bottom-left-radius:4px;
            }
            .chat-msg-author { font-size:.7rem;font-weight:700;margin-bottom:2px; }
            .chat-msg-time { font-size:.62rem;color:#7A9A7A;margin-top:2px;text-align:right; }
            .chat-msg-img { max-width:100%;border-radius:8px;margin:6px 0;cursor:pointer; }
            .chat-mencion { color:#00BFFF;font-weight:600; }
            .chat-typing { font-size:.72rem;color:#7A9A7A;padding:0 14px 4px;font-style:italic;min-height:18px; }
            .chat-input-wrap {
                display:flex;gap:8px;padding:10px 14px;
                border-top:1px solid rgba(0,221,0,.15);
                background:#0F180F;align-items:flex-end;
            }
            .chat-input {
                flex:1;padding:10px 14px;
                background:#060B06;border:1px solid rgba(0,221,0,.15);
                border-radius:20px;color:#E4F5E4;font-family:inherit;font-size:.85rem;
                outline:none;resize:none;max-height:80px;min-height:40px;
            }
            .chat-input:focus { border-color:rgba(0,221,0,.4); }
            .chat-img-btn {
                width:40px;height:40px;border-radius:50%;
                background:rgba(0,221,0,.1);border:1px solid rgba(0,221,0,.2);
                cursor:pointer;color:#00DD00;font-size:1.1rem;
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
            }
            .chat-img-btn:hover { background:rgba(0,221,0,.2); }
            .chat-send {
                width:40px;height:40px;border-radius:50%;
                background:linear-gradient(135deg,#00DD00,#007700);
                border:none;cursor:pointer;color:#000;font-size:1.1rem;
                display:flex;align-items:center;justify-content:center;
                flex-shrink:0;transition:transform .15s;
            }
            .chat-send:hover { transform:scale(1.1); }
            .chat-empty { text-align:center;color:#7A9A7A;font-size:.82rem;padding:40px 20px; }
            .chat-mention-list {
                position:absolute;bottom:100%;left:14px;right:14px;
                background:#0F180F;border:1px solid rgba(0,221,0,.25);border-radius:10px;
                max-height:160px;overflow-y:auto;display:none;z-index:10;
                box-shadow:0 -4px 20px rgba(0,0,0,.5);
            }
            .chat-mention-list.show { display:block; }
            .chat-mention-item {
                padding:8px 14px;cursor:pointer;font-size:.82rem;color:#E4F5E4;
                display:flex;align-items:center;gap:8px;
                border-bottom:1px solid rgba(255,255,255,.04);
            }
            .chat-mention-item:hover { background:rgba(0,221,0,.08); }
            .chat-mention-item .rol { font-size:.68rem;color:#7A9A7A; }
            @media (max-width:480px) {
                #chatPanel { bottom:0;right:0;width:100vw;max-width:100vw;height:100vh;max-height:100vh;border-radius:0; }
                #chatFloatBtn { bottom:16px;right:16px;width:50px;height:50px;font-size:1.3rem; }
            }
        `;
        document.head.appendChild(style);

        // Botón flotante
        const btn = document.createElement('button');
        btn.id = 'chatFloatBtn';
        btn.innerHTML = '💬<span id="chatBadge">0</span>';
        btn.addEventListener('click', toggleChat);
        document.body.appendChild(btn);

        // Panel de chat
        const panel = document.createElement('div');
        panel.id = 'chatPanel';
        panel.innerHTML = `
            <div class="chat-header">
                <span style="font-size:1.3rem;">💬</span>
                <span class="chat-header-title">Chat Eli7e</span>
                <button class="chat-close" id="chatCloseBtn">✕</button>
            </div>
            <div class="chat-canales" id="chatCanales"></div>
            <div class="chat-messages" id="chatMessages">
                <div class="chat-empty">Sin mensajes aún. ¡Inicia la conversación!</div>
            </div>
            <div class="chat-typing" id="chatTyping"></div>
            <div style="position:relative;">
                <div class="chat-mention-list" id="chatMentionList"></div>
                <div class="chat-input-wrap">
                    <label class="chat-img-btn" for="chatImgInput" title="Enviar imagen">📷</label>
                    <input type="file" id="chatImgInput" accept="image/*" style="display:none;">
                    <textarea class="chat-input" id="chatInput" placeholder="Escribe un mensaje... (@nombre para mencionar)" rows="1"></textarea>
                    <button class="chat-send" id="chatSendBtn">➤</button>
                </div>
            </div>
        `;
        document.body.appendChild(panel);

        // Renderizar canales
        const canalesEl = document.getElementById('chatCanales');
        CANALES.forEach(c => {
            const b = document.createElement('button');
            b.className = 'chat-canal-btn' + (c.id === 'general' ? ' active' : '');
            b.dataset.canal = c.id;
            b.textContent = c.icono + ' ' + c.nombre;
            b.addEventListener('click', () => cambiarCanal(c.id));
            canalesEl.appendChild(b);
        });

        // Eventos
        document.getElementById('chatCloseBtn').addEventListener('click', toggleChat);
        document.getElementById('chatSendBtn').addEventListener('click', enviarMensaje);

        const input = document.getElementById('chatInput');
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                enviarMensaje();
                return false;
            }
        });

        let typingTimeout;
        input.addEventListener('input', function () {
            // Auto-resize
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';

            // Menciones: detectar @
            handleMentionInput(this.value);

            // Typing indicator
            if (socket && socket.connected) {
                clearTimeout(typingTimeout);
                socket.emit('typing', { canal: canalActual });
            }
        });

        // Imagen upload
        document.getElementById('chatImgInput').addEventListener('change', async function () {
            if (!this.files[0]) return;
            await subirImagen(this.files[0]);
            this.value = '';
        });
    }

    // ─── MENCIONES ─────────────────────────────────────────
    let mentionQuery = '';
    let mentionStart = -1;

    function handleMentionInput(text) {
        const cursorPos = document.getElementById('chatInput').selectionStart;
        const textBeforeCursor = text.substring(0, cursorPos);
        const atMatch = textBeforeCursor.match(/@(\w*)$/);

        if (atMatch) {
            mentionStart = cursorPos - atMatch[0].length;
            mentionQuery = atMatch[1].toLowerCase();
            showMentionList(mentionQuery);
        } else {
            hideMentionList();
        }
    }

    function showMentionList(query) {
        const list = document.getElementById('chatMentionList');
        const filtered = todosUsuarios.filter(u =>
            u.nombre.toLowerCase().includes(query)
        ).slice(0, 8);

        if (!filtered.length) { hideMentionList(); return; }

        list.innerHTML = filtered.map(u => `
            <div class="chat-mention-item" data-id="${u.id}" data-nombre="${u.nombre}">
                <span style="color:${ROL_COLOR[u.rol] || '#7A9A7A'}">●</span>
                <span>${u.nombre}</span>
                <span class="rol">${ROL_LABEL[u.rol] || u.rol}</span>
            </div>
        `).join('');

        list.classList.add('show');

        // Click en mención
        list.querySelectorAll('.chat-mention-item').forEach(item => {
            item.addEventListener('click', function () {
                insertMention(this.dataset.id, this.dataset.nombre);
            });
        });
    }

    function hideMentionList() {
        const list = document.getElementById('chatMentionList');
        if (list) list.classList.remove('show');
    }

    function insertMention(id, nombre) {
        const input = document.getElementById('chatInput');
        const text = input.value;
        const before = text.substring(0, mentionStart);
        const after = text.substring(input.selectionStart);
        input.value = before + '@' + nombre + ' ' + after;
        input.focus();
        hideMentionList();
    }

    // Extraer IDs de mencionados del texto
    function extractMentionIds(text) {
        const ids = [];
        const mentions = text.match(/@(\w+(?:\s\w+)?)/g);
        if (!mentions) return ids;

        for (const m of mentions) {
            const name = m.substring(1).toLowerCase();
            const user = todosUsuarios.find(u => u.nombre.toLowerCase() === name);
            if (user) ids.push(user.id);
        }
        return ids;
    }

    // ─── SUBIR IMAGEN ──────────────────────────────────────
    async function subirImagen(file) {
        const token = getToken();
        const formData = new FormData();
        formData.append('imagen', file);
        formData.append('canal', canalActual);
        formData.append('mensaje', '📷 Imagen');

        try {
            const resp = await fetch('/api/chat/imagen', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: formData
            });
            if (!resp.ok) throw new Error('Error al subir');
            const msg = await resp.json();
            // Emitir por WS para que todos lo vean
            if (socket && socket.connected) {
                io.to(canalActual).emit('chat-nuevo', msg);
                // Fallback: el servidor ya guardó, emitimos manualmente
                socket.emit('chat-imagen-enviada', { canal: canalActual, msgId: msg.id });
            }
            appendMessage(msg);
            scrollToBottom();
        } catch (err) {
            console.log('Error subiendo imagen:', err);
        }
    }

    // ─── CONEXIÓN SOCKET ───────────────────────────────────
    function connectSocket() {
        const token = getToken();
        if (!token) return;

        if (typeof io === 'undefined') {
            console.log('⚠️ Socket.io no disponible, usando REST');
            return;
        }

        const wsUrl = window.location.origin;
        socket = io(wsUrl, {
            auth: { token },
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('💬 Chat conectado');
            socket.emit('join-canal', canalActual);
        });

        socket.on('chat-nuevo', (msg) => {
            const user = getUser();
            // No duplicar si nosotros lo enviamos por REST
            if (msg.autor_id === user?.id && document.querySelector(`[data-msg-id="${msg.id}"]`)) return;

            if (chatAbierto && msg.canal === canalActual) {
                appendMessage(msg);
                scrollToBottom();
            } else if (msg.autor_id !== user?.id) {
                unreadCount++;
                updateBadge();
            }
        });

        socket.on('chat-typing', (data) => {
            const el = document.getElementById('chatTyping');
            if (el) {
                el.textContent = `${data.nombre} está escribiendo...`;
                setTimeout(() => { if (el) el.textContent = ''; }, 2500);
            }
        });

        socket.on('connect_error', (err) => {
            console.log('⚠️ Chat socket error:', err.message);
        });

        socket.on('disconnect', () => {
            console.log('💬 Chat desconectado');
        });
    }

    // ─── FUNCIONES DE CHAT ─────────────────────────────────
    function toggleChat() {
        chatAbierto = !chatAbierto;
        const panel = document.getElementById('chatPanel');
        if (chatAbierto) {
            panel.classList.add('open');
            unreadCount = 0;
            updateBadge();
            loadMessages(canalActual);
            setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
        } else {
            panel.classList.remove('open');
        }
    }

    function updateBadge() {
        const badge = document.getElementById('chatBadge');
        if (!badge) return;
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }

    async function loadMessages(canal) {
        const el = document.getElementById('chatMessages');
        el.innerHTML = '<div class="chat-empty">Cargando...</div>';

        try {
            const token = getToken();
            const resp = await fetch('/api/chat/mensajes?canal=' + canal + '&limit=50', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Error ' + resp.status);
            }
            const msgs = await resp.json();

            if (!msgs.length) {
                el.innerHTML = '<div class="chat-empty">Sin mensajes aún. ¡Inicia la conversación!</div>';
                return;
            }

            el.innerHTML = '';
            msgs.forEach(m => appendMessage(m));
            scrollToBottom();
        } catch (err) {
            console.log('Chat load error:', err);
            el.innerHTML = '<div class="chat-empty">Sin mensajes aún. ¡Inicia la conversación!</div>';
        }
    }

    function appendMessage(msg) {
        const el = document.getElementById('chatMessages');
        const user = getUser();
        const isSelf = msg.autor_id === user?.id;

        const empty = el.querySelector('.chat-empty');
        if (empty) empty.remove();

        const div = document.createElement('div');
        div.className = 'chat-msg ' + (isSelf ? 'self' : 'other');
        div.dataset.msgId = msg.id;

        const time = new Date(msg.creado_en).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
        const color = ROL_COLOR[msg.autor_rol] || '#7A9A7A';

        // Formatear mensaje con menciones resaltadas
        let textoHtml = escapeHtml(msg.mensaje).replace(/@(\w+(?:\s\w+)?)/g, '<span class="chat-mencion">@$1</span>');

        let imgHtml = '';
        if (msg.imagen_url) {
            imgHtml = '<img class="chat-msg-img" src="' + msg.imagen_url + '" onclick="window.open(this.src,\'_blank\')" alt="imagen">';
        }

        div.innerHTML =
            (!isSelf ? '<div class="chat-msg-author" style="color:' + color + '">' + escapeHtml(msg.autor_nombre) + ' · ' + (ROL_LABEL[msg.autor_rol] || msg.autor_rol) + '</div>' : '') +
            imgHtml +
            '<div>' + textoHtml + '</div>' +
            '<div class="chat-msg-time">' + time + '</div>';
        el.appendChild(div);
    }

    function scrollToBottom() {
        const el = document.getElementById('chatMessages');
        if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
    }

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML.replace(/\n/g, '<br>');
    }

    function enviarMensaje() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg) return;

        const mencionIds = extractMentionIds(msg);

        if (socket && socket.connected) {
            socket.emit('chat-mensaje', {
                canal: canalActual,
                mensaje: msg,
                mencion_ids: mencionIds.length ? mencionIds : null
            });
        } else {
            // Fallback REST
            const token = getToken();
            fetch('/api/chat/mensajes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ canal: canalActual, mensaje: msg, mencion_ids: mencionIds.length ? mencionIds : null })
            }).then(r => r.json()).then(m => {
                if (m && m.id) {
                    appendMessage(m);
                    scrollToBottom();
                }
            }).catch(err => console.log('Chat REST error:', err));
        }

        input.value = '';
        input.style.height = 'auto';
        hideMentionList();
    }

    function cambiarCanal(canal) {
        canalActual = canal;
        document.querySelectorAll('.chat-canal-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.canal === canal);
        });
        if (socket && socket.connected) {
            socket.emit('join-canal', canal);
        }
        loadMessages(canal);
    }

    // Cargar usuarios para menciones
    async function loadUsuarios() {
        try {
            const token = getToken();
            const resp = await fetch('/api/chat/usuarios', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (resp.ok) todosUsuarios = await resp.json();
        } catch (err) {
            console.log('Chat usuarios error:', err);
        }
    }

    // ─── INIT ──────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        const user = getUser();
        const token = getToken();
        if (!user || !token) return;

        createChatUI();
        connectSocket();
        loadUsuarios();
    });
})();
