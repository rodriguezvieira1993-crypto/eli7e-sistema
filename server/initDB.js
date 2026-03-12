require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDB() {
    try {
        // Siempre recrear la vista para aplicar correcciones
        console.log('🔄 Actualizando vista_cobranza...');
        await pool.query('DROP VIEW IF EXISTS vista_cobranza CASCADE');

        const sql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
        console.log('🔄 Inicializando base de datos...');
        await pool.query(sql);
        console.log('✅ Schema aplicado correctamente');
    } catch (err) {
        if (err.code === '42P07') {
            console.log('ℹ️  Las tablas ya existen — vista actualizada');
        } else {
            console.error('❌ Error aplicando schema:', err.message);
        }
    }
}

module.exports = initDB;
