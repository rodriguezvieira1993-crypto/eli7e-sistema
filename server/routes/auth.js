const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email y contraseña requeridos' });

    try {
        const { rows } = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
            [email.toLowerCase()]
        );
        const user = rows[0];
        console.log('[AUTH] user encontrado:', !!user, user?.email);
        if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
        const match = await bcrypt.compare(password, user.password);
        console.log('[AUTH] hash en BD:', user.password?.substring(0, 20));
        console.log('[AUTH] password recibido:', password?.length, 'chars');
        console.log('[AUTH] bcrypt.compare result:', match);
        if (!match)
            return res.status(401).json({ error: 'Credenciales incorrectas' });

        // Actualizar último acceso
        await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = $1', [user.id]);

        const token = jwt.sign(
            { id: user.id, nombre: user.nombre, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/auth/login-motorizado — Login por cédula
router.post('/login-motorizado', async (req, res) => {
    const { cedula, password } = req.body;
    if (!cedula || !password)
        return res.status(400).json({ error: 'Cédula y contraseña requeridos' });

    try {
        const { rows } = await pool.query(
            'SELECT * FROM motorizados WHERE cedula = $1 AND activo = TRUE',
            [cedula.trim()]
        );
        const moto = rows[0];
        if (!moto) return res.status(401).json({ error: 'Cédula no registrada' });
        if (!moto.password) return res.status(401).json({ error: 'Contraseña no configurada. Contacte al administrador.' });

        const match = await bcrypt.compare(password, moto.password);
        if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

        const token = jwt.sign(
            { id: moto.id, nombre: moto.nombre, rol: 'motorizado' },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: { id: moto.id, nombre: moto.nombre, cedula: moto.cedula, rol: 'motorizado' }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// POST /api/auth/verificar (valida token activo)
const auth = require('../middleware/auth');
router.get('/verificar', auth, (req, res) => {
    res.json({ valid: true, user: req.user });
});

module.exports = router;
