const { query } = require('../../config/db');

// ─── MATIÈRES ─────────────────────────────────────────────────────────

const getAll = async ({ search, categorie, alerte_stock, actif = true }) => {
    const clauses = ['m.actif = $1'];
    const params = [actif === 'false' ? false : true];

    if (search) {
        params.push(`%${search}%`);
        clauses.push(`(m.designation ILIKE $${params.length} OR m.reference ILIKE $${params.length} OR m.categorie ILIKE $${params.length})`);
    }
    if (categorie) { params.push(categorie); clauses.push(`m.categorie = $${params.length}`); }
    if (alerte_stock === 'true' || alerte_stock === true) {
        clauses.push('m.quantite_stock <= m.seuil_alerte');
    }

    const { rows } = await query(
        `SELECT m.*,
             CASE WHEN m.quantite_stock <= m.seuil_alerte THEN true ELSE false END AS en_alerte,
             COALESCE(
               (SELECT SUM(CASE WHEN mm.type_mouvement='ENTREE' THEN mm.quantite
                               WHEN mm.type_mouvement='SORTIE' THEN -mm.quantite ELSE 0 END)
                FROM mouvements_matieres mm WHERE mm.matiere_id = m.id
                AND mm.date_mouvement >= NOW() - INTERVAL '30 days'), 0
             ) AS consommation_30j
         FROM matieres_premieres m
         WHERE ${clauses.join(' AND ')}
         ORDER BY m.categorie NULLS LAST, m.designation`,
        params
    );
    return rows;
};

const getById = async (id) => {
    const { rows } = await query(
        `SELECT m.*,
             CASE WHEN m.quantite_stock <= m.seuil_alerte THEN true ELSE false END AS en_alerte
         FROM matieres_premieres m WHERE m.id = $1`,
        [id]
    );
    if (rows.length === 0) { const err = new Error('Matière non trouvée.'); err.statusCode = 404; throw err; }
    return rows[0];
};

const creer = async (data) => {
    const { rows } = await query(
        `INSERT INTO matieres_premieres
         (reference, designation, categorie, fournisseur, unite,
          quantite_stock, seuil_alerte, prix_unitaire, emplacement)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
            data.reference.toUpperCase(), data.designation, data.categorie || null,
            data.fournisseur || null, data.unite || 'kg',
            data.quantite_stock ?? 0, data.seuil_alerte ?? 50,
            data.prix_unitaire ?? null, data.emplacement || null,
        ]
    );
    return rows[0];
};

const modifier = async (id, data) => {
    await getById(id);
    const sets = [];
    const params = [];
    const fields = ['designation','categorie','fournisseur','unite',
                    'seuil_alerte','prix_unitaire','emplacement','actif'];
    for (const f of fields) {
        if (data[f] !== undefined) { params.push(data[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (sets.length === 0) return getById(id);
    params.push(new Date(), id);
    const { rows } = await query(
        `UPDATE matieres_premieres SET ${sets.join(', ')}, modifie_le = $${params.length-1}
         WHERE id = $${params.length} RETURNING *`,
        params
    );
    return rows[0];
};

const softDelete = async (id) => {
    const { rowCount } = await query(
        `UPDATE matieres_premieres SET actif = FALSE, modifie_le = NOW() WHERE id = $1`,
        [id]
    );
    if (rowCount === 0) { const err = new Error('Matière non trouvée.'); err.statusCode = 404; throw err; }
};

const getCategories = async () => {
    const { rows } = await query(
        `SELECT DISTINCT categorie FROM matieres_premieres
         WHERE categorie IS NOT NULL AND actif = TRUE ORDER BY categorie`
    );
    return rows.map(r => r.categorie);
};

// ─── MOUVEMENTS ───────────────────────────────────────────────────────

const getMouvements = async (matiereId, { limit = 50 } = {}) => {
    const { rows } = await query(
        `SELECT mm.*, u.nom AS utilisateur_nom, u.prenom AS utilisateur_prenom
         FROM mouvements_matieres mm
         JOIN utilisateurs u ON u.id = mm.utilisateur_id
         WHERE mm.matiere_id = $1
         ORDER BY mm.date_mouvement DESC
         LIMIT $2`,
        [matiereId, limit]
    );
    return rows;
};

const enregistrerMouvement = async ({ matiere_id, type_mouvement, quantite,
    motif, bon_livraison, lot }, utilisateurId) => {
    // Vérifier stock suffisant pour SORTIE
    if (type_mouvement === 'SORTIE') {
        const { rows } = await query(
            'SELECT quantite_stock FROM matieres_premieres WHERE id = $1', [matiere_id]
        );
        if (rows.length === 0) { const err = new Error('Matière non trouvée.'); err.statusCode = 404; throw err; }
        if (+rows[0].quantite_stock < +quantite) {
            const err = new Error(`Stock insuffisant : ${rows[0].quantite_stock} disponible(s).`);
            err.statusCode = 400; throw err;
        }
    }

    // Enregistrer le mouvement
    await query(
        `INSERT INTO mouvements_matieres
         (matiere_id, utilisateur_id, type_mouvement, quantite, motif, bon_livraison, lot)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [matiere_id, utilisateurId, type_mouvement, quantite,
         motif || null, bon_livraison || null, lot || null]
    );

    // Mettre à jour le stock
    const delta = type_mouvement === 'ENTREE' ? quantite : -quantite;
    const { rows: updated } = await query(
        `UPDATE matieres_premieres
         SET quantite_stock = quantite_stock + $1, modifie_le = NOW()
         WHERE id = $2 RETURNING *`,
        [delta, matiere_id]
    );
    return updated[0];
};

