const service = require('./alertes.service');
const { query, pool } = require('../../config/db');

const getAll = async (req, res, next) => {
    try {
        const result = await service.getAll(req.user.id, req.user.role, req.query);
        res.json(result);
    } catch (err) { next(err); }
};

const countNonLues = async (req, res, next) => {
    try {
        let sql = `SELECT COUNT(*) AS nb FROM alertes WHERE statut = 'NON_LUE'`;
        const params = [];

        if (!['ADMIN', 'RESP_MAINT', 'RESP_PROD'].includes(req.user.role)) {
            params.push(req.user.id);
            sql += ` AND utilisateur_id = $1`;
        }

        const { rows } = await query(sql, params);
        res.json({ count: parseInt(rows[0].nb) });
    } catch (err) { next(err); }
};

const getById = async (req, res, next) => {
    try {
        const { rows } = await query(
            `SELECT a.*,
               e.nom AS equipement_nom,
               s.date_soumission,
               ft.titre AS formulaire_titre,
               u.nom AS utilisateur_nom, u.prenom AS utilisateur_prenom
             FROM alertes a
             LEFT JOIN equipements e        ON e.id  = a.equipement_id
             LEFT JOIN soumissions s        ON s.id  = a.soumission_id
             LEFT JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
             JOIN  utilisateurs u           ON u.id  = a.utilisateur_id
             WHERE a.id = $1`,
            [req.params.id]
        );

        if (rows.length === 0) return res.status(404).json({ message: 'Alerte non trouvée.' });
        res.json(rows[0]);
    } catch (err) { next(err); }
};

const marquerLue = async (req, res, next) => {
    try {
        await service.marquerLue(req.params.id, req.user.id);
        res.json({ message: 'Alerte marquée comme lue.' });
    } catch (err) { next(err); }
};

const marquerToutesLues = async (req, res, next) => {
    try {
        const { rowCount } = await query(
            `UPDATE alertes SET statut = 'LUE' WHERE statut = 'NON_LUE' AND utilisateur_id = $1`,
            [req.user.id]
        );
        res.json({ message: `${rowCount} alerte(s) marquée(s) comme lues.` });
    } catch (err) { next(err); }
};

const marquerTraitee = async (req, res, next) => {
    try {
        await service.marquerTraitee(req.params.id);
        res.json({ message: 'Alerte marquée comme traitée.' });
    } catch (err) { next(err); }
};

const supprimer = async (req, res, next) => {
    try {
        const { rowCount } = await query('DELETE FROM alertes WHERE id = $1', [req.params.id]);
        if (rowCount === 0) return res.status(404).json({ message: 'Alerte non trouvée.' });
        res.json({ message: 'Alerte supprimée.' });
    } catch (err) { next(err); }
};

module.exports = { getAll, countNonLues, getById, marquerLue, marquerToutesLues, marquerTraitee, supprimer };
