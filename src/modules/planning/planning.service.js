const { query } = require('../../config/db');
const { logAudit } = require('../../middleware/auditLogger');

const getAll = async ({ semaine, mois, technicien_id, equipement_id, statut }) => {
    const params = [];
    const clauses = [];

    if (semaine) {
        const [year, week] = semaine.split('-W');
        params.push(parseInt(year), parseInt(week));
        clauses.push(`EXTRACT(ISOYEAR FROM date_prevue) = $${params.length - 1}`);
        clauses.push(`EXTRACT(WEEK FROM date_prevue) = $${params.length}`);
    }
    if (mois) {
        const [year, month] = mois.split('-');
        params.push(parseInt(year), parseInt(month));
        clauses.push(`EXTRACT(YEAR FROM date_prevue) = $${params.length - 1}`);
        clauses.push(`EXTRACT(MONTH FROM date_prevue) = $${params.length}`);
    }
    if (technicien_id) { params.push(technicien_id); clauses.push(`p.technicien_id = $${params.length}`); }
    if (equipement_id) { params.push(equipement_id); clauses.push(`p.equipement_id = $${params.length}`); }
    if (statut) { params.push(statut.toUpperCase()); clauses.push(`p.statut = $${params.length}`); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const { rows } = await query(
        `SELECT p.*,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre, ft.frequence,
             e.nom AS equipement_nom, e.code_ref AS equipement_code,
             u.nom AS technicien_nom, u.prenom AS technicien_prenom
         FROM plannings_maintenance p
         JOIN formulaires_types ft ON ft.id = p.formulaire_type_id
         JOIN equipements e        ON e.id  = p.equipement_id
         JOIN utilisateurs u       ON u.id  = p.technicien_id
         ${where}
         ORDER BY p.date_prevue, p.statut`,
        params
    );
    return rows;
};

const getById = async (id) => {
    const { rows } = await query(
        `SELECT p.*,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre, ft.frequence,
             e.nom AS equipement_nom, e.code_ref AS equipement_code, e.localisation,
             u.nom AS technicien_nom, u.prenom AS technicien_prenom, u.email AS technicien_email
         FROM plannings_maintenance p
         JOIN formulaires_types ft ON ft.id = p.formulaire_type_id
         JOIN equipements e        ON e.id  = p.equipement_id
         JOIN utilisateurs u       ON u.id  = p.technicien_id
         WHERE p.id = $1`,
        [id]
    );
    if (rows.length === 0) {
        const err = new Error('Planning non trouvé.'); err.statusCode = 404; throw err;
    }
    return rows[0];
};

const create = async (data, actorId, ip, appareil) => {
    const { rows } = await query(
        `INSERT INTO plannings_maintenance
         (formulaire_type_id, equipement_id, technicien_id, date_prevue, commentaire)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [data.formulaire_type_id, data.equipement_id, data.technicien_id, data.date_prevue, data.commentaire || null]
    );
    await logAudit({
        utilisateur_id: actorId, table_cible: 'plannings_maintenance',
        enregistrement_id: rows[0].id, action: 'INSERT', nouvelle_valeur: data,
        adresse_ip: ip, appareil,
    });
    return rows[0];
};

const update = async (id, data, actorId, ip, appareil) => {
    const ancien = await getById(id);

    const sets = [];
    const params = [];
    const allowed = ['formulaire_type_id', 'equipement_id', 'technicien_id', 'date_prevue', 'commentaire'];

    for (const field of allowed) {
        if (data[field] !== undefined) {
            params.push(data[field]);
            sets.push(`${field} = $${params.length}`);
        }
    }

    if (sets.length === 0) return ancien;

    params.push(id);
    const { rows } = await query(
        `UPDATE plannings_maintenance SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params
    );

    await logAudit({
        utilisateur_id: actorId, table_cible: 'plannings_maintenance',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: ancien, nouvelle_valeur: data,
        adresse_ip: ip, appareil,
    });

    return rows[0];
};

const updateStatut = async (id, { statut, date_realisee, commentaire }, actorId, ip, appareil) => {
    await query(
        `UPDATE plannings_maintenance
         SET statut = $1, date_realisee = $2, commentaire = COALESCE($3, commentaire)
         WHERE id = $4`,
        [statut, date_realisee || null, commentaire || null, id]
    );
    await logAudit({
        utilisateur_id: actorId, table_cible: 'plannings_maintenance',
        enregistrement_id: id, action: 'UPDATE', nouvelle_valeur: { statut, date_realisee },
        adresse_ip: ip, appareil,
    });
};

const supprimer = async (id) => {
    const { rowCount } = await query('DELETE FROM plannings_maintenance WHERE id = $1', [id]);
    if (rowCount === 0) {
        const err = new Error('Planning non trouvé.'); err.statusCode = 404; throw err;
    }
};

const getCalendrier = async (date_debut, date_fin) => {
    const { rows } = await query(
        `SELECT p.id, p.date_prevue, p.date_realisee, p.statut,
             ft.titre AS titre, ft.frequence,
             e.nom AS equipement,
             u.nom AS technicien_nom, u.prenom AS technicien_prenom
         FROM plannings_maintenance p
         JOIN formulaires_types ft ON ft.id = p.formulaire_type_id
         JOIN equipements e        ON e.id  = p.equipement_id
         JOIN utilisateurs u       ON u.id  = p.technicien_id
         WHERE p.date_prevue BETWEEN $1 AND $2
         ORDER BY p.date_prevue`,
        [date_debut, date_fin]
    );
    return rows;
};

const marquerEnRetard = async () => {
    const { rowCount } = await query(
        `UPDATE plannings_maintenance SET statut = 'EN_RETARD'
         WHERE statut = 'PLANIFIE' AND date_prevue < CURRENT_DATE`
    );
    console.log(`⏰ Plannings marqués EN_RETARD : ${rowCount}`);
};

module.exports = { getAll, getById, create, update, updateStatut, supprimer, getCalendrier, marquerEnRetard };
