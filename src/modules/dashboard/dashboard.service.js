const { query } = require('../../config/db');

// ── KPIs principaux (page d'accueil) ─────────────────────────────────
const getKPIsPrincipaux = async () => {
    const today = new Date().toISOString().split('T')[0];

    const [
        soumissionsJour,
        equipementsEtat,
        alertesNonLues,
        planningsJour,
        stocksBas,
        tendance7j,
    ] = await Promise.all([

        // Soumissions du jour
        query(`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'SOUMIS')    AS soumis,
        COUNT(*) FILTER (WHERE statut = 'BROUILLON') AS en_cours,
        COUNT(*)                                      AS total
      FROM soumissions
      WHERE date_soumission::DATE = $1
    `, [today]),

        // Répartition état équipements
        query(`
      SELECT etat, COUNT(*) AS nb
      FROM equipements
      WHERE actif = TRUE
      GROUP BY etat
      ORDER BY etat
    `),

        // Alertes non lues par type
        query(`
      SELECT type_alerte, COUNT(*) AS nb
      FROM alertes
      WHERE statut = 'NON_LUE'
      GROUP BY type_alerte
      ORDER BY nb DESC
    `),

        // Plannings du jour
        query(`
      SELECT statut, COUNT(*) AS nb
      FROM plannings_maintenance
      WHERE date_prevue = $1
      GROUP BY statut
    `, [today]),

        // Pièces en rupture de stock
        query(`
      SELECT COUNT(*) AS nb
      FROM pieces_rechange
      WHERE quantite_stock <= seuil_alerte
    `),

        // Courbe sur 7 jours
        query(`
      SELECT
        date_soumission::DATE AS jour,
        COUNT(*) AS nb
      FROM soumissions
      WHERE date_soumission >= NOW() - INTERVAL '7 days'
        AND statut = 'SOUMIS'
      GROUP BY jour
      ORDER BY jour
    `),
    ]);

    return {
        date: today,
        soumissions_jour: soumissionsJour.rows[0],
        equipements: equipementsEtat.rows,
        alertes: alertesNonLues.rows,
        plannings_jour: planningsJour.rows,
        stocks_bas: parseInt(stocksBas.rows[0].nb),
        tendance_7j: tendance7j.rows,
    };
};

// ── KPIs Maintenance ──────────────────────────────────────────────────
const getKPIsMaintenance = async ({ date_debut, date_fin }) => {
    const debut = date_debut || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fin = date_fin || new Date().toISOString().split('T')[0];

    const [pannes, preventives, retards, topEquipements, consommationEncres] = await Promise.all([

        // Nombre de pannes sur la période (formulaire MCP)
        query(`
      SELECT COUNT(*) AS nb
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code = 'PS-ME-EN-MCP-A'
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
    `, [debut, fin]),

        // Maintenances préventives
        query(`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'REALISE')                     AS realisees,
        COUNT(*) FILTER (WHERE statut IN ('PLANIFIE','EN_COURS'))       AS planifiees,
        COUNT(*) FILTER (WHERE statut = 'EN_RETARD')                    AS en_retard,
        ROUND(
          COUNT(*) FILTER (WHERE statut = 'REALISE')::NUMERIC /
          NULLIF(COUNT(*), 0) * 100, 1
        )                                                               AS taux_realisation
      FROM plannings_maintenance
      WHERE date_prevue BETWEEN $1 AND $2
    `, [debut, fin]),

        // Formulaires en retard
        query(`
      SELECT COUNT(*) AS nb
      FROM alertes
      WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
        AND date_creation::DATE BETWEEN $1 AND $2
    `, [debut, fin]),

        // Top 5 équipements les plus sollicités
        query(`
      SELECT e.nom, e.code_ref, COUNT(s.id) AS nb_interventions
      FROM soumissions s
      JOIN equipements e ON e.id = s.equipement_id
      WHERE s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
      GROUP BY e.id, e.nom, e.code_ref
      ORDER BY nb_interventions DESC
      LIMIT 5
    `, [debut, fin]),

        // Suivi consommation encres & solvants
        query(`
      SELECT ft.code, ft.titre, COUNT(s.id) AS nb_saisies
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code IN ('PS-ME-EN-EIC-A','PS-ME-EN-SEL-A','PS-ME-EN-SOL-A')
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
      GROUP BY ft.id, ft.code, ft.titre
    `, [debut, fin]),
    ]);

    return {
        periode: { debut, fin },
        pannes: parseInt(pannes.rows[0].nb),
        preventives: preventives.rows[0],
        retards: parseInt(retards.rows[0].nb),
        top_equipements: topEquipements.rows,
        consommation_encres: consommationEncres.rows,
    };
};

