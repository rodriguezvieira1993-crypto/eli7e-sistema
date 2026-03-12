require('dotenv').config();
const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function initDB() {
    try {
        console.log('🔄 Reseteando base de datos...');
        const resetSQL = fs.readFileSync(path.join(__dirname, '../db/reset.sql'), 'utf8');
        await pool.query(resetSQL);
        console.log('🗑️ Tablas eliminadas');

        console.log('🔄 Recreando schema...');
        const schemaSQL = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
        await pool.query(schemaSQL);
        console.log('✅ Base de datos reiniciada correctamente');
    } catch (err) {
        console.error('❌ Error reseteando BD:', err.message);
    }
}

module.exports = initDB;
