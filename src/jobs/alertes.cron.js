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

// ── Formulaires JOURNALIER : vérifier à 17h chaque jour ──────────────
cron.schedule('0 17 * * *', safeRun('17h00 — formulaires journaliers non soumis', async () => {
    const svc = getAlertesService();
    await svc.verifierFormulairesEnRetardParFrequence(['JOURNALIER']);
}));

// ── Formulaires HEBDO : vendredi à 16h ───────────────────────────────
cron.schedule('0 16 * * 5', safeRun('Ven 16h00 — formulaires hebdo non soumis', async () => {
    const svc = getAlertesService();
    await svc.verifierFormulairesEnRetardParFrequence(['HEBDO','HEBDOMADAIRE']);
}));

// ── Formulaires MENSUEL : dernier jour du mois à 16h ─────────────────
// On vérifie les jours 28 à 31 et on contrôle si c'est le dernier jour
cron.schedule('0 16 28-31 * *', safeRun('Fin mois 16h — formulaires mensuels non soumis', async () => {
    const demain = new Date(); demain.setDate(demain.getDate() + 1);
    const estDernierJour = demain.getDate() === 1; // si demain est le 1er, aujourd'hui est le dernier
    if (!estDernierJour) return;
    const svc = getAlertesService();
    await svc.verifierFormulairesEnRetardParFrequence(['MENSUEL']);
}));

// ── Rappel général du matin : formulaires JOURNALIER pas encore remplis ─
cron.schedule('0 8 * * *', safeRun('08h00 — rappel matinal formulaires', async () => {
    const svc = getAlertesService();
    await svc.verifierFormulairesEnRetardParFrequence(['JOURNALIER'], true); // mode rappel = ne pas dupliquer si alerte récente
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