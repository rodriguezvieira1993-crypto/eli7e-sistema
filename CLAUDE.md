# 🏍️ CLAUDE.md — Eli7e Sistema de Gestión

> **Este archivo es la guía completa del proyecto para cualquier IA que lo trabaje.**
> Léelo completo antes de tocar cualquier archivo.

---

## 📋 ¿Qué es Eli7e?

Sistema de gestión operativa para una empresa de **mototaxi y delivery** en Puerto Ordaz / San Félix, Venezuela. Maneja el ciclo completo: registro de servicios → asignación de motorizado → cierre → cobranza → reportes.

**URL de producción:** Desplegado en Easypanel (Docker) con auto-deploy desde GitHub `main`.
**Repo:** `github.com/rodriguezvieira1993-crypto/eli7e-sistema.git`

---

## 🏗️ Arquitectura

```
app/                          ← RAÍZ del proyecto (aquí está el .git)
├── server/
│   ├── index.js              ← Express server, registra todas las rutas
│   ├── db.js                 ← Pool de PostgreSQL (usa DATABASE_URL o vars individuales)
│   ├── initDB.js             ← Migraciones automáticas al arrancar (schema + tarifas + vista)
│   ├── middleware/
│   │   └── auth.js           ← JWT middleware + requireRol(...roles)
│   └── routes/
│       ├── auth.js           ← POST /login, POST /register
│       ├── usuarios.js       ← CRUD usuarios (solo admin)
│       ├── clientes.js       ← CRUD clientes/marcas (admin + call_center)
│       ├── motorizados.js    ← CRUD motorizados + cambiar estado
│       ├── servicios.js      ← CRUD servicios + cerrar (PATCH) + editar + eliminar
│       ├── tipos-servicio.js ← Catálogo de tipos (admin)
│       ├── tarifas.js        ← CRUD tarifas rápidas (admin)
│       ├── cobranza.js       ← Vista cobranza + registrar pago
│       ├── cierres.js        ← Cierre diario + historial + resumen-hoy
│       └── reportes.js       ← Reportes HTML imprimibles (semanal, pendientes, factura, etc.)
├── db/
│   ├── schema.sql            ← DDL completo (idempotente con IF NOT EXISTS)
│   └── reset.sql             ← Limpia datos de prueba (servicios, pagos, cierres)
├── public/
│   ├── index.html            ← Login
│   ├── dashboard-admin.html
│   ├── dashboard-callcenter.html
│   ├── dashboard-contable.html
│   ├── dashboard-motorizado.html   ← EN CONSTRUCCIÓN (solo placeholder)
│   ├── css/dashboard.css           ← Estilos globales (tema verde neón)
│   ├── img/
│   │   ├── eli7e_logo.png
│   │   └── mechanic_girl.png
│   └── js/
│       ├── api.js                  ← apiFetch(), showToast(), openModal(), closeModal(), fmt()
│       ├── dashboard-admin.js
│       ├── dashboard-callcenter.js
│       └── dashboard-contable.js
├── Dockerfile                ← node:20-alpine, npm ci --omit=dev, EXPOSE 3000
├── package.json
└── .env.example
```

