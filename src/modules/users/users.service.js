const bcrypt = require('bcrypt');
const { query } = require('../../config/db');
const { logAudit } = require('../../middleware/auditLogger');
const paginate = require('../../utils/pagination');

const getAll = async ({ page = 1, limit = 20, role, actif }) => {
    let where = 'WHERE 1=1';
    const params = [];

    if (role) {
        params.push(role);
        where += ` AND r.nom = $${params.length}`;
    }
    if (actif !== undefined) {
        params.push(actif);
        where += ` AND u.actif = $${params.length}`;
    }

    const countRes = await query(
        `SELECT COUNT(*) FROM utilisateurs u JOIN roles r ON r.id = u.role_id ${where}`,
        params
    );
    const total = parseInt(countRes.rows[0].count);

    const { offset, meta } = paginate(page, limit, total);
    params.push(limit, offset);

    const { rows } = await query(
        `SELECT u.id, u.nom, u.prenom, u.email, u.actif,
            u.derniere_connexion, u.cree_le, r.nom AS role
     FROM utilisateurs u
     JOIN roles r ON r.id = u.role_id
     ${where}
     ORDER BY u.cree_le DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    return { data: rows, meta };
};

const getById = async (id) => {
    const { rows } = await query(
        `SELECT u.id, u.nom, u.prenom, u.email, u.actif,
            u.derniere_connexion, u.cree_le, r.id AS role_id, r.nom AS role
     FROM utilisateurs u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1`,
        [id]
    );
    if (rows.length === 0) {
        const err = new Error('Utilisateur non trouvé.'); err.statusCode = 404; throw err;
    }
    return rows[0];
};

const create = async ({ nom, prenom, email, mot_de_passe, role_id }, actorId, ip, appareil) => {
    const hash = await bcrypt.hash(mot_de_passe, 12);
    const { rows } = await query(
        `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nom, prenom, email.toLowerCase().trim(), hash, role_id]
    );
    await logAudit({
        utilisateur_id: actorId, table_cible: 'utilisateurs',
        enregistrement_id: rows[0].id, action: 'INSERT',
        nouvelle_valeur: { nom, prenom, email, role_id },
        adresse_ip: ip, appareil,
    });
    return getById(rows[0].id);
};

const update = async (id, data, actorId, ip, appareil) => {
    const ancien = await getById(id);

    const updates = [];
    const params = [];

    if (data.nom) { params.push(data.nom); updates.push(`nom = $${params.length}`); }
    if (data.prenom) { params.push(data.prenom); updates.push(`prenom = $${params.length}`); }
    if (data.email) { params.push(data.email.toLowerCase().trim()); updates.push(`email = $${params.length}`); }
    if (data.role_id) { params.push(data.role_id); updates.push(`role_id = $${params.length}`); }
    if (data.actif !== undefined) { params.push(data.actif); updates.push(`actif = $${params.length}`); }

    if (updates.length === 0) return ancien;

    params.push(id);
    await query(
        `UPDATE utilisateurs SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
    );

    await logAudit({
        utilisateur_id: actorId, table_cible: 'utilisateurs',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: ancien, nouvelle_valeur: data,
        adresse_ip: ip, appareil,
    });
    return getById(id);
};

// Soft delete : désactiver sans supprimer
const deactivate = async (id, actorId, ip, appareil) => {
    const user = await getById(id);
    if (user.role === 'ADMIN') {
        const err = new Error('Impossible de désactiver le compte admin principal.');
        err.statusCode = 400; throw err;
    }
    await query('UPDATE utilisateurs SET actif = FALSE WHERE id = $1', [id]);
    await logAudit({
        utilisateur_id: actorId, table_cible: 'utilisateurs',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: { actif: true }, nouvelle_valeur: { actif: false },
        adresse_ip: ip, appareil,
    });
};

module.exports = { getAll, getById, create, update, deactivate };