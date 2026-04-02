const { Pool } = require('pg');
require('dotenv').config();

// Soporta DATABASE_URL (formato Easypanel/Supabase) o variables individuales
const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 10,
        idleTimeoutMillis: 30000,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
    console.error('❌ PostgreSQL error:', err.message);
});

module.exports = pool;
