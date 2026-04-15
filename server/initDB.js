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

    // Migración: actualizar constraint de rol para incluir 'motorizado'
    try {
        await pool.query(`ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check`);
        await pool.query(`ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('admin','call_center','contable','motorizado'))`);
        console.log('✅ Constraint rol actualizado');
    } catch (err) {
        console.log('⚠️ Migración rol:', err.message);
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

    // Migración: agregar campo password a motorizados (login por cédula)
    try {
        await pool.query(`ALTER TABLE motorizados ADD COLUMN IF NOT EXISTS password TEXT`);
        // Poner password por defecto (123456) a los que no tengan
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('123456', 10);
        await pool.query(`UPDATE motorizados SET password = $1 WHERE password IS NULL`, [hash]);
        console.log('✅ Campo password en motorizados OK');
    } catch (err) {
        console.log('⚠️ Migración password motorizados:', err.message);
    }

    // Migración: crear tablas de nóminas, préstamos y parámetros si no existen
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS parametros_sistema (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                clave VARCHAR(50) NOT NULL UNIQUE,
                valor NUMERIC(10,2) NOT NULL,
                descripcion TEXT,
                actualizado_en TIMESTAMP DEFAULT NOW(),
                actualizado_por UUID REFERENCES usuarios(id)
            )
        `);
        await pool.query(`
            INSERT INTO parametros_sistema (clave, valor, descripcion) VALUES
            ('porcentaje_empresa', 30, 'Porcentaje que retiene la empresa sobre el monto bruto semanal'),
            ('costo_moto_semanal', 40, 'Deducción semanal fija por uso de moto ($)'),
            ('umbral_deuda_critica', 50, 'Monto de deuda ($) a partir del cual se marca como crítica (rojo)'),
            ('umbral_deuda_alerta', 20, 'Monto de deuda ($) a partir del cual se marca como alerta (amarillo)'),
            ('max_cuotas_prestamo', 52, 'Número máximo de cuotas semanales permitidas para préstamos')
            ON CONFLICT (clave) DO NOTHING
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestamos (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                motorizado_id UUID NOT NULL REFERENCES motorizados(id) ON DELETE CASCADE,
                monto NUMERIC(10,2) NOT NULL,
                cuotas INT NOT NULL DEFAULT 1,
                cuota_semanal NUMERIC(10,2) NOT NULL,
                saldo_pendiente NUMERIC(10,2) NOT NULL,
                estado VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','pagado')),
                nota TEXT,
                solicitado_en TIMESTAMP DEFAULT NOW(),
                aprobado_en TIMESTAMP,
                aprobado_por UUID REFERENCES usuarios(id)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS nominas (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                motorizado_id UUID NOT NULL REFERENCES motorizados(id) ON DELETE CASCADE,
                semana_inicio DATE NOT NULL,
                semana_fin DATE NOT NULL,
                monto_bruto NUMERIC(10,2) NOT NULL DEFAULT 0,
                porcentaje_empresa NUMERIC(5,2) NOT NULL DEFAULT 30,
                deduccion_empresa NUMERIC(10,2) NOT NULL DEFAULT 0,
                deduccion_moto NUMERIC(10,2) NOT NULL DEFAULT 40,
                deduccion_prestamos NUMERIC(10,2) NOT NULL DEFAULT 0,
                monto_neto NUMERIC(10,2) NOT NULL DEFAULT 0,
                estado VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrado')),
                cerrado_por UUID REFERENCES usuarios(id),
                cerrado_en TIMESTAMP,
                creado_en TIMESTAMP DEFAULT NOW(),
                UNIQUE(motorizado_id, semana_inicio)
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_prestamos_motorizado ON prestamos(motorizado_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_nominas_motorizado ON nominas(motorizado_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_nominas_semana ON nominas(semana_inicio)');
        console.log('✅ Tablas nóminas/préstamos/parámetros OK');
    } catch (err) {
        console.log('⚠️ Migración nóminas:', err.message);
    }

    // Migración: eliminar parámetro obsoleto password_default_moto
    try {
        await pool.query("DELETE FROM parametros_sistema WHERE clave = 'password_default_moto'");
    } catch (err) { /* ya eliminado */ }

    // Migración: crear tabla push_subscriptions
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL,
                user_rol VARCHAR(20) NOT NULL,
                endpoint TEXT NOT NULL UNIQUE,
                p256dh TEXT NOT NULL,
                auth_key TEXT NOT NULL,
                creado_en TIMESTAMP DEFAULT NOW(),
                actualizado_en TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_push_rol ON push_subscriptions(user_rol)');
        console.log('✅ Tabla push_subscriptions OK');
    } catch (err) {
        console.log('⚠️ Migración push_subscriptions:', err.message);
    }

    // Migración: crear tabla configuracion_sistema (clave/valor texto)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion_sistema (
                clave VARCHAR(50) PRIMARY KEY,
                valor TEXT NOT NULL DEFAULT '',
                descripcion TEXT,
                actualizado_en TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
            ('gmail_user', '', 'Correo Gmail para envío de reportes'),
            ('gmail_pass', '', 'App Password de Gmail'),
            ('empresa_nombre', 'Delivery Eli7e', 'Nombre de la empresa'),
            ('empresa_telefono', '', 'Teléfono de contacto de la empresa')
            ON CONFLICT (clave) DO NOTHING
        `);
        console.log('✅ Tabla configuracion_sistema OK');
    } catch (err) {
        console.log('⚠️ Migración configuracion_sistema:', err.message);
    }

    // Migración: crear tabla chat_mensajes
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_mensajes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                canal VARCHAR(50) NOT NULL DEFAULT 'general',
                autor_id UUID NOT NULL,
                autor_nombre VARCHAR(100) NOT NULL,
                autor_rol VARCHAR(20) NOT NULL,
                mensaje TEXT NOT NULL,
                imagen_url TEXT,
                mencion_ids UUID[],
                creado_en TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_canal ON chat_mensajes(canal)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_chat_fecha ON chat_mensajes(creado_en)');
        console.log('✅ Tabla chat_mensajes OK');
    } catch (err) {
        console.log('⚠️ Migración chat_mensajes:', err.message);
    }
    // Migración: agregar campo pago_completo a servicios (cuando el moto cobra completo sin descuento empresa)
    try {
        await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS pago_completo BOOLEAN DEFAULT FALSE`);
        console.log('✅ Campo pago_completo en servicios OK');
    } catch (err) {
        console.log('⚠️ Migración pago_completo:', err.message);
    }

    // Migración: crear tabla gastos (gastos de la empresa)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS gastos (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                descripcion VARCHAR(255) NOT NULL,
                monto NUMERIC(10,2) NOT NULL,
                categoria VARCHAR(50) DEFAULT 'otros' CHECK (categoria IN ('cenas','uniformes','repuestos','cajas','combustible','mantenimiento','servicios','papeleria','otros')),
                fecha DATE DEFAULT CURRENT_DATE,
                nota TEXT,
                registrado_por UUID REFERENCES usuarios(id),
                creado_en TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria)');
        console.log('✅ Tabla gastos OK');
    } catch (err) {
        console.log('⚠️ Migración gastos:', err.message);
    }

    // Migración única: borrar servicios de prueba del 9 de abril 2026
    try {
        const { rows } = await pool.query(
            `SELECT id, tipo, descripcion, monto FROM servicios WHERE DATE(fecha_inicio) = '2026-04-09'`
        );
        if (rows.length > 0) {
            console.log(`🗑️ Encontrados ${rows.length} servicios de prueba del 9/04/2026:`);
            rows.forEach(r => console.log(`   - ${r.tipo} | ${r.descripcion || '—'} | $${r.monto}`));
            // Borrar notas de entrega asociadas primero
            await pool.query(`DELETE FROM notas_entrega WHERE servicio_id IN (SELECT id FROM servicios WHERE DATE(fecha_inicio) = '2026-04-09')`);
            const { rowCount } = await pool.query(`DELETE FROM servicios WHERE DATE(fecha_inicio) = '2026-04-09'`);
            console.log(`✅ Eliminados ${rowCount} servicios de prueba del 9/04/2026`);
        }
    } catch (err) {
        console.log('⚠️ Limpieza 9/04:', err.message);
    }

    // Migración: vincular servicios huérfanos (sin cliente_id) a clientes extraídos de la descripción
    try {
        const { rows: huerfanos } = await pool.query(`
            SELECT id, descripcion
            FROM servicios
            WHERE cliente_id IS NULL
              AND descripcion ~* 'Cliente:\\s*[^|]+'
        `);
        if (huerfanos.length > 0) {
            console.log(`🔗 Vinculando ${huerfanos.length} servicios huérfanos a clientes...`);
            let vinculados = 0;
            let creados = 0;
            for (const s of huerfanos) {
                const match = s.descripcion.match(/Cliente:\s*([^|]+)/i);
                if (!match) continue;
                const nombre = match[1].trim();
                if (!nombre) continue;

                // Buscar cliente existente (case-insensitive)
                let { rows: cli } = await pool.query(
                    `SELECT id FROM clientes WHERE LOWER(nombre_marca) = LOWER($1) LIMIT 1`,
                    [nombre]
                );
                let clienteId = cli[0]?.id;

                // Crear si no existe
                if (!clienteId) {
                    try {
                        const { rows: nuevo } = await pool.query(
                            `INSERT INTO clientes (nombre_marca, activo) VALUES ($1, TRUE) RETURNING id`,
                            [nombre]
                        );
                        clienteId = nuevo[0].id;
                        creados++;
                    } catch (e) {
                        // Conflicto de unique — buscar de nuevo
                        const { rows: retry } = await pool.query(
                            `SELECT id FROM clientes WHERE LOWER(nombre_marca) = LOWER($1) LIMIT 1`,
                            [nombre]
                        );
                        clienteId = retry[0]?.id;
                    }
                }

                if (clienteId) {
                    await pool.query(`UPDATE servicios SET cliente_id = $1 WHERE id = $2`, [clienteId, s.id]);
                    vinculados++;
                }
            }
            console.log(`✅ Servicios vinculados: ${vinculados} | Clientes nuevos creados: ${creados}`);
        }
    } catch (err) {
        console.log('⚠️ Vinculación huérfanos:', err.message);
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
