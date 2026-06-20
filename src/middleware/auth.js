const jwt   = require('jsonwebtoken');
const env   = require('../config/env');
const { query } = require('../config/db');

module.exports = async (req, res, next) => {
    try {
        // Accepter le token depuis le header Authorization OU le query param ?token=
        // (EventSource/SSE ne supporte pas les headers custom)
        const authHeader = req.headers.authorization;
        let token;

        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.query?.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ message: 'Token manquant ou mal formé.' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, env.jwt.secret);
        } catch (jwtErr) {
            if (jwtErr.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Session expirée, veuillez vous reconnecter.' });
            }
            return res.status(401).json({ message: 'Token invalide.' });
        }

        const { rows } = await query(
            `SELECT u.id, u.nom, u.prenom, u.email, u.actif, r.nom AS role
             FROM utilisateurs u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = $1`,
            [decoded.userId]
        );

        if (rows.length === 0 || !rows[0].actif) {
            return res.status(401).json({ message: 'Compte désactivé ou inexistant.' });
        }

        req.user       = rows[0];
        req.ip_client  = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || req.connection.remoteAddress;
        req.user_agent = req.headers['user-agent'] || '';

        next();
    } catch (err) { next(err); }
};