// ─── STATS DASHBOARD ─────────────────────────────────────────────────

const getStats = async () => {
    const { rows } = await query(`
        SELECT
          COUNT(*)                                                   AS total,
          COUNT(*) FILTER (WHERE quantite_stock <= seuil_alerte)    AS en_alerte,
          COUNT(*) FILTER (WHERE quantite_stock = 0)                AS en_rupture,
          COUNT(DISTINCT categorie)                                  AS nb_categories
        FROM matieres_premieres WHERE actif = TRUE
    `);
    return rows[0];
};

// Vérification pour le cron d'alertes
const verifierStocksMP = async () => {
    const { rows: stocksBas } = await query(`
        SELECT id, designation, reference, quantite_stock, seuil_alerte, unite, categorie
        FROM matieres_premieres
        WHERE actif = TRUE AND quantite_stock <= seuil_alerte
    `);

    const { rows: responsables } = await query(`
        SELECT id FROM utilisateurs WHERE actif = TRUE
        AND role_id IN (SELECT id FROM roles WHERE nom IN ('ADMIN','RESP_PROD','RESP_MAINT'))
    `);

    const alertesService = require('../alertes/alertes.service');
    for (const mp of stocksBas) {
        for (const resp of responsables) {
            const { rows: existing } = await query(
                `SELECT id FROM alertes WHERE type_alerte = 'STOCK_MP_BAS'
                 AND utilisateur_id = $1 AND message LIKE $2 AND date_creation >= CURRENT_DATE`,
                [resp.id, `%${mp.designation}%`]
            );
            if (existing.length === 0) {
                await alertesService.creer({
                    utilisateur_id: resp.id,
                    type_alerte: 'STOCK_MP_BAS',
                    message: `🌾 Stock MP bas : "${mp.designation}" (${mp.reference}) — ${mp.quantite_stock} ${mp.unite} / seuil : ${mp.seuil_alerte}`,
                });
            }
        }
    }
};

module.exports = {
    getAll, getById, creer, modifier, softDelete, getCategories,
    getMouvements, enregistrerMouvement, getStats, verifierStocksMP,
};