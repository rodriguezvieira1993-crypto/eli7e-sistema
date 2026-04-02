-- ============================================================
-- SCHEMA PostgreSQL — Sistema Eli7e
-- 100% IDEMPOTENTE — Se puede ejecutar muchas veces sin romper nada
-- ============================================================

-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USUARIOS DEL SISTEMA
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(100) NOT NULL,
    email       VARCHAR(150) NOT NULL UNIQUE,
    password    TEXT NOT NULL,
    rol         VARCHAR(20) NOT NULL CHECK (rol IN ('admin','call_center','contable','motorizado')),
    activo      BOOLEAN DEFAULT TRUE,
    creado_en   TIMESTAMP DEFAULT NOW(),
    ultimo_acceso TIMESTAMP
);

INSERT INTO usuarios (nombre, email, password, rol) VALUES
('Administrador',   'admin@eli7e.com',      '$2a$10$xf.IGg7JlEedaSsfPnRewOkV4iiP5fIafMgwbZ5mfP4RG5IA8FWAy', 'admin'),
('Operador 1',      'callcenter@eli7e.com', '$2a$10$xf.IGg7JlEedaSsfPnRewOkV4iiP5fIafMgwbZ5mfP4RG5IA8FWAy', 'call_center'),
('Contable',        'contable@eli7e.com',   '$2a$10$xf.IGg7JlEedaSsfPnRewOkV4iiP5fIafMgwbZ5mfP4RG5IA8FWAy', 'contable')
ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password;

-- ============================================================
-- 2. CLIENTES / MARCAS ALIADAS
-- ============================================================
CREATE TABLE IF NOT EXISTS clientes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_marca        VARCHAR(150) NOT NULL UNIQUE,
    email               VARCHAR(150),
    telefono            VARCHAR(30),
    rif                 VARCHAR(30),
    direccion           TEXT,
    saldo_pendiente     NUMERIC(10,2) DEFAULT 0.00,
    activo              BOOLEAN DEFAULT TRUE,
    creado_en           TIMESTAMP DEFAULT NOW()
);

INSERT INTO clientes (nombre_marca) VALUES
('Cometa'), ('Coemca'), ('Damiano'), ('Echa Vaina'), ('Civeta'),
('Romanes'), ('Titos'), ('Nossa'), ('Pan de Oro'), ('D Oro'),
('Babali'), ('Topping Burguer'), ('Burguer Studio'), ('Happy Pizza'),
('Pidan Pizza'), ('2 Brothers'), ('Empanadería'), ('Don Pancito'),
('Papali'), ('Boogie'), ('Mermelada Hot'), ('Maiziao'),
('Magic Details'), ('Mango Biche'), ('Mango Biche Plaza'),
('Chocobites'), ('Brasería'), ('Toño'), ('Carlos Luces'),
('Caney'), ('Roma'), ('Pollo Cool')
ON CONFLICT (nombre_marca) DO NOTHING;

-- ============================================================
-- 3. FLOTA DE MOTORIZADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS motorizados (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre      VARCHAR(100) NOT NULL,
    cedula      VARCHAR(20),
    telefono    VARCHAR(30),
    password    TEXT,
    estado      VARCHAR(20) DEFAULT 'disponible' CHECK (estado IN ('disponible','en_servicio','inactivo')),
    activo      BOOLEAN DEFAULT TRUE,
    creado_en   TIMESTAMP DEFAULT NOW()
);

-- Solo insertar si la tabla está vacía (para no duplicar)
INSERT INTO motorizados (nombre)
SELECT nombre FROM (VALUES
    ('Manuel'), ('Raimon'), ('Gustavo'), ('Luis'),
    ('Orlando'), ('Alejandro'), ('Elvis')
) AS seed(nombre)
WHERE NOT EXISTS (SELECT 1 FROM motorizados LIMIT 1);

