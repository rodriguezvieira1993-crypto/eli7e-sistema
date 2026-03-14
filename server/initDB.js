require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDB() {
    try {
        console.log('🔄 Inicializando base de datos...');

        // Siempre recrear la vista (DROP + CREATE)
        // Necesario porque CREATE OR REPLACE VIEW no permite cambiar columnas
        await pool.query('DROP VIEW IF EXISTS vista_cobranza CASCADE');

        const sql = fs.readFileSync(
            path.join(__dirname, '../db/schema.sql'),
            'utf8'
        );
        await pool.query(sql);
        console.log('✅ Schema aplicado correctamente');
    } catch (err) {
        console.error('❌ Error aplicando schema:', err.message);
    }
}

module.exports = initDB;
