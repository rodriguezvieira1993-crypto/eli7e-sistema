# 💡 IDEAS — Eli7e

> Backlog vivo. Todo lo que el cliente o Alejandro proponen pasa por aquí antes de convertirse en tarea. Se borra lo implementado, se deja lo descartado con su razón.

---

## 🔥 Prioridad alta

- **Sprint de Seguridad (Fase 9)** — 7 vulnerabilidades críticas detectadas en la auditoría de abril y **nunca atendidas**: JWT con secreto de fallback público (repo en GitHub público), `/api/admin/migrate` sin autenticación, credenciales demo hardcodeadas en HTML, password `123456` por defecto a motorizados, sin rate-limit en login, `SELECT *` expone hash bcrypt en motorizados, ~99 usos de `innerHTML` sin sanitizar. Es el pendiente más viejo y de mayor riesgo del proyecto — pospuesto repetidamente por trabajo operativo más urgente.

---

## 🟡 Prioridad media

- **Reportes PDF reales** (no solo HTML imprimible). Algunos clientes quieren archivar por email. Pendiente decidir librería (Puppeteer vs PDFKit) — implica cambios al Dockerfile/deploy, se pospuso a propósito de la ronda de features del 2026-07-16.

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
- **Pago retroactivo de servicios atrasados** (construido 2026-06-29, revertido 2026-07-03) — la nómina arrastraba servicios completados tarde de semanas cerradas hacia la nómina actual. Se descartó porque en producción los montos acumulados de "atrasos" resultaron gigantes e inmanejables (un motorizado llegó a mostrar +$3524), ya que casi ninguna semana vieja se había cerrado nunca. **Si alguien vuelve a proponer esto:** primero medir cuántos servicios/semanas atrasadas existen realmente antes de construir un mecanismo de arrastre. Ver [sesión 2026-06-29](sesiones/2026-06-29.md) y [sesión 2026-07-03](sesiones/2026-07-03.md).
- **"Cerrar Todas" las nóminas de un click** (existía en Admin, eliminado 2026-06-28) — descartado: congela y cobra la cuota de préstamo a motorizados con servicios sin completar, listos o no. El cierre de nómina siempre es de a uno.
- **Aceptación retroactiva de servicios sin límite de tiempo** (construida 2026-06-28, reemplazada 2026-07-16) — el motorizado podía aceptar cualquier servicio viejo desde cualquier fecha. El cliente pidió acotarlo a un plazo duro de 48 horas; pasado ese plazo el servicio queda vencido y no se paga.
- **Nota de texto libre en la factura del cliente** (pedida en reunión 2026-07-17, descartada 2026-07-18) — la idea era que Yai pudiera escribir a mano ajustes de consumo (comida de motorizados, pedidos dañados) directamente en la factura de clientes como Farandi/Coenca. El cliente decidió no implementarla.

---

## ✅ Implementado recientemente (no repetir)

- **Cargos — personal con sueldo fijo semanal sin perfil de motorizado** (2026-07-18) — pestaña "👤 Cargos" en Nóminas (solo Admin). Daniela ($100/sem) y Paola ($70/sem), pagadas lunes-domingo igual que los motorizados, con deducciones (reutiliza las categorías de daños + "Comida/Consumo"). Tablas nuevas `colaboradores`, `descuentos_colaborador`, `nominas_colaborador`.
- **Recibo automático al registrar un pago** (2026-07-18) — comprobante simple (monto, fecha, cliente, método), no un estado de cuenta completo. Reemplaza el auto-disparo de `generarNotaPago()` (que sí sigue existiendo para su botón "📄 Nota" on-demand, pero lista TODOS los servicios históricos — no era lo que se pedía como recibo inmediato).
- **Fecha manual al registrar un pago** (2026-07-18) — antes siempre se guardaba con la fecha de hoy, causando discrepancias contables reales (casos: Cometa, Mermelada Hots, Pan de Oro, Romanes). Ahora los formularios "Registrar Pago" y "Pago Rápido" tienen selector de fecha.
- **Historial de pagos en la factura del cliente** — YA estaba implementado (sección "💰 Pagos Registrados" en `/api/reportes/factura/:clienteId`), descubierto el 2026-07-16 al revisar el backlog. Lista todos los abonos históricos, no solo la deuda actual.
- **Búsqueda global en el admin** (2026-07-16) — vista "🔍 Búsqueda", por ID de servicio, cliente, motorizado o descripción desde un único input.
- **Dashboard con gráficas** (2026-07-16) — gráfica de línea (Chart.js) de Facturación vs Cobranza, últimas 8 semanas, en el Dashboard del admin.
- **Descuentos por daños/roturas con categorías** (2026-07-03) — pestaña dedicada en Nóminas (contable/admin), categorías creables desde la UI.
- **Servicios sin aceptar visibles en nómina** (2026-07-03) — badge en la tabla de Nóminas + sección en el recibo.
- **Contable puede cerrar nóminas** (2026-06-28) — antes solo admin; la vista estaba rota (403 silencioso).
- **Filtro Desde/Hasta en "Mis Servicios" del motorizado** (2026-06-28).

---

## 🐛 Bugs reportados (abiertos)

*(vacío)*

### Resueltos recientemente
- **Servicios después de las 8pm se guardaban en la fecha siguiente** (2026-07-16) — Venezuela es UTC-4, 8pm hora VE = medianoche UTC exacta. Arreglado en 3 sitios (`servicios.js`, `reportes.js /personalizado`, `motorizados.js /:id`) que quedaron sin cubrir por el fix de mayo (`de0a238`), el cual solo tocó los reportes imprimibles.
- **La semana de nómina no se ajustaba al lunes correcto** (2026-06-28) — resuelto con snap de fecha.

---

## 📌 Notas de producto

- **El dueño imprime todo.** No sirvas features que dependan solo de pantalla: siempre tiene que haber un "🖨️ Imprimir" si el dato se usa para papeleo.
- **El call center usa teclado, no mouse.** Todo flujo crítico debería funcionar con tab + enter. Autocompletes, formularios, tarifas rápidas.
- **Los motorizados usan celulares Android baratos** con pantalla sucia y guantes. El tap target mínimo es 44px. El contraste tiene que aguantar pleno sol.
- **El contable entra 2 veces al día**: al mediodía para cobros rápidos y en la noche para cerrar el día. Las vistas críticas son "Cobranza" y "Cierre del día".
- **Los servicios tienen 48 horas para aceptarse** (regla desde 2026-07-16). Pasado ese plazo no se pagan — es una regla de negocio dura, no solo una restricción de UI.
- **La nómina es estrictamente semanal** (regla reafirmada 2026-07-03, tras revertir el pago retroactivo). Nada se arrastra entre semanas.

---

*Última revisión: 2026-07-18*