-- ============================================================
-- 3b. CATÁLOGO DE TIPOS DE SERVICIO
-- ============================================================
CREATE TABLE IF NOT EXISTS tipos_servicio (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre          VARCHAR(50) NOT NULL UNIQUE,
    descripcion     TEXT,
    icono           VARCHAR(10) DEFAULT '📋',
    precio_base     NUMERIC(10,2) DEFAULT 0.00,
    activo          BOOLEAN DEFAULT TRUE,
    creado_en       TIMESTAMP DEFAULT NOW()
);

INSERT INTO tipos_servicio (nombre, icono, descripcion, precio_base) VALUES
('delivery',    '📦', 'Entrega de pedidos para marcas aliadas', 2.00),
('mototaxi',    '🛵', 'Servicio de transporte de pasajeros en moto', 2.00),
('encomienda',  '📬', 'Envío de paquetes y documentos', 3.00),
('compras',     '🛒', 'Compras y recogida de productos', 4.00),
('transporte',  '🚐', 'Transporte especial de carga', 5.00)
ON CONFLICT (nombre) DO UPDATE SET
    icono = EXCLUDED.icono,
    descripcion = EXCLUDED.descripcion,
    precio_base = EXCLUDED.precio_base;

-- ============================================================
-- 4. SERVICIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS servicios (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tipo            VARCHAR(30) NOT NULL CHECK (tipo IN ('mototaxi','delivery','encomienda','compras','transporte')),
    monto           NUMERIC(10,2) NOT NULL,
    cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
    motorizado_id   UUID REFERENCES motorizados(id) ON DELETE SET NULL,
    operador_id     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
    estado          VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','completado','cancelado')),
    descripcion     TEXT,
    fecha_inicio    TIMESTAMP DEFAULT NOW(),
    fecha_fin       TIMESTAMP,
    creado_en       TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 5. NOTAS DE ENTREGA
-- ============================================================
CREATE TABLE IF NOT EXISTS notas_entrega (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    servicio_id         UUID REFERENCES servicios(id) ON DELETE CASCADE,
    numero_nota         SERIAL,
    pdf_url             TEXT,
    enviado_por_correo  BOOLEAN DEFAULT FALSE,
    pago_notificado     BOOLEAN DEFAULT FALSE,
    fecha_generacion    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 6. CIERRES DIARIOS
-- ============================================================
CREATE TABLE IF NOT EXISTS cierres_diarios (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fecha               DATE NOT NULL UNIQUE DEFAULT CURRENT_DATE,
    total_servicios     INT DEFAULT 0,
    total_facturado     NUMERIC(10,2) DEFAULT 0.00,
    total_cobrado       NUMERIC(10,2) DEFAULT 0.00,
    diferencia          NUMERIC(10,2) GENERATED ALWAYS AS (total_cobrado - total_facturado) STORED,
    estado              VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente','validado')),
    validado_por        UUID REFERENCES usuarios(id),
    validado_en         TIMESTAMP,
    notas               TEXT
);

-- ============================================================
-- 7. PAGOS
-- ============================================================
CREATE TABLE IF NOT EXISTS pagos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
    monto           NUMERIC(10,2) NOT NULL,
    metodo          VARCHAR(30) DEFAULT 'efectivo' CHECK (metodo IN ('efectivo','pago_movil','divisas','binance','transferencia')),
    referencia      VARCHAR(100),
    fecha           DATE DEFAULT CURRENT_DATE,
    registrado_por  UUID REFERENCES usuarios(id),
    creado_en       TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 8. PARÁMETROS DEL SISTEMA (configurables por admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS parametros_sistema (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clave       VARCHAR(50) NOT NULL UNIQUE,
    valor       NUMERIC(10,2) NOT NULL,
    descripcion TEXT,
    actualizado_en TIMESTAMP DEFAULT NOW(),
    actualizado_por UUID REFERENCES usuarios(id)
);

INSERT INTO parametros_sistema (clave, valor, descripcion) VALUES
('porcentaje_empresa', 30, 'Porcentaje que retiene la empresa sobre el monto bruto semanal'),
('costo_moto_semanal', 40, 'Deducción semanal fija por uso de moto ($)'),
('umbral_deuda_critica', 50, 'Monto de deuda ($) a partir del cual se marca como crítica (rojo)'),
('umbral_deuda_alerta', 20, 'Monto de deuda ($) a partir del cual se marca como alerta (amarillo)'),
('max_cuotas_prestamo', 52, 'Número máximo de cuotas semanales permitidas para préstamos'),
('password_default_moto', 0, 'Flag interno — la contraseña por defecto de motorizados es 123456')
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 9. PRÉSTAMOS A MOTORIZADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS prestamos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    motorizado_id   UUID NOT NULL REFERENCES motorizados(id) ON DELETE CASCADE,
    monto           NUMERIC(10,2) NOT NULL,
    cuotas          INT NOT NULL DEFAULT 1,
    cuota_semanal   NUMERIC(10,2) NOT NULL,
    saldo_pendiente NUMERIC(10,2) NOT NULL,
    estado          VARCHAR(20) DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado','pagado')),
    nota            TEXT,
    solicitado_en   TIMESTAMP DEFAULT NOW(),
    aprobado_en     TIMESTAMP,
    aprobado_por    UUID REFERENCES usuarios(id)
);

-- ============================================================
-- 10. NÓMINAS SEMANALES DE MOTORIZADOS
-- ============================================================
CREATE TABLE IF NOT EXISTS nominas (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    motorizado_id       UUID NOT NULL REFERENCES motorizados(id) ON DELETE CASCADE,
    semana_inicio       DATE NOT NULL,
    semana_fin          DATE NOT NULL,
    monto_bruto         NUMERIC(10,2) NOT NULL DEFAULT 0,
    porcentaje_empresa  NUMERIC(5,2) NOT NULL DEFAULT 30,
    deduccion_empresa   NUMERIC(10,2) NOT NULL DEFAULT 0,
    deduccion_moto      NUMERIC(10,2) NOT NULL DEFAULT 40,
    deduccion_prestamos NUMERIC(10,2) NOT NULL DEFAULT 0,
    monto_neto          NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado              VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrado')),
    cerrado_por         UUID REFERENCES usuarios(id),
    cerrado_en          TIMESTAMP,
    creado_en           TIMESTAMP DEFAULT NOW(),
    UNIQUE(motorizado_id, semana_inicio)
);

-- ============================================================
-- 10b. CONFIGURACIÓN GENERAL DEL SISTEMA (clave/valor texto)
-- ============================================================
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave       VARCHAR(50) PRIMARY KEY,
    valor       TEXT NOT NULL DEFAULT '',
    descripcion TEXT,
    actualizado_en TIMESTAMP DEFAULT NOW()
);

INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
('gmail_user', '', 'Correo Gmail para envío de reportes'),
('gmail_pass', '', 'App Password de Gmail'),
('empresa_nombre', 'Delivery Eli7e', 'Nombre de la empresa'),
('empresa_telefono', '', 'Teléfono de contacto de la empresa')
ON CONFLICT (clave) DO NOTHING;

-- ============================================================
-- 11. ÍNDICES para performance (IF NOT EXISTS)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_servicios_cliente ON servicios(cliente_id);
CREATE INDEX IF NOT EXISTS idx_servicios_motorizado ON servicios(motorizado_id);
CREATE INDEX IF NOT EXISTS idx_servicios_estado ON servicios(estado);
CREATE INDEX IF NOT EXISTS idx_servicios_fecha ON servicios(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_pagos_cliente ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha);
CREATE INDEX IF NOT EXISTS idx_prestamos_motorizado ON prestamos(motorizado_id);
CREATE INDEX IF NOT EXISTS idx_prestamos_estado ON prestamos(estado);
CREATE INDEX IF NOT EXISTS idx_nominas_motorizado ON nominas(motorizado_id);
CREATE INDEX IF NOT EXISTS idx_nominas_semana ON nominas(semana_inicio);

-- ============================================================
-- 12. VIEW: deuda actual por cliente (subqueries para evitar cross-product)
-- ============================================================
DROP VIEW IF EXISTS vista_cobranza CASCADE;
CREATE OR REPLACE VIEW vista_cobranza AS
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
WHERE c.activo = TRUE;
