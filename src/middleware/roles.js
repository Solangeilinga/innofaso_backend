// Fabrique un middleware qui vérifie que l'utilisateur a l'un des rôles autorisés

const roles = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Non authentifié.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
            message: `Accès refusé. Rôle requis : ${allowedRoles.join(' ou ')}.`,
        });
    }

    next();
};

module.exports = roles;