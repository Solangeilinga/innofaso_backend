const cron = require('node-cron');
const logger = require('../utils/logger');

const safeRun = (label, fn) => async () => {
    logger.info(`Cron [${label}] démarré`);
    try { await fn(); logger.info(`Cron [${label}] terminé`); }
    catch (err) { logger.error(`Cron [${label}] erreur : ${err.message}`); }
};

const getAlertesService  = () => require('../modules/alertes/alertes.service');
const getMatieresService = () => require('../modules/matieres/matieres.service');

logger.info('⏰ Cron des alertes démarré.');

// ── Formulaires non couverts dans les plannings (toutes les 2h) ───────
// On vérifie les quarts terminés dont un formulaire assigné n'a pas été soumis
cron.schedule('0 */2 * * *', safeRun('Planning non couvert — formulaires manquants', async () => {
    const svc = getAlertesService();
    const nb = await svc.verifierPlanningsNonCouverts(2); // fenêtre anti-doublon 2h
    logger.info(`Planning non couvert : ${nb} formulaire(s) manquant(s)`);
}));

// ── Plannings EN_RETARD (07h30) ───────────────────────────────────────
cron.schedule('30 7 * * *', safeRun('07h30 — plannings en retard', async () => {
    const { pool } = require('../config/db');
    await pool.query(
        `UPDATE plannings_maintenance SET statut='EN_RETARD'
         WHERE date_prevue < CURRENT_DATE AND statut='PLANIFIE'`
    );
}));

// ── Stocks pièces bas (18h00) ─────────────────────────────────────────
cron.schedule('0 18 * * *', safeRun('18h00 — stocks pièces bas', () =>
    getAlertesService().verifierStocksBas()
));

// ── Stocks matières premières bas (18h15) ─────────────────────────────
cron.schedule('15 18 * * *', safeRun('18h15 — stocks MP bas', () =>
    getMatieresService().verifierStocksMP()
));

// ── Rappels maintenances du lendemain (23h00) ─────────────────────────
cron.schedule('0 23 * * *', safeRun('23h00 — rappels maintenances demain', async () => {
    const { pool } = require('../config/db');
    const alertesService = getAlertesService();
    const demain = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    // Rappels depuis plannings_maintenance (basique)
    const { rows: planBasique } = await pool.query(
        `SELECT p.id, ft.titre, e.nom AS equipement, u.id AS technicien_id
         FROM plannings_maintenance p
         JOIN formulaires_types ft ON ft.id = p.formulaire_type_id
         JOIN equipements e        ON e.id  = p.equipement_id
         JOIN utilisateurs u       ON u.id  = p.technicien_id
         WHERE p.date_prevue = $1 AND p.statut = 'PLANIFIE'`,
        [demain]
    );
    for (const plan of planBasique) {
        await alertesService.creer({
            utilisateur_id: plan.technicien_id,
            type_alerte:    'MAINTENANCE_PREVENTIVE',
            message: `📅 Maintenance prévue demain : "${plan.titre}" sur ${plan.equipement}`,
        });
    }

    // Rappels depuis planning_quart (Alfred) — techniciens assignés à demain
    const { rows: planQuart } = await pool.query(
        `SELECT DISTINCT pq.maintenancier_id, pq.co_maintenancier_id,
                lp.code AS ligne_code, pj.date_jour, qm.nom AS quart_nom
         FROM planning_quart pq
         JOIN planning_jour pj   ON pq.planning_jour_id   = pj.id
         JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
         JOIN ligne_production lp ON ps.ligne_id           = lp.id
         JOIN quart_maintenance qm ON pq.quart_id          = qm.id
         WHERE pj.date_jour = $1`,
        [demain]
    );
    for (const q of planQuart) {
        const destinataires = [q.maintenancier_id, q.co_maintenancier_id].filter(Boolean);
        const dateF = new Date(demain).toLocaleDateString('fr-FR');
        for (const uid of destinataires) {
            await alertesService.creer({
                utilisateur_id: uid,
                type_alerte:    'MAINTENANCE_PREVENTIVE',
                message: `🔧 Vous êtes planifié demain — Ligne ${q.ligne_code}, ${q.quart_nom} (${dateF})`,
            });
        }
    }

    logger.info(`Rappels maintenances : ${planBasique.length + planQuart.length}`);
}));
// ── Deadline quart dépassée sans soumission → alerte admin+resps ─────
// Toutes les heures : vérifier les quarts qui viennent de se terminer
cron.schedule('0 * * * *', safeRun('Deadline quart — alerte responsables', async () => {
    const { pool } = require('../config/db');
    const alertesService = getAlertesService();
    const heure = new Date().getHours();

    // Quarts terminés à cette heure aujourd'hui
    const { rows: quartsTermines } = await pool.query(
        `SELECT DISTINCT
            pq.maintenancier_id,
            pq.co_maintenancier_id,
            qm.nom AS quart_nom,
            qm.heure_debut,
            qm.heure_fin,
            pj.date_jour,
            lp.code AS ligne_code
         FROM planning_quart pq
         JOIN planning_jour pj     ON pq.planning_jour_id = pj.id
         JOIN quart_maintenance qm ON pq.quart_id = qm.id
         JOIN planning_semaine ps  ON pj.planning_semaine_id = ps.id
         JOIN ligne_production lp  ON ps.ligne_id = lp.id
         WHERE pj.date_jour = CURRENT_DATE
           AND qm.heure_fin = $1`,
        [heure]
    );

    for (const q of quartsTermines) {
        const destinataires = [q.maintenancier_id, q.co_maintenancier_id].filter(Boolean);

        // Vérifier si au moins un formulaire a été soumis pendant ce quart
        const fin = q.heure_fin === 0 ? 24 : q.heure_fin;
        const { rows: soumissions } = await pool.query(
            `SELECT id FROM soumissions
             WHERE utilisateur_id = ANY($1)
               AND date_soumission::date = $2
               AND EXTRACT(HOUR FROM date_soumission) >= $3
               AND EXTRACT(HOUR FROM date_soumission) < $4
               AND statut IN ('SOUMIS','VALIDE')
             LIMIT 1`,
            [destinataires, q.date_jour, q.heure_debut, fin]
        );

        if (soumissions.length === 0) {
            // Récupérer tous les admins et responsables
            const { rows: responsables } = await pool.query(
                `SELECT u.id FROM utilisateurs u
                 JOIN roles r ON r.id = u.role_id
                 WHERE r.nom IN ('ADMIN','RESP_MAINT','RESP_PROD')
                   AND u.actif = TRUE`
            );

            const dateF = new Date(q.date_jour).toLocaleDateString('fr-FR');
            const msg = `🚨 Aucune soumission pour le ${q.quart_nom} (${q.heure_debut}h-${q.heure_fin}h) — Ligne ${q.ligne_code} (${dateF}). Travail non confirmé.`;

            // Éviter les doublons
            const { rows: dejaAlerte } = await pool.query(
                `SELECT id FROM alertes
                 WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
                   AND date_creation::date = CURRENT_DATE
                   AND message LIKE $1`,
                [`%${q.quart_nom}%Ligne ${q.ligne_code}%`]
            );

            if (dejaAlerte.length === 0) {
                for (const r of responsables) {
                    await alertesService.creer({
                        utilisateur_id: r.id,
                        type_alerte:    'FORMULAIRE_EN_RETARD',
                        message:        msg,
                    });
                }
                logger.info(`Deadline quart non couvert : ${q.quart_nom} Ligne ${q.ligne_code}`);
            }
        }
    }
}));