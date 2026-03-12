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
        // Si las tablas ya existen, ignorar el error
        if (err.code === '42P07') {
            console.log('ℹ️  Las tablas ya existen — se omite init');
        } else {
            console.error('❌ Error aplicando schema:', err.message);
        }
    }
}

module.exports = initDB;
