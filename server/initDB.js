require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDB() {
    const sql = fs.readFileSync(
        path.join(__dirname, '../db/schema.sql'),
        'utf8'
    );

    try {
        console.log('🔄 Inicializando base de datos...');
        await pool.query(sql);
        console.log('✅ Schema aplicado correctamente');
    } catch (err) {
        // Ignorar errores de tablas/indices que ya existen
        console.log('⚠️ Schema parcial:', err.message);
    }

    // Migración: actualizar constraint de metodo de pago
    try {
        await pool.query(`ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_metodo_check`);
        await pool.query(`ALTER TABLE pagos ADD CONSTRAINT pagos_metodo_check CHECK (metodo IN ('efectivo','pago_movil','divisas','binance','transferencia'))`);
        console.log('✅ Constraint metodo actualizado');
    } catch (err) {
        console.log('⚠️ Migración metodo:', err.message);
    }

    // Migración: crear tabla tarifas si no existe
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tarifas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                monto NUMERIC(10,2) NOT NULL,
                etiqueta VARCHAR(100),
                activo BOOLEAN DEFAULT TRUE,
                creado_en TIMESTAMP DEFAULT NOW()
            )
        `);
        // Seed tarifas por defecto si la tabla está vacía
        const { rows: existentes } = await pool.query('SELECT COUNT(*)::int AS n FROM tarifas');
        if (existentes[0].n === 0) {
            await pool.query(`
                INSERT INTO tarifas (monto, etiqueta) VALUES
                (1.50, NULL), (2.00, NULL), (3.00, NULL),
                (4.00, NULL), (6.00, NULL), (8.00, NULL)
            `);
            console.log('✅ Tarifas por defecto creadas');
        }
        console.log('✅ Tabla tarifas OK');
    } catch (err) {
        console.log('⚠️ Migración tarifas:', err.message);
    }

    // SIEMPRE recrear la vista de cobranza (independiente del schema)
    try {
        console.log('🔄 Recreando vista de cobranza...');
        await pool.query('DROP VIEW IF EXISTS vista_cobranza CASCADE');
        await pool.query(`
            CREATE VIEW vista_cobranza AS
            SELECT
                c.id,
                c.nombre_marca,
                c.email,
                c.saldo_pendiente,
                COALESCE(sv.num_servicios, 0) AS servicios_pendientes,
                COALESCE(sv.facturado_total, 0) AS facturado_total,
                COALESCE(pv.pagado_total, 0) AS pagado_total,
                COALESCE(sv.facturado_total, 0) - COALESCE(pv.pagado_total, 0) AS deuda_calculada
            FROM clientes c
            LEFT JOIN (
                SELECT cliente_id,
                       COUNT(*) AS num_servicios,
                       COALESCE(SUM(monto) FILTER (WHERE estado = 'completado'), 0) AS facturado_total
                FROM servicios
                GROUP BY cliente_id
            ) sv ON sv.cliente_id = c.id
            LEFT JOIN (
                SELECT cliente_id,
                       COALESCE(SUM(monto), 0) AS pagado_total
                FROM pagos
                GROUP BY cliente_id
            ) pv ON pv.cliente_id = c.id
            WHERE c.activo = TRUE
        `);
        console.log('✅ Vista de cobranza creada correctamente');
    } catch (err) {
        console.error('❌ Error creando vista:', err.message);
    }
}

module.exports = initDB;
