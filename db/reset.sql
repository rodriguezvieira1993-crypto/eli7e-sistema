-- ============================================================
-- RESET: Borra solo DATOS OPERATIVOS
-- NO borra tablas, NO borra usuarios, clientes ni motorizados
-- NO borra configuración, parámetros, tipos de servicio ni tarifas
-- ============================================================

-- 1. Notas de entrega (depende de servicios)
DELETE FROM notas_entrega;

-- 2. Nóminas semanales
DELETE FROM nominas;

-- 3. Préstamos a motorizados
DELETE FROM prestamos;

-- 4. Pagos de clientes
DELETE FROM pagos;

-- 5. Cierres diarios
DELETE FROM cierres_diarios;

-- 6. Gastos de la empresa
DELETE FROM gastos;

-- 7. Chat / mensajería
DELETE FROM chat_mensajes;

-- 8. Servicios (después de notas_entrega por FK)
DELETE FROM servicios;

-- 9. Suscripciones push (opcional pero limpia la data)
DELETE FROM push_subscriptions;

-- ── Restaurar estados ──────────────────────────────────
-- Motorizados: todos disponibles y activos
UPDATE motorizados SET estado = 'disponible', activo = TRUE;

-- Clientes: saldo a cero y activos
UPDATE clientes SET saldo_pendiente = 0.00, activo = TRUE;
