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

const createRole = async (req, res, next) => {
    try {
        const { nom, description } = req.body;
        // Vérifier doublon
        const { rows: existing } = await query('SELECT id FROM roles WHERE nom = $1', [nom.toUpperCase()]);
        if (existing.length > 0) {
            return res.status(409).json({ message: `Le rôle "${nom}" existe déjà.` });
        }
        const { rows } = await query(
            'INSERT INTO roles (nom, description) VALUES ($1, $2) RETURNING *',
            [nom.toUpperCase(), description || null]
        );
        res.status(201).json(rows[0]);
    } catch (e) { next(e); }
};

const updateRole = async (req, res, next) => {
    try {
        const { roleId } = req.params;
        const { nom, description } = req.body;

        // Empêcher la modification du rôle ADMIN
        const { rows: current } = await query('SELECT nom FROM roles WHERE id = $1', [roleId]);
        if (current.length === 0) return res.status(404).json({ message: 'Rôle non trouvé.' });
        if (current[0].nom === 'ADMIN') return res.status(403).json({ message: 'Le rôle ADMIN ne peut pas être modifié.' });

        const { rows } = await query(
            'UPDATE roles SET nom = $1, description = $2 WHERE id = $3 RETURNING *',
            [nom.toUpperCase(), description || null, roleId]
        );
        res.json(rows[0]);
    } catch (e) { next(e); }
};

const deleteRole = async (req, res, next) => {
    try {
        const { roleId } = req.params;

        // Vérifier que le rôle n'est pas ADMIN
        const { rows: current } = await query('SELECT nom FROM roles WHERE id = $1', [roleId]);
        if (current.length === 0) return res.status(404).json({ message: 'Rôle non trouvé.' });
        if (current[0].nom === 'ADMIN') return res.status(403).json({ message: 'Le rôle ADMIN ne peut pas être supprimé.' });

        // Vérifier qu'aucun utilisateur n'utilise ce rôle
        const { rows: users } = await query(
            'SELECT COUNT(*) FROM utilisateurs WHERE role_id = $1 AND actif = TRUE', [roleId]
        );
        if (parseInt(users[0].count) > 0) {
            return res.status(400).json({
                message: `Impossible de supprimer : ${users[0].count} utilisateur(s) actif(s) ont ce rôle. Réassignez-les d'abord.`
            });
        }

        await query('DELETE FROM roles WHERE id = $1', [roleId]);
        res.json({ message: 'Rôle supprimé.' });
    } catch (e) { next(e); }
};

const getSignataires = async (req, res, next) => {
    try {
        const { rows } = await query(
            `SELECT u.id, u.nom, u.prenom, u.email, r.nom AS role
             FROM utilisateurs u
             JOIN roles r ON r.id = u.role_id
             WHERE u.actif = TRUE
             ORDER BY r.nom, u.nom, u.prenom`
        );
        const signataires = rows.map(u => ({
            id: u.id,
            label: `${u.prenom} ${u.nom.toUpperCase()} — ${u.role}`,
            value: `${u.prenom} ${u.nom.toUpperCase()}`,
            role: u.role,
        }));
        res.json(signataires);
    } catch (e) { next(e); }
};

module.exports = {
    getAll, getById, create, update, deactivate,
    toggleActif, modifierRole,
    getRoles, createRole, updateRole, deleteRole,
    getSignataires,
};