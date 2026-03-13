-- ============================================================
-- RESET: Borra solo DATOS DE PRUEBA (servicios, pagos, cierres)
-- NO borra tablas, NO borra usuarios, clientes ni motorizados
-- ============================================================
DELETE FROM notas_entrega;
DELETE FROM pagos;
DELETE FROM cierres_diarios;
DELETE FROM servicios;

-- Restaurar estado de motorizados a disponible
UPDATE motorizados SET estado = 'disponible', activo = TRUE;

-- Restaurar saldo pendiente de clientes
UPDATE clientes SET saldo_pendiente = 0.00, activo = TRUE;
