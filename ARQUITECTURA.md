# 🏗️ ARQUITECTURA — Eli7e Sistema de Gestión

> Mapa técnico del sistema. Se actualiza DESPUÉS de cada cambio que mueva la forma del sistema (rutas nuevas, tablas nuevas, dependencias, flujos críticos).

---

## Stack

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js 20 (alpine) | Docker |
| Framework HTTP | Express 4 | |
| DB | PostgreSQL (Supabase hosted) | `DATABASE_URL` en env |
| Driver DB | `pg` + Pool (max 10) | `server/db.js` |
| Auth | JWT (`jsonwebtoken` + `bcryptjs`) | Middleware en `server/middleware/auth.js` |
| Push | `web-push` (VAPID) | `server/pushService.js` |
| Realtime | `socket.io` | Chat global |
| Frontend | HTML/CSS/JS puro | Sin framework |
| UI anim | GSAP (CDN) | `public/js/animations.js` |
| PWA | Service Worker | `public/sw.js`, `manifest.json` |
| Deploy | Easypanel (Docker) → GitHub `main` auto-build | |

---

## Estructura de carpetas

```
app/
├── server/
│   ├── index.js               ← Bootstrap Express, registra rutas, arranca initDB
│   ├── db.js                  ← Pool PostgreSQL (DATABASE_URL o vars)
│   ├── initDB.js              ← Migraciones idempotentes en cada arranque
│   ├── pushService.js         ← web-push helpers
│   ├── generateVapidKeys.js   ← CLI one-shot para generar claves VAPID
│   ├── middleware/
│   │   └── auth.js            ← JWT + requireRol(...)
│   ├── util/
│   │   └── weekRange.js       ← Corte semanal canónico (Lunes 01:00)
│   └── routes/
│       ├── auth.js            ← POST /login, /register
│       ├── usuarios.js        ← CRUD usuarios (admin)
│       ├── clientes.js        ← CRUD clientes (admin + call_center)
│       ├── motorizados.js     ← CRUD motorizados + dashboard personal
│       ├── servicios.js       ← CRUD + cerrar + editar + eliminar
│       ├── tipos-servicio.js  ← Catálogo
│       ├── tarifas.js         ← Tarifas rápidas
│       ├── cobranza.js        ← Vista cobranza + registrar pago
│       ├── cierres.js         ← Cierre diario
│       ├── reportes.js        ← Reportes HTML imprimibles
│       ├── nominas.js         ← Nómina semanal + préstamos
│       ├── prestamos.js       ← CRUD préstamos motorizado
│       ├── parametros.js      ← Parámetros sistema (porcentaje, costo moto...)
│       ├── configuracion.js   ← Config clave/valor (gmail, empresa)
│       ├── gastos.js          ← Gastos empresa
│       ├── chat.js            ← Chat global realtime
│       └── push.js            ← Suscripciones push
├── db/
│   ├── schema.sql             ← DDL base idempotente
│   └── reset.sql              ← Limpieza de datos de prueba
├── public/
│   ├── index.html             ← Login
│   ├── dashboard-{admin,callcenter,contable,motorizado}.html
│   ├── manual-usuario.html
│   ├── sw.js, manifest.json   ← PWA
│   ├── css/dashboard.css      ← Tema dark verde neón
│   ├── img/                   ← Logo, ilustraciones
│   ├── uploads/               ← Imágenes chat
│   └── js/
│       ├── api.js             ← apiFetch, toast, modal, escapeHtml, fmt
│       ├── animations.js
│       ├── pwa.js
│       ├── chat.js
│       └── dashboard-{admin,callcenter,contable,motorizado}.js
├── CLAUDE.md                  ← Guía completa del proyecto para IA
├── ARQUITECTURA.md            ← Este archivo
├── MARCA.md                   ← Identidad visual y creencia central
├── IDEAS.md                   ← Backlog y reportes del cliente
├── AVANCES_Y_PENDIENTES.md    ← Histórico de cambios por fase
├── Dockerfile
├── package.json
└── .env.example
```

---

## Flujo de datos principal

