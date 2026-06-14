const authService = require('./auth.service');
const { query } = require('../../config/db');
const emailSender = require('../../utils/emailSender');

// POST /api/v1/auth/login
const login = async (req, res, next) => {
    try {
        // LOGS DE DÉBOGAGE
        console.log('\n=== DEBUG LOGIN CONTROLLER ===');
        console.log('Body reçu:', JSON.stringify(req.body, null, 2));
        console.log('Email:', req.body.email);
        console.log('Mot de passe:', req.body.mot_de_passe);
        console.log('Content-Type:', req.headers['content-type']);
        console.log('===============================\n');
        
        const result = await authService.login({
            ...req.body,
            ip: req.ip_client || req.ip,
            appareil: req.headers['user-agent'],
        });
        res.json(result);
    } catch (err) { 
        console.error('Erreur dans controller:', err.message);
        next(err); 
    }
};

// POST /api/v1/auth/logout
const logout = async (req, res, next) => {
    try {
        // Avec JWT stateless, le logout est géré côté client (suppression du token).
        // Ici on peut blacklister le token en base si nécessaire (évolution future).
        res.json({ message: 'Déconnexion réussie.' });
    } catch (err) { next(err); }
};

// POST /api/v1/auth/refresh
const refresh = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        const result = await authService.refresh(refreshToken);
        res.json(result);
    } catch (err) { next(err); }
};

// POST /api/v1/auth/reset-request
const resetRequest = async (req, res, next) => {
    try {
        const result = await authService.resetRequest(req.body);

        if (result) {
            // Récupérer l'email pour l'envoi
            const { rows } = await query(
                'SELECT email, nom, prenom FROM utilisateurs WHERE id = $1',
                [result.userId]
            );
            if (rows.length > 0) {
                await emailSender.sendResetEmail({
                    to: rows[0].email,
                    nom: rows[0].nom,
                    token: result.token,
                });
            }
        }

        // Toujours répondre 200 pour ne pas révéler si l'email existe
        res.json({ message: 'Si cet email existe, un lien de réinitialisation a été envoyé.' });
    } catch (err) { next(err); }
};

// POST /api/v1/auth/reset-password
const resetPassword = async (req, res, next) => {
    try {
        await authService.resetPassword(req.body);
        res.json({ message: 'Mot de passe réinitialisé avec succès.' });
    } catch (err) { next(err); }
};

// PUT /api/v1/auth/change-password
const changePassword = async (req, res, next) => {
    try {
        await authService.changePassword({
            userId: req.user.id,
            ...req.body,
            ip: req.ip_client,
            appareil: req.user_agent,
        });
        res.json({ message: 'Mot de passe modifié avec succès.' });
    } catch (err) { next(err); }
};

// GET /api/v1/auth/me
const me = async (req, res, next) => {
    try {
        res.json({ user: req.user });
    } catch (err) { next(err); }
};

module.exports = { login, logout, refresh, resetRequest, resetPassword, changePassword, me };