### Stack
| Capa | Tecnología |
|------|------------|
| Backend | Node.js 20 + Express 4 |
| Base de datos | PostgreSQL (Supabase hosted) |
| Auth | JWT (bcryptjs + jsonwebtoken) |
| Frontend | Vanilla HTML/CSS/JS (sin framework) |
| Tipografía | Google Fonts → Outfit |
| Tema visual | Fondo negro (#060B06), acentos verde neón (#00DD00) |
| Deploy | GitHub → Easypanel (Docker auto-build) |

---

## 🔐 Autenticación y Roles

| Rol | Valor en DB | Dashboard | Puede hacer |
|-----|-------------|-----------|-------------|
| Admin | `admin` | `dashboard-admin.html` | Todo: clientes, flota, servicios, tarifas, cobranza, cierres, usuarios, reportes, reset datos |
| Call Center | `call_center` | `dashboard-callcenter.html` | Registrar servicios, gestionar clientes (crear/editar/eliminar), consultar flota, ver historial |
| Contable | `contable` | `dashboard-contable.html` | Cobranza, pagos, cierres diarios, reportes |

**Middleware:** `auth.js` exporta:
- `module.exports` = middleware JWT (valida token, pone `req.user`)
- `module.exports.requireRol = (...roles)` = permite solo los roles listados (spread args)

**Login flow:** POST `/api/auth/login` → devuelve `{ token, user: { id, nombre, rol } }` → frontend guarda en `localStorage`.

**Credenciales demo:**
- Admin: `admin@eli7e.com` / `eli7e2026`
- Call Center: `callcenter@eli7e.com` / `eli7e2026`
- Contable: `contable@eli7e.com` / `eli7e2026`

---

## 📊 Base de Datos (PostgreSQL)

### Tablas Principales

```sql
-- USUARIOS: administradores, call center, contables
usuarios (id UUID PK, nombre, email UNIQUE, password bcrypt, rol CHECK, activo, creado_en, ultimo_acceso)

-- CLIENTES: marcas/negocios que contratan servicios
clientes (id UUID PK, nombre_marca UNIQUE, email, telefono, rif, direccion, saldo_pendiente NUMERIC, activo, creado_en)

-- MOTORIZADOS: conductores de moto
motorizados (id UUID PK, nombre, cedula, telefono, estado CHECK('disponible','en_servicio','inactivo'), activo, creado_en)

-- TIPOS_SERVICIO: catálogo (mototaxi, delivery, encomienda, compras, transporte)
tipos_servicio (id UUID PK, nombre UNIQUE, descripcion, icono, precio_base NUMERIC, activo, creado_en)

-- TARIFAS: montos rápidos predefinidos ($1.50, $2, $3, $4, $6, $8)
tarifas (id UUID PK, monto NUMERIC, etiqueta, activo, creado_en)
-- Nota: la tabla tarifas se crea en initDB.js (migración), NO en schema.sql

-- SERVICIOS: cada servicio registrado
servicios (id UUID PK, tipo CHECK, monto NUMERIC, cliente_id FK, motorizado_id FK, operador_id FK, 
           estado CHECK('pendiente','en_curso','completado','cancelado'), descripcion TEXT, 
           fecha_inicio TIMESTAMP, fecha_fin, creado_en)
-- IMPORTANTE: el campo 'descripcion' contiene la ubicación/ruta del servicio
-- Formato delivery: "📦 Para: Unare II | Cliente: Topping Burguer"
-- Formato mototaxi: "🚩 Desde → Hasta | Cliente: ..."

-- NOTAS_ENTREGA: se genera automáticamente al cerrar un servicio
notas_entrega (id UUID PK, servicio_id FK CASCADE, numero_nota SERIAL, pdf_url, enviado_por_correo, pago_notificado, fecha_generacion)

-- PAGOS: pagos registrados por contable
pagos (id UUID PK, cliente_id FK, monto NUMERIC, metodo CHECK('efectivo','pago_movil','divisas','binance','transferencia'), 
       referencia, fecha DATE, registrado_por FK, creado_en)

-- CIERRES_DIARIOS: resumen del día
cierres_diarios (id UUID PK, fecha DATE UNIQUE, total_servicios INT, total_facturado NUMERIC, total_cobrado NUMERIC, 
                 diferencia GENERATED NUMERIC, estado CHECK, validado_por FK, validado_en, notas)
```

### View Calculada
```sql
vista_cobranza = clientes + SUM(servicios.monto completados) - SUM(pagos.monto) → deuda_calculada
-- Se recrea en cada arranque del servidor via initDB.js
```

---

## 📡 API Endpoints

Todos los endpoints requieren `Authorization: Bearer <token>` excepto `/api/auth/login`.

| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/api/auth/login` | todos | Login |
| POST | `/api/auth/register` | admin | Crear usuario |
| GET | `/api/clientes` | todos | Listar clientes activos |
| GET | `/api/clientes/:id` | todos | Detalle + historial servicios |
| POST | `/api/clientes` | admin, call_center | Crear cliente |
| PUT | `/api/clientes/:id` | admin, call_center | Editar cliente |
| DELETE | `/api/clientes/:id` | admin, call_center | Desactivar cliente (soft delete) |
| GET | `/api/motorizados` | todos | Listar motorizados |
| POST | `/api/motorizados` | admin | Crear motorizado |
| PUT | `/api/motorizados/:id` | admin | Editar motorizado |
| PATCH | `/api/motorizados/:id/estado` | admin, call_center | Cambiar estado |
| GET | `/api/servicios` | todos | Listar servicios (query: estado, fecha) |
| POST | `/api/servicios` | call_center, admin | Crear servicio |
| PUT | `/api/servicios/:id` | call_center, admin | Editar servicio |
| PATCH | `/api/servicios/:id/cerrar` | call_center, admin | Cerrar servicio (genera nota) |
| DELETE | `/api/servicios/:id` | call_center, admin | Eliminar servicio |
| GET | `/api/tipos-servicio` | todos | Listar tipos |
| POST | `/api/tipos-servicio` | admin | Crear tipo |
| PUT | `/api/tipos-servicio/:id` | admin | Editar tipo |
| GET | `/api/tarifas` | todos | Listar tarifas activas (ordenadas por monto ASC) |
| POST | `/api/tarifas` | admin | Crear tarifa |
| PUT | `/api/tarifas/:id` | admin | Editar tarifa |
| DELETE | `/api/tarifas/:id` | admin | Eliminar tarifa (soft delete) |
| GET | `/api/cobranza` | todos | Vista cobranza (deudas) |
| POST | `/api/cobranza/pago` | contable | Registrar pago |
| GET | `/api/cierres` | todos | Historial cierres |
| POST | `/api/cierres` | contable | Crear cierre diario |
| GET | `/api/cierres/resumen-hoy` | todos | KPIs del día |
| GET | `/api/reportes/semanal` | todos | HTML imprimible semanal |
| GET | `/api/reportes/pendientes` | todos | HTML servicios pendientes |
| GET | `/api/reportes/cierres` | todos | HTML historial cierres |
| GET | `/api/reportes/factura/:clienteId` | todos | HTML factura por cliente |
| GET | `/api/reportes/personalizado?clienteId&desde&hasta` | todos | HTML reporte customizado |
| GET | `/api/usuarios` | admin | Listar usuarios |
| POST | `/api/usuarios` | admin | Crear usuario |
| PUT | `/api/usuarios/:id` | admin | Editar usuario |
| DELETE | `/api/usuarios/:id` | admin | Eliminar usuario permanentemente |
| POST | `/api/admin/reset-db` | admin | Limpiar datos de prueba |

---

## 🎨 Frontend — Convenciones y Patrones

### Archivo `api.js` (compartido por todos los dashboards)
```javascript
apiFetch(path, options)  // Wrapper de fetch con token JWT, maneja errores
showToast(msg, type)     // Notificación tipo toast ('err' para errores)
openModal(id)            // Abre modal por ID de overlay
closeModal(id)           // Cierra modal por ID
fmt(n)                   // Formatea número como "$X.XX"
semaforoDeuda(n)         // Badge verde/amarillo/rojo según deuda
estadoBadge(estado)      // Badge según estado del motorizado
logout()                 // Limpia localStorage y redirige a /
```

### Navegación por vistas
Cada dashboard usa un patrón de "views" dentro de un `<main class="content">`:
```html
<div class="view active" id="view-NOMBRE">...</div>
<div class="view" id="view-OTRO">...</div>
```
El sidebar dispara `viewChange` custom event con `{ view: 'nombre' }`.

### Estilos CSS
- Variables CSS definidas en `dashboard.css` con prefijo `--`
- Colores: `--g1: #00DD00`, `--bg: #060B06`, `--card: #0F180F`
- Clases: `.card`, `.btn-primary`, `.btn-icon`, `.badge`, `.data-table`, `.modal-overlay`, `.field`
- Todo el diseño es **dark mode verde neón**

### Modales
```html
<div class="modal-overlay" id="modalNombre">
    <div class="modal">
        <div class="modal-hdr"><span>Título</span><button onclick="closeModal('modalNombre')">✕</button></div>
        <form onsubmit="handler(event)">
            <div class="field"><label>...</label><input ...></div>
            <div class="modal-footer">
                <button type="button" class="btn-secondary" onclick="closeModal(...)">Cancelar</button>
                <button type="submit" class="btn-primary">Guardar</button>
            </div>
        </form>
    </div>
</div>
```

---

## ✅ Estado Actual de Cada Módulo

### 👑 Módulo Administrador — COMPLETO
- Dashboard con KPIs (servicios hoy, facturado, motorizados activos, deuda total)
- CRUD Clientes (crear, editar, **eliminar**)
- CRUD Flota/Motorizados (crear, editar, cambiar estado)
- Gestión Tipos de Servicio
- **Gestión Tarifas Rápidas** (agregar, editar, eliminar montos predefinidos)
- Vista de Cobranza (semáforo deuda, factura por cliente)
- Historial de Cierres
- Gestión de Usuarios (crear, editar, eliminar permanente)
- Reportes HTML imprimibles (semanal, pendientes, cierres)
- Reset datos de prueba

### 📞 Módulo Call Center — COMPLETO
- Formulario dinámico de nuevo servicio según tipo
- **Autocomplete predictivo de clientes** (si no existe → opción "➕ Agregar como nuevo cliente")
- **CRUD Clientes completo** (crear, editar, eliminar desde Consultar Cliente Y desde autocomplete)
- Motorizados en servicio visibles (tag ⚡ "En servicio")
- **Tarifas dinámicas** desde la API (el admin las configura, el call center las muestra)
- Zonas predefinidas de Puerto Ordaz/San Félix con autocomplete
- Guardado de direcciones nuevas en localStorage
- Últimos servicios registrados en panel lateral
- 3 botones por servicio: ✅ Cerrar, ✏️ Editar (modal), 🗑️ Borrar
- Vista "En Curso" con servicios activos
- Vista "Mis Servicios" (historial del día)
- Vista "Flota Ahora" (grid read-only)
- Vista "Consultar Cliente" (buscar marca, ver deuda, editar, eliminar)

### 💼 Módulo Contable — COMPLETO
- Cobranza (tabla con semáforo verde/amarillo/rojo)
- Pago rápido (modal con selector: Pago Móvil, Efectivo, Divisas, Binance, Transferencia)
- Nota de pago HTML imprimible
- Cierre diario con checkboxes por servicio + auto-suma
- Historial de cierres
- Reportes: Semanal, Pendientes, Cierres
- Reporte Personalizado (cliente + rango de fechas)

### 🛵 Módulo Motorizados — ⚠️ EN CONSTRUCCIÓN
**Estado actual:** Solo una página placeholder bonita con animaciones de "En construcción 35%"
**Lo que debe hacer:**
- Login con credenciales de motorizado (necesita nuevo rol o login por cédula/teléfono)
- Ver servicios asignados en tiempo real
- Aceptar/rechazar servicios
- Marcar servicio como completado
- Ver historial de sus servicios del día
- Ver ganancias del día/semana

---

## 🚀 Deploy y Variables de Entorno

### Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY public/ ./public/
COPY db/ ./db/
EXPOSE 3000
CMD ["node", "server/index.js"]
```

### Variables requeridas (.env)
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname  # PREFERIDA (Supabase)
# ó vars individuales:
DB_HOST=
DB_PORT=5432
DB_NAME=
DB_USER=
DB_PASSWORD=
JWT_SECRET=eli7e_jwt_secret_super_seguro_2026
PORT=3000
NODE_ENV=production
```

### Flujo de deploy
1. Push a `main` en GitHub
2. Easypanel detecta el push, construye imagen Docker
3. El contenedor arranca con `node server/index.js`
4. `initDB.js` se ejecuta al inicio: aplica schema.sql + migraciones + crea vista

---

## ⚠️ Cosas Importantes / Gotchas

1. **initDB.js** corre en CADA arranque del servidor. Las migraciones deben ser idempotentes (IF NOT EXISTS, ON CONFLICT DO NOTHING).

2. **La tabla `tarifas`** NO está en `schema.sql`. Se crea como migración en `initDB.js`. Si agregas una tabla nueva, agrégala ahí también.

3. **`requireRol('admin', 'call_center')`** acepta múltiples roles gracias a `...roles` spread.

4. **El campo `descripcion` de servicios** contiene la ruta/ubicación (no solo una descripción textual). Es crítico para las facturas.

5. **Los reportes** (`reportes.js`) generan HTML inline (no usan templates). El HTML incluye `@media print` para impresión correcta.

6. **Moneda:** Todo es en USD ($). Los montos son `NUMERIC(10,2)`.

7. **UUIDs:** Todas las IDs son `uuid_generate_v4()`.

8. **Frontend puro:** No hay React, Vue, ni ningún framework. Es HTML + vanilla JS con `apiFetch()`.

9. **No hay WebSockets:** Todo es polling tradicional via REST.

10. **El campo `saldo_pendiente` en clientes** es legacy y no se usa activamente. La deuda real se calcula en `vista_cobranza`.

---

## 📋 Próximos Pasos / Backlog

### Prioridad Alta
1. **Módulo Motorizados completo** — El más grande pendiente
2. **Notificaciones en tiempo real** — WebSockets para que call center vea cuando moto termina
3. **Reportes PDF** — Exportar como PDF en vez de HTML

### Prioridad Media
4. **Dashboard con gráficas** — Chart.js para tendencias
5. **Historial completo de pagos** — En la factura mostrar todos los pagos anteriores
6. **Búsqueda global** — Por ID, cliente o motorizado

### Prioridad Baja
7. **PWA para motorizados** — Para uso móvil
8. **Integración WhatsApp** — Notificar clientes
9. **Sistema de calificaciones** — Rating al motorizado

---

## 🔧 Comandos Útiles

```bash
# Desarrollo local
npm run dev                    # nodemon server/index.js

# Producción
npm start                      # node server/index.js

# Git + Deploy
git add -A
git commit -m "feat: descripción"
git push origin main           # Easypanel auto-deploy

# Si git no está en PATH (Windows):
$env:Path = "C:\Program Files\Git\cmd;" + $env:Path
```

---

*Última actualización: 31 de Marzo, 2026*
