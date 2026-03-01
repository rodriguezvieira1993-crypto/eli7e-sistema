const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'Token requerido' });

    const token = header.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Formato: Bearer <token>' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

// Middleware de roles
module.exports.requireRol = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
        return res.status(403).json({ error: 'Acceso denegado para este rol' });
    }
    next();
};
