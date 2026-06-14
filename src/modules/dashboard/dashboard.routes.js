const express = require('express');
const router = express.Router();
const ctrl = require('./dashboard.controller');
const auth = require('../../middleware/auth');

router.use(auth);

// Routes alignées avec frontend (dashboardAPI calls)
router.get('/kpi',       ctrl.getKPIsPrincipaux);
router.get('/stats',     ctrl.getKPIsPrincipaux);
router.get('/activite',  ctrl.getActiviteOperateurs);
router.get('/retard',    ctrl.getKPIsRetard);

// Routes existantes
router.get('/',           ctrl.getKPIsPrincipaux);
router.get('/maintenance', ctrl.getKPIsMaintenance);
router.get('/production',  ctrl.getKPIsProduction);
router.get('/adoption',    ctrl.getTauxAdoption);
router.get('/operateurs',  ctrl.getActiviteOperateurs);

// ── Historique des actions utilisateurs (audit_logs) ─────────────────
router.get('/historique', async (req, res, next) => {
    try {
        const { pool } = require('../../config/db');
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const isAdmin = req.user.role === 'ADMIN';

        // Admin voit tout, les autres voient seulement leurs propres actions
        const params = isAdmin ? [] : [req.user.id];
        const where  = isAdmin ? '' : 'WHERE al.utilisateur_id = $1';

        const { rows: totalRows } = await pool.query(
            `SELECT COUNT(*) FROM audit_logs al ${where}`, params
        );
        const total = parseInt(totalRows[0].count);

        const queryParams = isAdmin ? [limit, offset] : [req.user.id, limit, offset];
        const { rows } = await pool.query(
            `SELECT
                al.id,
                al.action,
                al.table_cible,
                al.enregistrement_id,
                al.date_action,
                al.ancienne_valeur,
                al.nouvelle_valeur,
                al.adresse_ip,
                u.nom        AS user_nom,
                u.prenom     AS user_prenom,
                u.email      AS user_email,
                r.nom        AS user_role
             FROM audit_logs al
             JOIN utilisateurs u ON u.id = al.utilisateur_id
             JOIN roles r        ON r.id = u.role_id
             ${where}
             ORDER BY al.date_action DESC
             LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
            queryParams
        );

        res.json({ data: rows, total, page, limit });
    } catch (err) { next(err); }
});

module.exports = router;