```
┌─────────────┐   login     ┌──────────────┐
│ Navegador   │─────────────│  /api/auth   │──► JWT + user.rol
└─────┬───────┘             └──────────────┘
      │  apiFetch con Bearer
      ▼
┌─────────────┐             ┌──────────────┐
│ Dashboard   │◄────────────│  routes/*.js │
│ por rol     │             │  (auth mw)   │
└─────────────┘             └──────┬───────┘
                                   │ pool.query
                                   ▼
                            ┌──────────────┐
                            │ PostgreSQL   │
                            │ + vista_cobr │
                            └──────────────┘
```

## Ciclo operativo del negocio

```
Call center registra servicio
        │
        ▼
Motorizado recibe push + ve en dashboard
        │
        ▼
Motorizado cierra (genera nota_entrega automática)
        │
        ▼
Vista_cobranza refleja deuda del cliente
        │
        ▼
Contable registra pago → reduce deuda
        │
        ▼
Admin cierra día / semana → genera nómina motorizado
        │
        ▼
Nómina descuenta: % empresa, moto semanal, préstamos activos
```

---

## Reglas invariantes del sistema

1. **Corte semanal canónico:** Lunes 01:00 a Lunes siguiente 01:00. Toda query semanal usa `server/util/weekRange.js` (`WEEK_START_SQL` o `weekWindow(col, param)`). Nunca inline `date_trunc('week', CURRENT_DATE)`.

2. **Servicios con `pago_completo = TRUE`** van íntegros al motorizado, NO se descuenta porcentaje empresa. Los KPIs y la nómina respetan esto; ver `nominas.js` y `reportes.js /nomina`.

3. **`vista_cobranza`** se recrea en cada arranque (idempotente) y es la fuente única de verdad para deudas. Contable y admin leen de aquí, nunca calculan por su cuenta.

4. **Motorizado solo puede cerrar servicios propios.** El endpoint `PATCH /api/servicios/:id/cerrar` valida `motorizado_id === req.user.id` cuando el rol es `motorizado`.

5. **Autenticación:** TODAS las rutas excepto `/api/auth/login` usan el middleware `auth` (JWT en `Authorization: Bearer`).

6. **Autorización de escritura:** `requireRol('admin', ...)` en endpoints de mutación. No dejar POST/PUT/DELETE sin filtro de rol.

7. **Validación de entrada:** POST y PUT validan campos requeridos antes de tocar la DB. Errores 400 con mensaje claro, no 500.

8. **XSS en frontend:** Al inyectar datos de la API con `innerHTML`, usar `escapeHtml()` de `api.js` sobre cualquier string que venga del servidor.

9. **Migraciones idempotentes:** Todo lo nuevo en `initDB.js` usa `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. La tabla `tarifas` no está en `schema.sql`, vive en migración.

10. **Deploy:** `git push origin main` → Easypanel construye y despliega. No hay entornos staging; validar localmente antes.

---

## Tablas principales

Ver `CLAUDE.md` § "Base de Datos" para el esquema completo. Resumen:

- **usuarios** (admin/call_center/contable/motorizado)
- **clientes** (marcas/negocios)
- **motorizados** (login por cédula + password bcrypt)
- **servicios** (tipo, monto, cliente_id, motorizado_id, estado, descripcion con "Cliente: X")
- **notas_entrega** (auto-generada al cerrar)
- **pagos** (métodos: efectivo, pago_movil, divisas, binance, transferencia)
- **cierres_diarios** (resumen del día validado por contable)
- **tarifas** (montos rápidos configurables)
- **parametros_sistema** (porcentaje empresa, costo moto, umbrales)
- **nominas**, **prestamos** (módulo motorizado)
- **push_subscriptions**, **chat_mensajes**, **configuracion_sistema**, **gastos**

**Vista:** `vista_cobranza` (clientes + servicios facturados − pagos = deuda calculada)

---

## Variables de entorno

```env
DATABASE_URL=postgresql://...    # preferida
# ó:
DB_HOST= DB_PORT=5432 DB_NAME= DB_USER= DB_PASSWORD=
JWT_SECRET=                      # obligatorio
PORT=3000
NODE_ENV=production
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:...
```

---

*Última actualización: 2026-04-15 — unificación del corte semanal + hardening de validaciones.*
