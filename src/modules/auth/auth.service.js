const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, transaction } = require('../../config/db');
const env = require('../../config/env');
const { logAudit } = require('../../middleware/auditLogger');

// ── Génération des tokens ─────────────────────────────────────────────

const generateAccessToken = (userId) =>
    jwt.sign({ userId }, env.jwt.secret, { expiresIn: env.jwt.expiresIn });

const generateRefreshToken = (userId) =>
    jwt.sign({ userId }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn });

// ── LOGIN ─────────────────────────────────────────────────────────────

const login = async ({ email, mot_de_passe, ip, appareil }) => {
    // 1. Chercher l'utilisateur
    const { rows } = await query(
        `SELECT u.*, r.nom AS role
     FROM utilisateurs u
     JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
        [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
        const err = new Error('Email ou mot de passe incorrect.');
        err.statusCode = 401;
        throw err;
    }

    const user = rows[0];

    // 2. Vérifier le compte actif
    if (!user.actif) {
        const err = new Error('Compte désactivé. Contactez un administrateur.');
        err.statusCode = 403;
        throw err;
    }

    // 3. Vérifier le mot de passe
    const valide = await bcrypt.compare(mot_de_passe, user.mot_de_passe);
    if (!valide) {
        const err = new Error('Email ou mot de passe incorrect.');
        err.statusCode = 401;
        throw err;
    }

    // 4. Mettre à jour la dernière connexion
    await query(
        'UPDATE utilisateurs SET derniere_connexion = NOW() WHERE id = $1',
        [user.id]
    );

    // 5. Générer les tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    // 6. Journaliser la connexion
    await logAudit({
        utilisateur_id: user.id,
        table_cible: 'utilisateurs',
        enregistrement_id: user.id,
        action: 'UPDATE',
        nouvelle_valeur: { event: 'login', email: user.email },
        adresse_ip: ip,
        appareil,
    });

    return {
        accessToken,
        refreshToken,
        user: {
            id: user.id,
            nom: user.nom,
            prenom: user.prenom,
            email: user.email,
            role: user.role,
        },
    };
};

// ── REFRESH TOKEN ─────────────────────────────────────────────────────

const refresh = async (refreshToken) => {
    if (!refreshToken) {
        const err = new Error('Token de rafraîchissement manquant.');
        err.statusCode = 401;
        throw err;
    }

    const decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);

    const { rows } = await query(
        'SELECT id, actif FROM utilisateurs WHERE id = $1',
        [decoded.userId]
    );

    if (rows.length === 0 || !rows[0].actif) {
        const err = new Error('Compte inexistant ou désactivé.');
        err.statusCode = 401;
        throw err;
    }

    return { accessToken: generateAccessToken(decoded.userId) };
};

// ── RESET PASSWORD — demande de lien ──────────────────────────────────

const resetRequest = async ({ email }) => {
    const { rows } = await query(
        'SELECT id FROM utilisateurs WHERE email = $1 AND actif = TRUE',
        [email.toLowerCase().trim()]
    );

    // Ne pas révéler si l'email existe ou non (sécurité)
    if (rows.length === 0) return;

    const token = crypto.randomBytes(32).toString('hex');
    const expire = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await query(
        'UPDATE utilisateurs SET token_reset = $1, token_reset_expire = $2 WHERE id = $3',
        [token, expire, rows[0].id]
    );

    // Le service d'email est appelé dans le controller
    return { token, userId: rows[0].id };
};

// ── RESET PASSWORD — application du nouveau mot de passe ──────────────

const resetPassword = async ({ token, nouveau_mdp }) => {
    const { rows } = await query(
        `SELECT id FROM utilisateurs
     WHERE token_reset = $1 AND token_reset_expire > NOW()`,
        [token]
    );

    if (rows.length === 0) {
        const err = new Error('Token invalide ou expiré.');
        err.statusCode = 400;
        throw err;
    }

    const hash = await bcrypt.hash(nouveau_mdp, 12);
    await query(
        `UPDATE utilisateurs
     SET mot_de_passe = $1, token_reset = NULL, token_reset_expire = NULL
     WHERE id = $2`,
        [hash, rows[0].id]
    );
};

// ── CHANGE PASSWORD (utilisateur connecté) ────────────────────────────
const changePassword = async ({ userId, ancien_mdp, nouveau_mdp, ip, appareil }) => {
    // ← AJOUT: Validation des entrées
    if (!ancien_mdp || !nouveau_mdp) {
        const err = new Error('Ancien et nouveau mot de passe requis.');
        err.statusCode = 400;
        throw err;
    }

    const { rows } = await query(
        'SELECT mot_de_passe FROM utilisateurs WHERE id = $1',
        [userId]
    );

    // ← AJOUT: Vérifier que l'utilisateur existe
    if (rows.length === 0 || !rows[0].mot_de_passe) {
        const err = new Error('Utilisateur non trouvé ou mot de passe manquant.');
        err.statusCode = 404;
        throw err;
    }

    const valide = await bcrypt.compare(ancien_mdp, rows[0].mot_de_passe);
    if (!valide) {
        const err = new Error('Ancien mot de passe incorrect.');
        err.statusCode = 400;
        throw err;
    }

    const hash = await bcrypt.hash(nouveau_mdp, 12);
    await query(
        'UPDATE utilisateurs SET mot_de_passe = $1 WHERE id = $2',
        [hash, userId]
    );

    await logAudit({
        utilisateur_id: userId,
        table_cible: 'utilisateurs',
        enregistrement_id: userId,
        action: 'UPDATE',
        nouvelle_valeur: { event: 'password_changed' },
        adresse_ip: ip,
        appareil,
    });
};

module.exports = { login, refresh, resetRequest, resetPassword, changePassword };