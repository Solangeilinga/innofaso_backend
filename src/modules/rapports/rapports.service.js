const pdfGenerator = require('../../utils/pdfGenerator');
const ExcelJS = require('exceljs');
const { query } = require('../../config/db');
const logger = require('../../utils/logger');

// ── Rapport journalier maintenance ────────────────────────────────────
const genererRapportJournalierPDF = async (date) => {
    const dateStr = date || new Date().toISOString().split('T')[0];

    const { rows } = await query(
        `SELECT s.id, s.date_soumission, s.statut,
            ft.code AS formulaire_code, ft.titre AS formulaire_titre,
            u.nom AS operateur_nom, u.prenom AS operateur_prenom,
            e.nom AS equipement_nom
     FROM soumissions s
     JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
     JOIN utilisateurs u       ON u.id  = s.utilisateur_id
     LEFT JOIN equipements e   ON e.id  = s.equipement_id
     WHERE ft.module = 'MAINTENANCE'
       AND s.date_soumission::DATE = $1
     ORDER BY s.date_soumission`,
        [dateStr]
    );

    logger.info('Génération rapport journalier maintenance', { date: dateStr, nb: rows.length });
    return pdfGenerator.rapportJournalierMaintenance(rows, dateStr);
};

// ── Rapport hebdomadaire consolidé ────────────────────────────────────
const genererRapportHebdomadairePDF = async (semaine) => {
    // semaine = '2026-W20'
    const [year, weekPart] = (semaine || '').split('-W');
    const week = parseInt(weekPart) || getCurrentWeek();
    const annee = parseInt(year) || new Date().getFullYear();

    const [maintenance, production] = await Promise.all([
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE ft.module = 'MAINTENANCE'
        AND EXTRACT(YEAR FROM s.date_soumission) = $1
        AND EXTRACT(WEEK FROM s.date_soumission) = $2
      ORDER BY s.date_soumission`, [annee, week]),
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE ft.module = 'PRODUCTION'
        AND EXTRACT(YEAR FROM s.date_soumission) = $1
        AND EXTRACT(WEEK FROM s.date_soumission) = $2
      ORDER BY s.date_soumission`, [annee, week]),
    ]);

    return pdfGenerator.rapportHebdomadaire({
        maintenance: maintenance.rows,
        production: production.rows,
        semaine: `${annee} — Semaine ${week}`,
    });
};

// ── Fiche équipement PDF ───────────────────────────────────────────────
const genererFicheEquipementPDF = async (equipementId) => {
    const [equip, historique, pieces] = await Promise.all([
        query('SELECT * FROM equipements WHERE id = $1', [equipementId]),
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE s.equipement_id = $1
      ORDER BY s.date_soumission DESC
      LIMIT 50`, [equipementId]),
        query('SELECT * FROM pieces_rechange WHERE equipement_id = $1', [equipementId]),
    ]);

    if (equip.rows.length === 0) {
        const err = new Error('Équipement non trouvé.'); err.statusCode = 404; throw err;
    }

    return pdfGenerator.ficheEquipement(equip.rows[0], historique.rows, pieces.rows);
};

// ── Export Excel ──────────────────────────────────────────────────────
const exporterExcel = async ({ date_debut, date_fin, module: mod }) => {
    const params = [];
    let where = "WHERE s.statut = 'SOUMIS'";

    if (date_debut) { params.push(date_debut); where += ` AND s.date_soumission::DATE >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); where += ` AND s.date_soumission::DATE <= $${params.length}`; }
    if (mod) { params.push(mod.toUpperCase()); where += ` AND ft.module = $${params.length}`; }

    const { rows } = await query(
        `SELECT s.date_soumission, ft.code, ft.titre, ft.module, ft.frequence,
            u.nom || ' ' || u.prenom AS operateur,
            e.nom AS equipement, s.source, s.statut
     FROM soumissions s
     JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
     JOIN utilisateurs u       ON u.id  = s.utilisateur_id
     LEFT JOIN equipements e   ON e.id  = s.equipement_id
     ${where} ORDER BY s.date_soumission DESC`,
        params
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'InnoFaso App';
    wb.created = new Date();

    const ws = wb.addWorksheet('Soumissions', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = [
        { header: 'Date & Heure', key: 'date_soumission', width: 22 },
        { header: 'Code', key: 'code', width: 28 },
        { header: 'Formulaire', key: 'titre', width: 50 },
        { header: 'Module', key: 'module', width: 14 },
        { header: 'Fréquence', key: 'frequence', width: 16 },
        { header: 'Opérateur', key: 'operateur', width: 28 },
        { header: 'Équipement', key: 'equipement', width: 30 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'Statut', key: 'statut', width: 14 },
    ];

    // Style en-tête
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.height = 20;

    for (const row of rows) {
        const added = ws.addRow({
            ...row,
            date_soumission: new Date(row.date_soumission).toLocaleString('fr-FR'),
        });

        // Couleur ligne selon statut
        if (row.statut === 'SOUMIS') {
            added.getCell('statut').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        }
    }

    // Bordures sur toutes les cellules
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                bottom: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                left: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                right: { style: 'thin', color: { argb: 'FFDDE3EA' } },
            };
        });
    });

    logger.info('Export Excel généré', { nb_lignes: rows.length, module: mod });
    return wb;
};

