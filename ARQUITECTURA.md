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
│       ├── nominas.js         ← Nómina semanal + préstamos + descuentos por daños
│       ├── descuentos.js      ← Descuentos por daños/roturas + categorías configurables
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

1. **Corte semanal canónico:** Lunes a la hora configurada en `parametros_sistema.corte_diario_hora` (default 01:00) en la zona horaria configurada en `configuracion_sistema.zona_horaria` (default `America/Caracas`). Toda query semanal usa `server/util/weekRange.js` (`weekStartSQL()` o `weekWindow(col, param)`). Para "fecha operativa de hoy" usar `operationalTodaySQL()` y `operationalDateOf(col)` en vez de `CURRENT_DATE` o `DATE(col)` — sin esto los cálculos quedan en hora del servidor (UTC), que es ~4h por delante de Venezuela. **Nunca inline `date_trunc('week', CURRENT_DATE)` ni `DATE(fecha_inicio) = CURRENT_DATE`.**

2. **Servicios con `pago_completo = TRUE`** van íntegros al motorizado, NO se descuenta porcentaje empresa. Los KPIs y la nómina respetan esto; ver `nominas.js` y `reportes.js /nomina`.

3. **`vista_cobranza`** se recrea en cada arranque (idempotente) y es la fuente única de verdad para deudas. Contable y admin leen de aquí, nunca calculan por su cuenta.

4. **Motorizado solo puede cerrar servicios propios.** El endpoint `PATCH /api/servicios/:id/cerrar` valida `motorizado_id === req.user.id` cuando el rol es `motorizado`.

5. **Autenticación:** TODAS las rutas excepto `/api/auth/login` usan el middleware `auth` (JWT en `Authorization: Bearer`).

6. **Autorización de escritura:** `requireRol('admin', ...)` en endpoints de mutación. No dejar POST/PUT/DELETE sin filtro de rol.

7. **Validación de entrada:** POST y PUT validan campos requeridos antes de tocar la DB. Errores 400 con mensaje claro, no 500.

8. **XSS en frontend:** Al inyectar datos de la API con `innerHTML`, usar `escapeHtml()` de `api.js` sobre cualquier string que venga del servidor.

9. **Migraciones idempotentes:** Todo lo nuevo en `initDB.js` usa `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. La tabla `tarifas` no está en `schema.sql`, vive en migración. **Para migraciones de DATOS one-shot** (borrados, vinculaciones, transformaciones masivas) usar la tabla `migraciones_aplicadas` como flag — chequear `SELECT 1 FROM migraciones_aplicadas WHERE clave = ...` antes de ejecutar y sellar con `INSERT ... ON CONFLICT DO NOTHING` después. Sin este flag, la migración se repite en cada arranque del contenedor (riesgo: borra datos legítimos que coincidan con el filtro).

10. **Edición desde reportes:** El script inline en `reportes.js` permite editar `monto`, `fecha_inicio` y `descripcion` de un servicio directamente en el reporte HTML (`/personalizado` y `/factura`). Solo celdas con `class="editable"` y atributos `data-id` + `data-campo` son editables. El cambio se propaga a cobranza y nóminas en vivo (porque `vista_cobranza` y `/api/nominas/semana-actual` calculan en SQL on-the-fly), pero **NO modifica nóminas ya cerradas** (snapshot histórico). El reporte avisa con toast amarillo si la edición cae en una semana cerrada.

11. **Anti-duplicados al registrar servicio:** El frontend deshabilita el botón submit durante el POST. Como defensa en profundidad, el backend en `POST /api/servicios` rechaza duplicados (mismo `operador_id`, `tipo`, `cliente_id`, `motorizado_id`, `monto`, `descripcion` en los últimos 30s) y devuelve el existente con `duplicado: true`. Cubre el caso de doble-click en internet lento.

12. **Reset DB con doble confirmación:** `POST /api/admin/reset-db` exige `req.body.confirmacion === 'BORRAR'` (no solo el rol admin). El frontend pide `prompt()` que escriba literalmente la palabra. Sin esto, un click accidental sobre el botón rojo destruye toda la operación (servicios, pagos, nóminas, cierres, chat, gastos, push).

13. **Deploy:** `git push origin main` → Easypanel construye y despliega. No hay entornos staging; validar localmente antes.

14. **Nómina estrictamente semanal, sin arrastre entre semanas.** `calcBrutos()` en `nominas.js` usa `weekWindow` puro — un servicio completado en una semana ya cerrada NO se suma a la nómina actual. (Se probó lo contrario — "pago retroactivo de atrasos" — el 2026-06-29 y se revirtió el 2026-07-03: los montos acumulados de semanas nunca cerradas resultaron inmanejables. Ver `IDEAS.md` § Congelado/descartado antes de volver a proponer esto.)

15. **Plazo de 48 horas para aceptar un servicio** (regla desde 2026-07-16). `PATCH /api/servicios/:id/cerrar` rechaza con 410 si el rol es `motorizado` y `fecha_inicio < NOW() - interval '48 hours'` — el servicio queda "vencido" y no se paga. Admin y call_center conservan la capacidad de cerrar sin este límite (para corregir datos). El campo `vencido` viene computado en `GET /api/servicios` y `GET /api/motorizados/:id`, no es una columna almacenada.

16. **Descuentos por daños bloqueados en semana cerrada.** `POST /api/descuentos` y `DELETE /api/descuentos/:id` rechazan con 409 si la nómina de esa semana (`motorizado_id` + `semana_inicio`) ya está `cerrado` — el descuento es parte del snapshot congelado y no se puede tocar después. Igual que las reglas 9-10 para servicios/nóminas.

17. **Bug de timezone recurrente a vigilar:** Venezuela es UTC-4 exacto, así que las **8pm hora VE = medianoche UTC**. Cualquier comparación de fecha que NO pase por `weekWindow()`, `operationalDateOf()` o `operationalTodaySQL()` (ej. `DATE(fecha_inicio)` crudo, `date_trunc('week', NOW() - interval '1 hour')` inline) clasifica mal los servicios creados entre 8pm y medianoche VE. Ya pasó dos veces (mayo y julio 2026) que un fix cubrió solo una parte de las queries. **Al tocar cualquier comparación de fecha, grepear `DATE(`, `date_trunc`, `CURRENT_DATE` en todo `server/routes/` antes de dar el fix por completo.**

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
- **nominas** (+ columna `deduccion_danos`), **prestamos** (módulo motorizado)
- **descuento_categorias** (nombre, activo — soft delete; seed: Daño a producto, Pérdida de producto, Daño a equipo/moto, Uniforme, Otro)
- **descuentos** (motorizado_id, categoria_id, monto, descripcion, semana_inicio, registrado_por) — descuentos por daños/roturas, uno por semana de nómina
- **push_subscriptions**, **chat_mensajes**, **configuracion_sistema**, **gastos**
- **servicios.pagado_en_nomina_id** (rastro de en qué nómina se pagó cada servicio; no afecta el cálculo, solo trazabilidad — quedó de la reversión del pago retroactivo)

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

*Última actualización: 2026-07-16 — plazo de 48h para aceptar servicios, descuentos por daños, búsqueda global, dashboard con gráficas, reglas invariantes 14-17.*
