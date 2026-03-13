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
        console.error('❌ Error aplicando schema:', err.message);
    }
}

module.exports = initDB;
