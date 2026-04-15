// Corte semanal canónico del sistema: Lunes 01:00 → Lunes siguiente 01:00
// Usado por motorizados, nóminas y reportes para que todos los cálculos
// semanales coincidan exactamente.

// JS: lunes de la semana actual (YYYY-MM-DD) aplicando el corte de 1 AM.
// Una hora antes de las 01:00 del lunes aún pertenece a la semana previa.
function getSemanaActual(ref = new Date()) {
    const d = new Date(ref.getTime() - 3600000);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    const lunes = toISODate(d);
    const domD = new Date(d); domD.setDate(domD.getDate() + 6);
    const domingo = toISODate(domD);
    return { lunes, domingo };
}

function toISODate(d) {
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().split('T')[0];
}

// SQL: expresión para el inicio de la semana actual (Lunes 01:00 del servidor)
const WEEK_START_SQL = "(date_trunc('week', (NOW() - interval '1 hour')) + interval '1 hour')";

// SQL: construye un filtro WHERE que acota una columna timestamp a la
// ventana semanal [lunes 01:00, lunes+7d 01:00), donde $lunes es un parámetro DATE.
// Uso: `WHERE ${weekWindow('s.fecha_inicio', '$2')}`
function weekWindow(col, lunesParam) {
    return `${col} >= ${lunesParam}::timestamp + interval '1 hour' ` +
           `AND ${col} < ${lunesParam}::timestamp + interval '7 days 1 hour'`;
}

module.exports = { getSemanaActual, WEEK_START_SQL, weekWindow };
