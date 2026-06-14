const service = require('./users.service');
const { query } = require('../../config/db');

const getAll       = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById      = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const create       = async (req, res, next) => { try { res.status(201).json(await service.create(req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); } };
const update       = async (req, res, next) => { try { res.json(await service.update(req.params.id, req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); } };
const deactivate   = async (req, res, next) => { try { await service.deactivate(req.params.id, req.user.id, req.ip_client, req.user_agent); res.json({ message: 'Utilisateur désactivé.' }); } catch (e) { next(e); } };

const toggleActif  = async (req, res, next) => {
    try {
        const user = await service.getById(req.params.id);
        await service.update(req.params.id, { actif: !user.actif }, req.user.id, req.ip_client, req.user_agent);
        res.json({ message: `Utilisateur ${user.actif ? 'désactivé' : 'réactivé'}.` });
    } catch (e) { next(e); }
};

const modifierRole = async (req, res, next) => {
    try {
        const { role_id } = req.body;
        if (!role_id) return res.status(400).json({ message: 'role_id requis.' });
        res.json(await service.update(req.params.id, { role_id }, req.user.id, req.ip_client, req.user_agent));
    } catch (e) { next(e); }
};

const getRoles = async (req, res, next) => {
    try {
        const { rows } = await query('SELECT id, nom, description FROM roles ORDER BY nom');
        res.json(rows);
    } catch (e) { next(e); }
};


const getSignataires = async (req, res, next) => {
    try {
        const { query } = require('../../config/db');
        const { rows } = await query(
            `SELECT
                u.id,
                u.nom,
                u.prenom,
                u.email,
                r.nom AS role
             FROM utilisateurs u
             JOIN roles r ON r.id = u.role_id
             WHERE u.actif = TRUE
             ORDER BY r.nom, u.nom, u.prenom`
        );
        // Format: "Prénom NOM (Rôle)"
        const signataires = rows.map(u => ({
            id: u.id,
            label: `${u.prenom} ${u.nom.toUpperCase()} — ${u.role}`,
            value: `${u.prenom} ${u.nom.toUpperCase()}`,
            role: u.role,
        }));
        res.json(signataires);
    } catch (e) { next(e); }
};

module.exports = { getAll, getById, create, update, deactivate, toggleActif, modifierRole, getRoles, getSignataires };
