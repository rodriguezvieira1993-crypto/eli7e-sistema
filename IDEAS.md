# 💡 IDEAS — Eli7e

> Backlog vivo. Todo lo que el cliente o Alejandro proponen pasa por aquí antes de convertirse en tarea. Se borra lo implementado, se deja lo descartado con su razón.

---

## 🔥 Prioridad alta

*(nada pendiente ahora mismo — el último batch del 2026-04-15 dejó el sistema en estado "sólido con mejoras aplicadas")*

---

## 🟡 Prioridad media

- **Reportes PDF reales** (no solo HTML imprimible). Algunos clientes quieren archivar por email.
- **Historial de pagos en la factura del cliente** — mostrar cada abono hecho, no solo la deuda actual.
- **Búsqueda global** en el admin: por ID de servicio, nombre de cliente o motorizado desde un único input.
- **Dashboard con gráficas** (Chart.js) para tendencias semana a semana de facturación vs cobranza.

---

## 🟢 Prioridad baja / nice-to-have

- **Integración WhatsApp Business API** para notificar al cliente cuando cierra su servicio.
- **Sistema de calificaciones** al motorizado por parte del call center.
- **Exportar cierres a Excel** además de HTML.
- **Modo kiosko** en el dashboard del motorizado para tabletas compartidas en el local.

---

## 🧊 Congelado / descartado

- **Gamificación del motorizado** (badges, niveles, rachas) — descartado por MARCA.md: "no gamificamos el trabajo".
- **Multi-idioma** — descartado: Venezuela → español → punto.
- **Multi-tenancy** (varias empresas en la misma instancia) — no es el caso de uso; Eli7e es la herramienta interna de UNA empresa. Si hace falta para otro cliente, se clona el repo.

---

## 🐛 Bugs reportados (abiertos)

*(vacío — los 5 bugs reportados por la cliente el 2026-04-25 fueron resueltos en la Fase 8 del 26-abr. Ver detalle en `AVANCES_Y_PENDIENTES.md`.)*

### Pendiente de validación con cliente
- **Cliente debe verificar en producción** que: (a) los reportes ahora guardan ediciones reales; (b) el botón 🗑️ funciona en cada fila; (c) el corte semanal cae a la hora correcta — para esto entra al panel de **Parámetros del admin** y ajusta **Zona Horaria** y **Corte Diario Hora** según su huso (default `America/Caracas` y 1 AM); (d) registrar el mismo servicio dando varios clicks ya no lo duplica.

---

## 📌 Notas de producto

- **El dueño imprime todo.** No sirvas features que dependan solo de pantalla: siempre tiene que haber un "🖨️ Imprimir" si el dato se usa para papeleo.
- **El call center usa teclado, no mouse.** Todo flujo crítico debería funcionar con tab + enter. Autocompletes, formularios, tarifas rápidas.
- **Los motorizados usan celulares Android baratos** con pantalla sucia y guantes. El tap target mínimo es 44px. El contraste tiene que aguantar pleno sol.
- **El contable entra 2 veces al día**: al mediodía para cobros rápidos y en la noche para cerrar el día. Las vistas críticas son "Cobranza" y "Cierre del día".

---

*Última revisión: 2026-04-15*
