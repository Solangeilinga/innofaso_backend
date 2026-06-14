const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
    logger.logError(err, req);

    // Validation Joi
    if (err.isJoi) {
        return res.status(400).json({
            message: 'Données invalides',
            errors: err.details.map(d => d.message),
        });
    }

    // Contrainte unique PostgreSQL
    if (err.code === '23505') {
        return res.status(409).json({ message: 'Cet enregistrement existe déjà.' });
    }

    // Clé étrangère inexistante
    if (err.code === '23503') {
        return res.status(400).json({ message: 'Référence inexistante.' });
    }

    // NOT NULL violation
    if (err.code === '23502') {
        return res.status(400).json({ message: `Champ obligatoire manquant : ${err.column || ''}` });
    }

    // JWT — gérés dans le middleware auth, mais au cas où
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ message: 'Token invalide.' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ message: 'Session expirée, veuillez vous reconnecter.' });
    }

    const status = err.statusCode || err.status || 500;
    res.status(status).json({
        message: err.message || 'Erreur interne du serveur',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
};
