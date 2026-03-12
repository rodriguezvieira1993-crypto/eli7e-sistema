require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDB() {
    try {
        // En cada arranque, nos aseguramos de que la vista de cobranza esté actualizada
        // pero NO borramos los datos de las tablas.
        console.log('🔄 Verificando esquema y actualizando vistas...');
        
        // Actualizar vista_cobranza (es seguro hacerlo siempre)
        await pool.query('DROP VIEW IF EXISTS vista_cobranza CASCADE');
        
        const schemaSQL = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
        await pool.query(schemaSQL);
        
        console.log('✅ Base de datos inicializada correctamente');
    } catch (err) {
        // El error 42P07 ocurre si las tablas ya existen (CREATE TABLE IF NOT EXISTS)
        if (err.code === '42P07') {
            console.log('ℹ️  Las tablas ya existen — vista actualizada');
        } else {
            console.error('❌ Error aplicando schema:', err.message);
        }
    }
}

module.exports = initDB;