// ── Rapport mensuel OEE / MTBF / MTTR ────────────────────────────────
const genererRapportMensuelIndicateurs = async ({ annee, mois }) => {
    const a = parseInt(annee) || new Date().getFullYear();
    const m = parseInt(mois)  || new Date().getMonth() + 1;

    // Nombre d'heures ouvrées dans le mois (hypothèse 3 quarts × 8h × jours ouvrés)
    const HEURES_OUVERTURE_PAR_JOUR = 24; // usine en continu 3×8

    const [
        correctifs,
        preventives,
        encresSolvants,
        pannesParEquipement,
    ] = await Promise.all([

        // Correctifs du mois : durées d'arrêt et de maintenance par équipement
        query(`
            SELECT
                COALESCE(e.nom, mc.equipement_libre)    AS equipement,
                COUNT(mc.id)                             AS nb_correctifs,
                COALESCE(SUM(mc.duree_arret), 0)        AS total_arret_h,
                COALESCE(SUM(mc.duree_maintenance), 0)  AS total_maint_h
            FROM maintenance_corrective mc
            LEFT JOIN equipements e ON e.id = mc.equipement_id
            WHERE EXTRACT(YEAR FROM mc.cree_le) = $1
              AND EXTRACT(MONTH FROM mc.cree_le) = $2
            GROUP BY COALESCE(e.nom, mc.equipement_libre)
            ORDER BY nb_correctifs DESC
        `, [a, m]),

        // Préventives : taux de réalisation
        query(`
            SELECT
                COUNT(*)                                                    AS total_planifiees,
                COUNT(*) FILTER (WHERE statut = 'REALISE')                  AS realisees,
                COUNT(*) FILTER (WHERE statut = 'EN_RETARD')                AS en_retard,
                ROUND(
                    COUNT(*) FILTER (WHERE statut = 'REALISE')::NUMERIC /
                    NULLIF(COUNT(*), 0) * 100, 1
                )                                                           AS taux_realisation_pct
            FROM plannings_maintenance
            WHERE EXTRACT(YEAR FROM date_prevue) = $1
              AND EXTRACT(MONTH FROM date_prevue) = $2
        `, [a, m]),

        // Consommation encres & solvants (nb de saisies + valeurs si dispo)
        query(`
            SELECT ft.code, ft.titre, COUNT(s.id) AS nb_saisies
            FROM soumissions s
            JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
            WHERE ft.code IN (
                'PS-ME-EN-EIC-A',
                'PS-ME-EN-SEL-A',
                'PS-ME-EN-SOL-A',
                'PS-ME-EN-SPR-A'
            )
              AND s.statut = 'SOUMIS'
              AND EXTRACT(YEAR FROM s.date_soumission) = $1
              AND EXTRACT(MONTH FROM s.date_soumission) = $2
            GROUP BY ft.code, ft.titre
            ORDER BY ft.code
        `, [a, m]),

        // Pannes par équipement (signalements)
        query(`
            SELECT
                COALESCE(e.nom, sp.description)  AS equipement,
                COUNT(sp.id)                      AS nb_pannes,
                MIN(sp.date_panne)                AS premiere_panne,
                MAX(sp.date_panne)                AS derniere_panne
            FROM signalements_pannes sp
            LEFT JOIN equipements e ON e.id = sp.equipement_id
            WHERE EXTRACT(YEAR FROM sp.date_panne) = $1
              AND EXTRACT(MONTH FROM sp.date_panne) = $2
            GROUP BY COALESCE(e.nom, sp.description)
            ORDER BY nb_pannes DESC
            LIMIT 10
        `, [a, m]),
    ]);

    // ── Calcul MTBF / MTTR / OEE par équipement ───────────────────────
    // Nombre de jours du mois
    const joursduMois = new Date(a, m, 0).getDate();
    const heuresOuverture = joursduMois * HEURES_OUVERTURE_PAR_JOUR;

    const indicateursParEquipement = correctifs.rows.map(row => {
        const nb   = parseInt(row.nb_correctifs)  || 0;
        const arret = parseFloat(row.total_arret_h) || 0;
        const maint = parseFloat(row.total_maint_h) || 0;

        // MTBF = (heures ouverture - total arrêts) / nombre de pannes
        const mtbf = nb > 0
            ? Math.round(((heuresOuverture - arret) / nb) * 10) / 10
            : null; // pas de panne = MTBF non calculable

        // MTTR = total durée maintenance / nombre de pannes
        const mttr = nb > 0
            ? Math.round((maint / nb) * 10) / 10
            : null;

        // Disponibilité = (heures ouverture - arrêts) / heures ouverture × 100
        const disponibilite = heuresOuverture > 0
            ? Math.round(((heuresOuverture - arret) / heuresOuverture) * 1000) / 10
            : 100;

        // OEE simplifié : Disponibilité × Taux de performance × Taux de qualité
        // Sans données OEE complètes du process, on pose perf=1 et qualité=1
        // → OEE ≈ Disponibilité (valeur conservatrice, à affiner avec données process)
        const oee = disponibilite;

        return {
            equipement:   row.equipement,
            nb_correctifs: nb,
            total_arret_h: arret,
            total_maint_h: maint,
            mtbf_h:        mtbf,
            mttr_h:        mttr,
            disponibilite_pct: disponibilite,
            oee_pct:       oee,
        };
    });

    // ── Agrégats globaux ──────────────────────────────────────────────
    const totalArret = indicateursParEquipement.reduce((s, r) => s + r.total_arret_h, 0);
    const totalPannes = indicateursParEquipement.reduce((s, r) => s + r.nb_correctifs, 0);
    const mtbfGlobal = totalPannes > 0
        ? Math.round(((heuresOuverture - totalArret) / totalPannes) * 10) / 10
        : null;
    const mttrGlobal = totalPannes > 0
        ? Math.round((indicateursParEquipement.reduce((s, r) => s + r.total_maint_h, 0) / totalPannes) * 10) / 10
        : null;
    const disponibiliteGlobale = heuresOuverture > 0
        ? Math.round(((heuresOuverture - totalArret) / heuresOuverture) * 1000) / 10
        : 100;

    const prev = preventives.rows[0] || {};

    return {
        periode: { annee: a, mois: m, jours: joursduMois, heures_ouverture: heuresOuverture },
        globaux: {
            nb_pannes_total:       totalPannes,
            total_arret_h:         Math.round(totalArret * 10) / 10,
            mtbf_h:                mtbfGlobal,
            mttr_h:                mttrGlobal,
            disponibilite_pct:     disponibiliteGlobale,
            oee_pct:               disponibiliteGlobale, // cf. note OEE ci-dessus
            preventives_planifiees: parseInt(prev.total_planifiees) || 0,
            preventives_realisees:  parseInt(prev.realisees)         || 0,
            preventives_en_retard:  parseInt(prev.en_retard)         || 0,
            taux_realisation_pct:   parseFloat(prev.taux_realisation_pct) || 0,
        },
        par_equipement:    indicateursParEquipement,
        pannes_top10:      pannesParEquipement.rows,
        encres_solvants:   encresSolvants.rows,
    };
};

const getCurrentWeek = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
};

module.exports = {
    genererRapportJournalierPDF,
    genererRapportHebdomadairePDF,
    genererFicheEquipementPDF,
    exporterExcel,
    genererRapportMensuelIndicateurs,
};