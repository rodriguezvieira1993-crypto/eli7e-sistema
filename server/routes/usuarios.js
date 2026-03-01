const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/auth');
const { requireRol } = auth;
const router = express.Router();

router.use(auth);

// GET /api/usuarios
router.get('/', requireRol('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT id, nombre, email, rol, activo, creado_en, ultimo_acceso FROM usuarios ORDER BY creado_en ASC'
        );
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/usuarios
router.post('/', requireRol('admin'), async (req, res) => {
    const { nombre, email, password, rol } = req.body;
    if (!nombre || !email || !password || !rol)
        return res.status(400).json({ error: 'Todos los campos son requeridos' });
    try {
        const hash = await bcrypt.hash(password, 10);
        const { rows } = await pool.query(
            `INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1,$2,$3,$4)
       RETURNING id, nombre, email, rol, activo`,
            [nombre, email.toLowerCase(), hash, rol]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email ya existe' });
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/usuarios/:id/password — cambiar contraseña
router.put('/:id/password', requireRol('admin'), async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password requerido' });
    try {
        const hash = await bcrypt.hash(password, 10);
        await pool.query('UPDATE usuarios SET password=$1 WHERE id=$2', [hash, req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/usuarios/:id — desactivar
router.delete('/:id', requireRol('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE usuarios SET activo=FALSE WHERE id=$1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
