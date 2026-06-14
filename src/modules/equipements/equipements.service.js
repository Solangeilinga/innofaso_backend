const { query } = require('../../config/db');
const { logAudit } = require('../../middleware/auditLogger');
const paginate = require('../../utils/pagination');

const getAll = async ({ etat, ligne_production, actif = true, page = 1, limit = 50 }) => {
    const params = [actif === 'false' ? false : true];
    let where = 'WHERE e.actif = $1';

    if (etat) { params.push(etat.toUpperCase()); where += ` AND e.etat = $${params.length}`; }
    if (ligne_production) { params.push(ligne_production); where += ` AND e.ligne_production = $${params.length}`; }

    const countRes = await query(`SELECT COUNT(*) FROM equipements e ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const { offset, meta } = paginate(page, limit, total);

    params.push(parseInt(limit), offset);
    const { rows } = await query(
        `SELECT e.*,
             (SELECT COUNT(*) FROM soumissions s WHERE s.equipement_id = e.id) AS nb_soumissions,
             (SELECT COUNT(*) FROM alertes a WHERE a.equipement_id = e.id AND a.statut = 'NON_LUE') AS alertes_actives
         FROM equipements e ${where}
         ORDER BY e.ligne_production, e.nom
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { data: rows, meta };
};

const getById = async (id) => {
    const { rows } = await query(
        `SELECT e.*,
             (SELECT COUNT(*) FROM pieces_rechange pr WHERE pr.equipement_id = e.id) AS nb_pieces_rechange
         FROM equipements e WHERE e.id = $1`,
        [id]
    );
    if (rows.length === 0) {
        const err = new Error('Équipement non trouvé.'); err.statusCode = 404; throw err;
    }
    return rows[0];
};

const getHistorique = async (equipementId, { page = 1, limit = 20 }) => {
    const p = parseInt(page);
    const l = parseInt(limit);
    const countRes = await query(
        'SELECT COUNT(*) FROM soumissions WHERE equipement_id = $1', [equipementId]
    );
    const total = parseInt(countRes.rows[0].count);

    const { rows } = await query(
        `SELECT s.id, s.date_soumission, s.statut, s.source,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         WHERE s.equipement_id = $1
         ORDER BY s.date_soumission DESC
         LIMIT $2 OFFSET $3`,
        [equipementId, l, (p - 1) * l]
    );
    return { data: rows, meta: { page: p, limit: l, total } };
};

const create = async (data, actorId, ip, appareil) => {
    const { rows } = await query(
        `INSERT INTO equipements
         (code_ref, nom, ligne_production, localisation, type_equipement,
          etat, date_installation, prochaine_maintenance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
            data.code_ref, data.nom, data.ligne_production || null,
            data.localisation || null, data.type_equipement || null,
            data.etat || 'OPERATIONNEL',
            data.date_installation || null, data.prochaine_maintenance || null,
        ]
    );
    await logAudit({
        utilisateur_id: actorId, table_cible: 'equipements',
        enregistrement_id: rows[0].id, action: 'INSERT',
        nouvelle_valeur: data, adresse_ip: ip, appareil,
    });
    return getById(rows[0].id);
};

const update = async (id, data, actorId, ip, appareil) => {
    const ancien = await getById(id);
    const sets = [];
    const params = [];
    const fields = ['code_ref', 'nom', 'ligne_production', 'localisation', 'type_equipement', 'date_installation', 'prochaine_maintenance', 'actif'];
    for (const f of fields) {
        if (data[f] !== undefined) { params.push(data[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (sets.length === 0) return ancien;
    params.push(new Date(), id);
    await query(
        `UPDATE equipements SET ${sets.join(', ')}, modifie_le = $${params.length - 1} WHERE id = $${params.length}`,
        params
    );
    await logAudit({
        utilisateur_id: actorId, table_cible: 'equipements',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: ancien, nouvelle_valeur: data, adresse_ip: ip, appareil,
    });
    return getById(id);
};

const updateEtat = async (id, etat, actorId, ip, appareil) => {
    const validEtats = ['OPERATIONNEL', 'EN_PANNE', 'EN_MAINTENANCE'];
    if (!validEtats.includes(etat)) {
        const err = new Error(`État invalide. Valeurs : ${validEtats.join(', ')}`);
        err.statusCode = 400; throw err;
    }
    const ancien = await getById(id);
    await query('UPDATE equipements SET etat = $1, modifie_le = NOW() WHERE id = $2', [etat, id]);
    await logAudit({
        utilisateur_id: actorId, table_cible: 'equipements',
        enregistrement_id: id, action: 'UPDATE',
        ancienne_valeur: { etat: ancien.etat }, nouvelle_valeur: { etat },
        adresse_ip: ip, appareil,
    });
};

module.exports = { getAll, getById, getHistorique, create, update, updateEtat };
