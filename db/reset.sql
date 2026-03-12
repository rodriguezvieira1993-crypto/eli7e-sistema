-- ============================================================
-- RESET: Borra TODOS los datos y recrea desde schema.sql
-- ============================================================
DROP VIEW IF EXISTS vista_cobranza CASCADE;
DROP TABLE IF EXISTS notas_entrega CASCADE;
DROP TABLE IF EXISTS pagos CASCADE;
DROP TABLE IF EXISTS cierres_diarios CASCADE;
DROP TABLE IF EXISTS servicios CASCADE;
DROP TABLE IF EXISTS motorizados CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