// ── KPIs Production ───────────────────────────────────────────────────
const getKPIsProduction = async ({ date_debut, date_fin }) => {
    const debut = date_debut || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fin = date_fin || new Date().toISOString().split('T')[0];

    const [passations, pertes, indicateurs, planningsHebdo] = await Promise.all([

        // Cahiers de passation de quart (CDP-A et CDP-B)
        query(`
      SELECT
        ft.code,
        ft.titre,
        COUNT(s.id) AS nb
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code IN ('PO-AP-EN-CDP-A','PO-AP-EN-CDP-B')
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
      GROUP BY ft.code, ft.titre
    `, [debut, fin]),

        // Suivi pertes matières premières
        query(`
      SELECT COUNT(s.id) AS nb_saisies
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code = 'PO-AP-EN-SPM-B'
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
    `, [debut, fin]),

        // Indicateur de gestion des déchets
        query(`
      SELECT COUNT(s.id) AS nb_saisies
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code = 'PO-AP-EN-IGD-A'
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
    `, [debut, fin]),

        // Plannings de production remplis sur la période
        query(`
      SELECT COUNT(s.id) AS nb
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      WHERE ft.code IN ('PO-AP-EN-PDP-B','PO-AP-EN-PPH-B')
        AND s.statut = 'SOUMIS'
        AND s.date_soumission::DATE BETWEEN $1 AND $2
    `, [debut, fin]),
    ]);

    return {
        periode: { debut, fin },
        passations_quart: passations.rows,
        pertes_matieres: parseInt(pertes.rows[0]?.nb_saisies || 0),
        indicateurs_dechets: parseInt(indicateurs.rows[0]?.nb_saisies || 0),
        plannings_production: parseInt(planningsHebdo.rows[0]?.nb || 0),
    };
};

// ── Taux d'adoption (KPI CDC : 100% en 60 jours) ─────────────────────
const getTauxAdoption = async () => {
    const { rows } = await query(`
    WITH total_prevu AS (
      -- Nombre de formulaires journaliers * nombre de jours du mois courant
      SELECT
        (SELECT COUNT(*) FROM formulaires_types WHERE actif = TRUE AND frequence = 'JOURNALIER')
        * EXTRACT(DAY FROM NOW())::INT AS attendus_jour,

        (SELECT COUNT(*) FROM formulaires_types WHERE actif = TRUE AND frequence = 'HEBDOMADAIRE')
        * EXTRACT(WEEK FROM NOW())::INT AS attendus_hebdo,

        (SELECT COUNT(*) FROM formulaires_types WHERE actif = TRUE AND frequence = 'MENSUEL')
        * EXTRACT(MONTH FROM NOW())::INT AS attendus_mensuel
    ),
    total_soumis AS (
      SELECT COUNT(*) AS nb
      FROM soumissions
      WHERE statut = 'SOUMIS'
        AND date_soumission >= DATE_TRUNC('month', NOW())
    )
    SELECT
      tp.attendus_jour + tp.attendus_hebdo + tp.attendus_mensuel AS total_attendus,
      ts.nb AS total_soumis,
      ROUND(
        ts.nb::NUMERIC /
        NULLIF(tp.attendus_jour + tp.attendus_hebdo + tp.attendus_mensuel, 0) * 100,
        1
      ) AS taux_adoption_pct
    FROM total_prevu tp, total_soumis ts
  `);

    return rows[0];
};

// ── Activité par opérateur ────────────────────────────────────────────
const getActiviteOperateurs = async ({ date_debut, date_fin }) => {
    const debut = date_debut || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const fin = date_fin || new Date().toISOString().split('T')[0];

    const { rows } = await query(`
    SELECT
      u.id,
      u.nom,
      u.prenom,
      r.nom AS role,
      COUNT(s.id)                                          AS total_soumissions,
      COUNT(s.id) FILTER (WHERE s.statut = 'SOUMIS')       AS soumis,
      COUNT(s.id) FILTER (WHERE s.statut = 'BROUILLON')    AS brouillons,
      COUNT(s.id) FILTER (WHERE s.source = 'HORS_LIGNE')   AS hors_ligne,
      MAX(s.date_soumission)                               AS derniere_activite
    FROM utilisateurs u
    JOIN roles r ON r.id = u.role_id
    LEFT JOIN soumissions s ON s.utilisateur_id = u.id
      AND s.date_soumission::DATE BETWEEN $1 AND $2
    WHERE u.actif = TRUE
    GROUP BY u.id, u.nom, u.prenom, r.nom
    ORDER BY total_soumissions DESC
  `, [debut, fin]);

    return rows;
};

module.exports = {
    getKPIsPrincipaux,
    getKPIsMaintenance,
    getKPIsProduction,
    getTauxAdoption,
    getActiviteOperateurs,
};