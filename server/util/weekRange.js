// Corte semanal canónico del sistema, parametrizable por zona horaria y hora de corte.
// Por defecto: Lunes 01:00 hora America/Caracas → Lunes siguiente 01:00.
//
// Se usa en motorizados, nóminas y reportes para que todos los cálculos
// semanales coincidan exactamente, INDEPENDIENTEMENTE de la zona horaria del
// servidor (Easypanel corre en UTC; sin esto el corte caía a las 21:00 hora VE).
//
// La configuración se carga al arrancar desde la BD y se refresca cuando el
// admin modifica `corte_diario_hora` (parametros_sistema) o `zona_horaria`
// (configuracion_sistema).

let config = {
    tz: 'America/Caracas',  // zona horaria por defecto
    corteHora: 1,           // hora del corte semanal (1 AM)
};

// Cargar configuración desde la BD. Llamar al arrancar (initDB) y tras cada
// edición de los parámetros relevantes.
async function loadConfig(pool) {
    try {
        const { rows: tzRows } = await pool.query(
            "SELECT valor FROM configuracion_sistema WHERE clave = 'zona_horaria'"
        );
        if (tzRows[0]?.valor && tzRows[0].valor.trim()) {
            config.tz = tzRows[0].valor.trim();
        }
        const { rows: hRows } = await pool.query(
            "SELECT valor FROM parametros_sistema WHERE clave = 'corte_diario_hora'"
        );
        if (hRows[0]?.valor) {
            const h = parseInt(hRows[0].valor, 10);
            if (!isNaN(h) && h >= 0 && h <= 23) config.corteHora = h;
        }
        console.log(`⏰ Corte semanal: Lunes ${String(config.corteHora).padStart(2, '0')}:00 (${config.tz})`);
    } catch (err) {
        console.log('⚠️ loadConfig weekRange:', err.message, '— usando defaults');
    }
}

function getConfig() {
    return { ...config };
}

// JS: lunes de la semana actual (YYYY-MM-DD) en la zona horaria configurada,
// aplicando el corte. La hora previa al corte (ej. 00:30 del lunes) aún
// pertenece a la semana anterior.
function getSemanaActual(ref = new Date()) {
    const tz = config.tz;
    const corteH = config.corteHora;

    // Obtener componentes de fecha/hora en la zona local del cliente
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(ref).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});

    // Construir Date "como si fuera UTC" pero con los componentes locales del cliente
    const localAsUTC = new Date(Date.UTC(
        +partes.year, +partes.month - 1, +partes.day,
        +partes.hour === 24 ? 0 : +partes.hour, +partes.minute, +partes.second
    ));

    // Aplicar corte: restar las horas del corte
    localAsUTC.setUTCHours(localAsUTC.getUTCHours() - corteH);

    // Calcular lunes de esa semana (lunes = 1, domingo = 0)
    const day = localAsUTC.getUTCDay();
    const diff = localAsUTC.getUTCDate() - day + (day === 0 ? -6 : 1);
    localAsUTC.setUTCDate(diff);
    localAsUTC.setUTCHours(0, 0, 0, 0);

    const lunes = localAsUTC.toISOString().split('T')[0];
    const domD = new Date(localAsUTC); domD.setUTCDate(domD.getUTCDate() + 6);
    const domingo = domD.toISOString().split('T')[0];
    return { lunes, domingo };
}

// SQL: expresión que devuelve un timestamptz con el inicio de la semana
// actual (Lunes {corteHora}:00 en la zona configurada). Comparable directamente
// contra columnas TIMESTAMP almacenadas en UTC.
function weekStartSQL() {
    const tz = sqlEscape(config.tz);
    const h = config.corteHora;
    return `((date_trunc('week', (NOW() AT TIME ZONE '${tz}') - interval '${h} hour') + interval '${h} hour') AT TIME ZONE '${tz}')`;
}

// SQL: fecha operativa de "hoy" (DATE) según el corte y la zona horaria.
// Si el corte es 1 AM hora cliente, las 00:30 cuentan como el día anterior.
function operationalTodaySQL() {
    const tz = sqlEscape(config.tz);
    const h = config.corteHora;
    return `(((NOW() AT TIME ZONE '${tz}') - interval '${h} hour')::date)`;
}

// SQL: fecha operativa de una columna TIMESTAMP UTC, proyectada a la
// zona horaria configurada y aplicando el corte. Útil para agrupar/filtrar
// servicios por "día operativo" en vez de "día calendario UTC".
function operationalDateOf(col) {
    const tz = sqlEscape(config.tz);
    const h = config.corteHora;
    return `(((${col} AT TIME ZONE 'UTC' AT TIME ZONE '${tz}') - interval '${h} hour')::date)`;
}

// SQL: filtro WHERE que acota una columna TIMESTAMP a la ventana semanal
// [lunes {corteHora}:00 local, lunes+7d {corteHora}:00 local) convertida a UTC.
// Uso: `WHERE ${weekWindow('s.fecha_inicio', '$2')}` con $2 = 'YYYY-MM-DD'
function weekWindow(col, lunesParam) {
    const tz = sqlEscape(config.tz);
    const h = config.corteHora;
    return `${col} >= ((${lunesParam}::timestamp + interval '${h} hour') AT TIME ZONE '${tz}') ` +
           `AND ${col} < ((${lunesParam}::timestamp + interval '7 days ${h} hour') AT TIME ZONE '${tz}')`;
}

// Backwards-compat: getter para código viejo que importaba la constante.
// Devuelve la expresión SQL recalculada en cada acceso.
Object.defineProperty(module.exports, 'WEEK_START_SQL', {
    get: function () { return weekStartSQL(); },
    enumerable: true,
});

// Sanitización mínima de identificadores TZ — solo letras, dígitos, '/', '_', '-', '+'
function sqlEscape(s) {
    return String(s).replace(/[^A-Za-z0-9_\/+\-]/g, '');
}

module.exports.getSemanaActual = getSemanaActual;
module.exports.weekWindow = weekWindow;
module.exports.weekStartSQL = weekStartSQL;
module.exports.operationalTodaySQL = operationalTodaySQL;
module.exports.operationalDateOf = operationalDateOf;
module.exports.loadConfig = loadConfig;
module.exports.getConfig = getConfig;
