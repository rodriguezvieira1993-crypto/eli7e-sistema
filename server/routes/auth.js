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
        if (!user || !(await bcrypt.compare(password, user.password)))
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

// POST /api/auth/verificar (valida token activo)
const auth = require('../middleware/auth');
router.get('/verificar', auth, (req, res) => {
    res.json({ valid: true, user: req.user });
});

module.exports = router;
