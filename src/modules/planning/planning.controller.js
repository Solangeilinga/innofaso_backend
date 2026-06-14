const { query: dbQuery, pool } = require('../../config/db');
const db = { query: (...a) => dbQuery(...a), getClient: () => pool.connect() };
const { v4: uuid } = require('uuid');
const {
  ensurePlanningSemaine,
  agregerInterventionsLigne,
  weekRange,
} = require('../../services/planningSync.service');

// ========================================
// PLANNING SEMAINE - Gestion hebdomadaire
// ========================================

/**
 * Créer ou récupérer le planning d'une semaine pour une ligne
 */
exports.creerOuRecupererPlanningSemaine = async (req, res) => {
  try {
    const { ligne_id, date_debut, semaine_num, annee } = req.body;
    const adminId = req.user.id;

    if (!ligne_id || !date_debut || !semaine_num || !annee) {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    // Vérifier si le planning existe déjà
    let { rows: existing } = await db.query(
      'SELECT * FROM planning_semaine WHERE ligne_id=$1 AND semaine_num=$2 AND annee=$3',
      [ligne_id, semaine_num, annee]
    );

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    // Créer un nouveau planning
    const dateDebut = new Date(date_debut);
    const dateFin = new Date(dateDebut);
    dateFin.setDate(dateFin.getDate() + 6);

    const { rows } = await db.query(
      `INSERT INTO planning_semaine 
       (id, ligne_id, date_debut_semaine, date_fin_semaine, semaine_num, annee, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        uuid(),
        ligne_id,
        dateDebut.toISOString().split('T')[0],
        dateFin.toISOString().split('T')[0],
        semaine_num,
        annee,
        adminId
      ]
    );

    // Créer automatiquement les 7 jours de la semaine
    const jours = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(dateDebut);
      currentDate.setDate(currentDate.getDate() + i);
      
      await db.query(
        `INSERT INTO planning_jour 
         (id, planning_semaine_id, date_jour, jour_semaine)
         VALUES ($1, $2, $3, $4)`,
        [
          uuid(),
          rows[0].id,
          currentDate.toISOString().split('T')[0],
          jours[i]
        ]
      );
    }

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Récupérer le planning complet d'une semaine avec tous les quarts et interventions
 */
exports.obtenirPlanningSemaine = async (req, res) => {
  try {
    const { planningSemaineId } = req.params;

    // Récupérer le planning semaine
    const { rows: planning } = await db.query(
      `SELECT ps.*, lp.code AS ligne_code, lp.nom AS ligne_nom
       FROM planning_semaine ps
       JOIN ligne_production lp ON ps.ligne_id = lp.id
       WHERE ps.id = $1`,
      [planningSemaineId]
    );

    if (!planning.length) {
      return res.status(404).json({ error: 'Planning non trouvé' });
    }

    // Récupérer tous les jours
    const { rows: jours } = await db.query(
      `SELECT pj.*, 
       (SELECT jsonb_agg(
         jsonb_build_object(
           'id', pq.id,
           'quart_id', pq.quart_id,
           'quart_nom', qm.nom,
           'quart_heures', qm.heure_debut || 'h - ' || qm.heure_fin || 'h',
           'maintenancier_id', pq.maintenancier_id,
           'maintenancier_nom', u1.prenom || ' ' || u1.nom,
           'co_maintenancier_id', pq.co_maintenancier_id,
           'co_maintenancier_nom', u2.prenom || ' ' || u2.nom,
           'interventions', (
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', iq.id,
                 'equipement_id', iq.equipement_id,
                 'equipement_nom', eq.nom,
                 'equipement_code', eq.code_ref,
                 'duree_arret', iq.duree_arret_effectif,
                 'cause_indisponibilite', iq.cause_indisponibilite,
                 'observations', iq.observations,
                 'temps_couverture', iq.temps_couverture,
                 'taux_disponibilite', iq.taux_disponibilite_calcule,
                 'taux_cible', iq.taux_cible,
                 'statut', iq.statut
               )
             )
             FROM intervention_quart iq
             JOIN equipements eq ON iq.equipement_id = eq.id
             WHERE iq.planning_quart_id = pq.id
           )
         )
       ) FROM planning_quart pq
       LEFT JOIN quart_maintenance qm ON pq.quart_id = qm.id
       LEFT JOIN utilisateurs u1 ON pq.maintenancier_id = u1.id
       LEFT JOIN utilisateurs u2 ON pq.co_maintenancier_id = u2.id
       WHERE pq.planning_jour_id = pj.id) AS quarts
       FROM planning_jour pj
       WHERE pj.planning_semaine_id = $1
       ORDER BY pj.date_jour ASC`,
      [planningSemaineId]
    );

    res.json({
      planning: planning[0],
      jours: jours
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Assigner un maintenancier et co-maintenancier à un quart
 */
exports.assignerMaintenancierQuart = async (req, res) => {
  try {
    const planningJourId = req.body.planningJourId || req.body.planning_jour_id;
    const quartId = req.body.quartId || req.body.quart_id;
    const { maintenancier_id, co_maintenancier_id } = req.body;

    if (!planningJourId || !quartId || !maintenancier_id) {
      return res.status(400).json({ error: 'Paramètres requis manquants' });
    }

    // Vérifier si la combinaison existe déjà
    let { rows: existing } = await db.query(
      `SELECT * FROM planning_quart 
       WHERE planning_jour_id = $1 AND quart_id = $2`,
      [planningJourId, quartId]
    );

    const result = existing.length > 0
      ? await db.query(
          `UPDATE planning_quart 
           SET maintenancier_id = $1, co_maintenancier_id = $2
           WHERE planning_jour_id = $3 AND quart_id = $4
           RETURNING *`,
          [maintenancier_id, co_maintenancier_id || null, planningJourId, quartId]
        )
      : await db.query(
          `INSERT INTO planning_quart 
           (id, planning_jour_id, quart_id, maintenancier_id, co_maintenancier_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [uuid(), planningJourId, quartId, maintenancier_id, co_maintenancier_id || null]
        );

    res.json(result.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ========================================
// INTERVENTIONS QUART - Maintenance corrective
// ========================================

/**
 * Créer ou mettre à jour une intervention de maintenance
 */
exports.creerOuModifierIntervention = async (req, res) => {
  try {
    const { 
      id,
      planning_quart_id, 
      equipement_id, 
      duree_arret_effectif,
      cause_indisponibilite,
      observations,
      temps_couverture = 8.0,
      statut = 'EN_ATTENTE'
    } = req.body;

    if (!planning_quart_id || !equipement_id) {
      return res.status(400).json({ error: 'planning_quart_id et equipement_id requis' });
    }

    if (id) {
      // Mise à jour
      const { rows } = await db.query(
        `UPDATE intervention_quart 
         SET duree_arret_effectif = $1, 
             cause_indisponibilite = $2,
             observations = $3,
             temps_couverture = $4,
             statut = $5,
             modifie_le = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          duree_arret_effectif || 0,
          cause_indisponibilite || null,
          observations || null,
          temps_couverture,
          statut,
          id
        ]
      );
      const { rows: pqUpd } = await db.query(
        `SELECT ps.ligne_id, pq.id AS planning_quart_id
         FROM intervention_quart iq
         JOIN planning_quart pq ON iq.planning_quart_id = pq.id
         JOIN planning_jour pj ON pq.planning_jour_id = pj.id
         JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
         WHERE iq.id = $1`,
        [id]
      );
      if (pqUpd.length) {
        await agregerInterventionsLigne(db, pqUpd[0].planning_quart_id, pqUpd[0].ligne_id);
      }
      return res.json(rows[0]);
    }

    // Création
    const { rows } = await db.query(
      `INSERT INTO intervention_quart 
       (id, planning_quart_id, equipement_id, duree_arret_effectif, 
        cause_indisponibilite, observations, temps_couverture, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        uuid(),
        planning_quart_id,
        equipement_id,
        duree_arret_effectif || 0,
        cause_indisponibilite || null,
        observations || null,
        temps_couverture,
        statut
      ]
    );

    const { rows: pqCtx } = await db.query(
      `SELECT ps.ligne_id, iq.planning_quart_id
       FROM intervention_quart iq
       JOIN planning_quart pq ON iq.planning_quart_id = pq.id
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE iq.id = $1`,
      [rows[0].id]
    );
    if (pqCtx.length) {
      await agregerInterventionsLigne(db, pqCtx[0].planning_quart_id, pqCtx[0].ligne_id);
    }

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Supprimer une intervention
 */
exports.supprimerIntervention = async (req, res) => {
  try {
    const { interventionId } = req.params;

    const { rows } = await db.query(
      'DELETE FROM intervention_quart WHERE id = $1 RETURNING id',
      [interventionId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Intervention non trouvée' });
    }

    const { rows: ctx } = await db.query(
      `SELECT pq.id AS planning_quart_id, ps.ligne_id
       FROM intervention_quart iq
       JOIN planning_quart pq ON iq.planning_quart_id = pq.id
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE iq.id = $1`,
      [interventionId]
    );
    if (ctx.length) {
      await agregerInterventionsLigne(db, ctx[0].planning_quart_id, ctx[0].ligne_id);
    }

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Planning mensuel (4 semaines) — grille complète
 */
exports.obtenirPlanningMois = async (req, res) => {
  try {
    const { ligne_id, mois, annee, semaine_index } = req.query;
    if (!ligne_id || !mois || !annee) {
      return res.status(400).json({ error: 'ligne_id, mois et annee requis' });
    }
    const moisInt = parseInt(mois, 10);
    const anneeInt = parseInt(annee, 10);
    const semIdx = semaine_index ? parseInt(semaine_index, 10) : 1;
    const adminId = req.user.id;
    const peutCreer = ['ADMIN','RESP_MAINT'].includes(req.user.role);

    let { rows: existingPlan } = await db.query(
      `SELECT * FROM planning_semaine
       WHERE ligne_id=$1 AND annee=$2 AND mois=$3 AND semaine_index=$4`,
      [ligne_id, anneeInt, moisInt, semIdx]
    );

    if (!existingPlan.length && !peutCreer) {
      const range = weekRange(anneeInt, moisInt, semIdx);
      const { rows: quartsRef } = await db.query(
        'SELECT * FROM quart_maintenance ORDER BY heure_debut'
      );
      const { rows: ligne } = await db.query(
        'SELECT * FROM ligne_production WHERE id=$1',
        [ligne_id]
      );
      return res.json({
        planning: null,
        ligne: ligne[0],
        semaine_index: semIdx,
        semaine_libelle: `Semaine ${String(semIdx).padStart(2, '0')}`,
        date_debut: range.dateDebut.toISOString().split('T')[0],
        date_fin: range.dateFin.toISOString().split('T')[0],
        quarts_ref: quartsRef,
        jours: [],
      });
    }

    const planning = existingPlan.length
      ? existingPlan[0]
      : await ensurePlanningSemaine(db, {
          ligneId: ligne_id,
          annee: anneeInt,
          mois: moisInt,
          semaineIndex: semIdx,
          adminId,
        });

    const { rows: jours } = await db.query(
      `SELECT pj.*,
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', pq.id,
            'quart_id', pq.quart_id,
            'quart_nom', qm.nom,
            'quart_description', qm.description,
            'heure_debut', qm.heure_debut,
            'heure_fin', qm.heure_fin,
            'maintenancier_id', pq.maintenancier_id,
            'maintenancier_nom', u1.prenom || ' ' || u1.nom,
            'co_maintenancier_id', pq.co_maintenancier_id,
            'co_maintenancier_nom', CASE WHEN u2.id IS NOT NULL THEN u2.prenom || ' ' || u2.nom END,
            'ligne_intervention', (
              SELECT jsonb_build_object(
                'id', il.id,
                'duree_arret', il.duree_arret_agregee,
                'temps_couverture', il.temps_couverture,
                'taux_disponibilite', il.taux_disponibilite_calcule,
                'taux_cible', il.taux_cible,
                'cause_indisponibilite', il.cause_indisponibilite,
                'observations', il.observations
              ) FROM intervention_ligne il WHERE il.planning_quart_id = pq.id
            ),
            'interventions', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'id', iq.id,
                  'equipement_id', iq.equipement_id,
                  'equipement_nom', eq.nom,
                  'equipement_code', eq.code_ref,
                  'duree_arret', iq.duree_arret_effectif,
                  'cause_indisponibilite', iq.cause_indisponibilite,
                  'observations', iq.observations,
                  'taux_disponibilite', iq.taux_disponibilite_calcule,
                  'soumission_id', iq.soumission_id
                ) ORDER BY iq.cree_le
              ), '[]'::jsonb)
              FROM intervention_quart iq
              JOIN equipements eq ON iq.equipement_id = eq.id
              WHERE iq.planning_quart_id = pq.id
            )
          ) ORDER BY qm.heure_debut
        ) FROM planning_quart pq
        LEFT JOIN quart_maintenance qm ON pq.quart_id = qm.id
        LEFT JOIN utilisateurs u1 ON pq.maintenancier_id = u1.id
        LEFT JOIN utilisateurs u2 ON pq.co_maintenancier_id = u2.id
        WHERE pq.planning_jour_id = pj.id) AS quarts_assignes
       FROM planning_jour pj
       WHERE pj.planning_semaine_id = $1
       ORDER BY pj.date_jour`,
      [planning.id]
    );

    const { rows: quartsRef } = await db.query(
      'SELECT * FROM quart_maintenance ORDER BY heure_debut'
    );

    const { rows: ligne } = await db.query(
      'SELECT * FROM ligne_production WHERE id=$1',
      [ligne_id]
    );

    const range = weekRange(anneeInt, moisInt, semIdx);

    res.json({
      planning,
      ligne: ligne[0],
      semaine_index: semIdx,
      semaine_libelle: `Semaine ${String(semIdx).padStart(2, '0')}`,
      date_debut: range.dateDebut.toISOString().split('T')[0],
      date_fin: range.dateFin.toISOString().split('T')[0],
      quarts_ref: quartsRef,
      jours,
    });
  } catch (e) {
    console.error('obtenirPlanningMois:', e.message);
    res.status(500).json({
      error: 'Erreur serveur',
      detail: process.env.NODE_ENV !== 'production' ? e.message : undefined,
    });
  }
};

/**
 * Modifier l'agrégat ligne (admin) ou créer si absent
 */
exports.mettreAJourInterventionLigne = async (req, res) => {
  try {
    const {
      planning_quart_id,
      duree_arret_agregee,
      cause_indisponibilite,
      observations,
      temps_couverture = 8.0,
    } = req.body;

    if (!planning_quart_id) {
      return res.status(400).json({ error: 'planning_quart_id requis' });
    }

    const { rows: ctx } = await db.query(
      `SELECT ps.ligne_id FROM planning_quart pq
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE pq.id = $1`,
      [planning_quart_id]
    );
    if (!ctx.length) return res.status(404).json({ error: 'Quart introuvable' });

    const { rows: existing } = await db.query(
      'SELECT id FROM intervention_ligne WHERE planning_quart_id=$1',
      [planning_quart_id]
    );

    let rows;
    if (existing.length) {
      ({ rows } = await db.query(
        `UPDATE intervention_ligne
         SET duree_arret_agregee = COALESCE($1, duree_arret_agregee),
             cause_indisponibilite = COALESCE($2, cause_indisponibilite),
             observations = COALESCE($3, observations),
             temps_couverture = COALESCE($4, temps_couverture),
             modifie_le = NOW()
         WHERE planning_quart_id = $5
         RETURNING *`,
        [duree_arret_agregee, cause_indisponibilite, observations, temps_couverture, planning_quart_id]
      ));
    } else {
      ({ rows } = await db.query(
        `INSERT INTO intervention_ligne
         (id, planning_quart_id, ligne_id, duree_arret_agregee,
          cause_indisponibilite, observations, temps_couverture)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          uuid(),
          planning_quart_id,
          ctx[0].ligne_id,
          duree_arret_agregee || 0,
          cause_indisponibilite || null,
          observations || null,
          temps_couverture,
        ]
      ));
    }

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Historique planning (lecture seule, tous rôles authentifiés)
 */
exports.listerHistorique = async (req, res) => {
  try {
    const { ligne_id, mois, annee } = req.query;
    const params = [];
    let query = `
      SELECT ps.id, ps.mois, ps.semaine_index, ps.date_debut_semaine, ps.date_fin_semaine,
             ps.statut, ps.annee, lp.code AS ligne_code, lp.nom AS ligne_nom,
             COUNT(DISTINCT pq.id) AS nb_quarts,
             COALESCE(SUM(il.duree_arret_agregee),0) AS total_arret_ligne,
             AVG(il.taux_disponibilite_calcule) AS avg_disponibilite
      FROM planning_semaine ps
      JOIN ligne_production lp ON ps.ligne_id = lp.id
      LEFT JOIN planning_jour pj ON pj.planning_semaine_id = ps.id
      LEFT JOIN planning_quart pq ON pq.planning_jour_id = pj.id
      LEFT JOIN intervention_ligne il ON il.planning_quart_id = pq.id
      WHERE ps.mois IS NOT NULL
    `;

    if (ligne_id) {
      params.push(ligne_id);
      query += ` AND ps.ligne_id = $${params.length}`;
    }
    if (mois) {
      params.push(parseInt(mois, 10));
      query += ` AND ps.mois = $${params.length}`;
    }
    if (annee) {
      params.push(parseInt(annee, 10));
      query += ` AND ps.annee = $${params.length}`;
    }

    query += `
      GROUP BY ps.id, lp.code, lp.nom
      ORDER BY ps.annee DESC, ps.mois DESC, ps.semaine_index DESC
      LIMIT 50
    `;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ========================================
// DASHBOARD - Statistiques et Analyses
// ========================================

/**
 * Dashboard maintenance: résumé mensuel par maintenancier et ligne
 */
exports.dashboardMaintenanceMensuel = async (req, res) => {
  try {
    const { mois, annee, ligne_id } = req.query;

    if (!mois || !annee) {
      return res.json([]);
    }

    const moisInt = parseInt(mois, 10);
    const anneeInt = parseInt(annee, 10);

    // v_maintenance_dashboard_mensuel.mois est un DATE (DATE_TRUNC(... )::DATE)
    const params = [];
    let query = `
      SELECT
        mois,
        maintenancier_id,
        maintenancier_nom,
        ligne_code,
        nb_interventions,
        total_duree_arret AS total_maintenance_corrective_heures,
        avg_taux_disponibilite,
        max_taux_disponibilite AS max_taux,
        min_taux_disponibilite AS min_taux,
        causes
      FROM v_maintenance_dashboard_mensuel
      WHERE mois = make_date($1, $2, 1)
    `;

    params.push(anneeInt, moisInt);

    if (ligne_id) {
      params.push(ligne_id);
      query += `
        AND ligne_code IN (SELECT code FROM ligne_production WHERE id = $${params.length})
      `;
    }

    query += ' ORDER BY maintenancier_nom';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Suivi maintenance par équipement (mensuel/annuel)
 */
exports.suiviEquipementMaintenance = async (req, res) => {
  try {
    const { mois, annee, ligne_id } = req.query;

    if (!mois || !annee) {
      return res.json([]);
    }

    const moisInt = parseInt(mois, 10);
    const anneeInt = parseInt(annee, 10);

    const params = [];
    let query = `
      SELECT
        mois_annee,
        equipement_id,
        equipement_nom,
        equipement_code,
        ligne_code,
        total_maintenance_corrective AS total_maintenance_corrective,
        nb_interventions,
        avg_disponibilite,
        remarques
      FROM v_maintenance_equipement_suivi
      WHERE mois_annee = make_date($1, $2, 1)
    `;

    params.push(anneeInt, moisInt);

    if (ligne_id) {
      params.push(ligne_id);
      query += `
        AND ligne_code IN (SELECT code FROM ligne_production WHERE id = $${params.length})
      `;
    }

    query += ' ORDER BY equipement_code';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Dashboard synthèse mensuelle (KPIs globaux + par maintenancier)
 */
exports.dashboardSynthese = async (req, res) => {
  try {
    const { mois, annee, ligne_id } = req.query;
    if (!mois || !annee) return res.json({ kpis: {}, par_maintenancier: [], par_ligne: [] });

    const moisInt = parseInt(mois, 10);
    const anneeInt = parseInt(annee, 10);
    const params = [anneeInt, moisInt];
    let ligneFilter = '';
    if (ligne_id) {
      params.push(ligne_id);
      ligneFilter = ` AND ps.ligne_id = $${params.length}`;
    }

    const { rows: kpiRows } = await db.query(
      `SELECT
         AVG(i.taux_disponibilite_calcule) AS disponibilite_moyenne,
         COALESCE(SUM(i.duree_arret_effectif),0) AS heures_correctives,
         COUNT(DISTINCT i.id) AS nb_interventions,
         COUNT(DISTINCT e.id) AS nb_equipements
       FROM intervention_quart i
       JOIN equipements e ON i.equipement_id = e.id
       JOIN planning_quart pq ON i.planning_quart_id = pq.id
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE DATE_TRUNC('month', i.modifie_le) = make_date($1,$2,1) ${ligneFilter}`,
      params
    );

    const { rows: prevRows } = await db.query(
      `SELECT COALESCE(SUM(
         CASE WHEN cd.unite ILIKE '%h%' OR cd.nom_champ ILIKE '%heure%'
         THEN vs.valeur_nombre ELSE 0 END
       ),0) AS heures_preventives
       FROM soumissions s
       JOIN formulaires_types ft ON s.formulaire_type_id = ft.id
       JOIN valeurs_saisies vs ON vs.soumission_id = s.id
       JOIN champs_definitions cd ON vs.champ_def_id = cd.id
       LEFT JOIN equipements e ON s.equipement_id = e.id
       WHERE ft.module = 'MAINTENANCE'
         AND ft.code != 'PS-ME-MC-A'
         AND s.statut IN ('SOUMIS','VALIDE')
         AND DATE_TRUNC('month', s.date_soumission) = make_date($1,$2,1)
         ${ligne_id ? `AND e.ligne_id = $3` : ''}`,
      ligne_id ? [anneeInt, moisInt, ligne_id] : [anneeInt, moisInt]
    );

    const { rows: parMaint } = await db.query(
      `SELECT * FROM v_maintenance_dashboard_mensuel
       WHERE mois = make_date($1,$2,1)
       ${ligne_id ? `AND ligne_code IN (SELECT code FROM ligne_production WHERE id=$3)` : ''}
       ORDER BY maintenancier_nom`,
      ligne_id ? [anneeInt, moisInt, ligne_id] : [anneeInt, moisInt]
    );

    const k = kpiRows[0] || {};
    const prev = Number(prevRows[0]?.heures_preventives || 0);
    const corr = Number(k.heures_correctives || 0);

    res.json({
      kpis: {
        disponibilite_moyenne: Number(k.disponibilite_moyenne || 0),
        disponibilite_globale: Number(k.disponibilite_moyenne || 0),
        heures_correctives: corr,
        heures_preventives: prev,
        heures_totales: corr + prev,
        nb_interventions: Number(k.nb_interventions || 0),
        nb_equipements: Number(k.nb_equipements || 0),
      },
      par_maintenancier: parMaint,
    });
  } catch (e) {
    console.error('dashboardSynthese:', e.message);
    res.status(500).json({
      error: 'Erreur serveur',
      detail: process.env.NODE_ENV !== 'production' ? e.message : undefined,
    });
  }
};

/**
 * Suivi équipements groupés par ligne + actions
 */
exports.suiviEquipementsParLigne = async (req, res) => {
  try {
    const { mois, annee, ligne_id } = req.query;
    if (!mois || !annee) return res.json([]);

    const params = [parseInt(annee, 10), parseInt(mois, 10)];
    let filter = '';
    if (ligne_id) {
      params.push(ligne_id);
      filter = ` AND e.ligne_id = $${params.length}`;
    }

    const { rows } = await db.query(
      `SELECT
         lp.code AS ligne_code,
         lp.nom AS ligne_nom,
         e.id AS equipement_id,
         e.nom AS equipement_nom,
         e.code_ref AS equipement_code,
         COALESCE(v.total_maintenance_corrective, 0) AS heures_correctives,
         COALESCE(v.nb_interventions, 0) AS nb_interventions,
         v.avg_disponibilite,
         v.remarques,
         sea.difficulte,
         sea.action,
         sea.responsable,
         sea.delai
       FROM equipements e
       LEFT JOIN ligne_production lp ON e.ligne_id = lp.id
       LEFT JOIN v_maintenance_equipement_suivi v
         ON v.equipement_id = e.id AND v.mois_annee = make_date($1, $2, 1)
       LEFT JOIN suivi_equipement_action sea
         ON sea.equipement_id = e.id AND sea.mois = make_date($1, $2, 1)
       WHERE e.actif = TRUE ${filter}
       ORDER BY lp.code NULLS LAST, e.nom`,
      params
    );

    const byLigne = {};
    for (const r of rows) {
      const code = r.ligne_code || 'Sans ligne';
      if (!byLigne[code]) {
        byLigne[code] = { ligne_code: code, ligne_nom: r.ligne_nom, equipements: [] };
      }
      byLigne[code].equipements.push(r);
    }
    res.json(Object.values(byLigne));
  } catch (e) {
    console.error('suiviEquipementsParLigne:', e.message);
    res.status(500).json({
      error: 'Erreur serveur',
      detail: process.env.NODE_ENV !== 'production' ? e.message : undefined,
    });
  }
};

exports.enregistrerSuiviAction = async (req, res) => {
  try {
    const { equipement_id, mois, annee, difficulte, action, responsable, delai } = req.body;
    if (!equipement_id || !mois || !annee) {
      return res.status(400).json({ error: 'equipement_id, mois, annee requis' });
    }
    const moisDate = `${annee}-${String(mois).padStart(2, '0')}-01`;

    const { rows } = await db.query(
      `INSERT INTO suivi_equipement_action
       (id, equipement_id, mois, difficulte, action, responsable, delai)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (equipement_id, mois) DO UPDATE SET
         difficulte = EXCLUDED.difficulte,
         action = EXCLUDED.action,
         responsable = EXCLUDED.responsable,
         delai = EXCLUDED.delai,
         modifie_le = NOW()
       RETURNING *`,
      [uuid(), equipement_id, moisDate, difficulte || null, action || null, responsable || null, delai || null]
    );
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Graphique: Évolution corrective + préventive par équipement
 */
exports.graphiqueEvolutionMaintenance = async (req, res) => {
  try {
    const { equipement_id, ligne_id, annee } = req.query;

    if (!annee) return res.json([]);

    const anneeInt = parseInt(annee, 10);

    // Format frontend attendu:
    // { mois: "YYYY-MM-01" (ou date), equipement_nom, heures_maintenance, nb_interventions }
    const params = [anneeInt];
    let query = `
      SELECT
        DATE_TRUNC('month', i.modifie_le)::DATE AS mois,
        e.id AS equipement_id,
        e.nom AS equipement_nom,
        e.code_ref AS equipement_code,
        lp.code AS ligne_code,
        SUM(i.duree_arret_effectif)::NUMERIC(12,2) AS heures_correctives,
        0::NUMERIC AS heures_preventives,
        COUNT(*) AS nb_interventions
      FROM intervention_quart i
      JOIN equipements e ON i.equipement_id = e.id
      LEFT JOIN ligne_production lp ON e.ligne_id = lp.id
      WHERE EXTRACT(YEAR FROM i.modifie_le) = $1
    `;

    if (ligne_id) {
      params.push(ligne_id);
      query += ` AND e.ligne_id = $${params.length}`;
    }

    if (equipement_id) {
      params.push(equipement_id);
      query += ` AND e.id = $${params.length}`;
    }

    query += `
      GROUP BY DATE_TRUNC('month', i.modifie_le), e.id, e.nom, e.code_ref, lp.code
      ORDER BY mois ASC
    `;

    const { rows } = await db.query(query, params);

    // Si aucun equipement_id fourni, on renvoie plusieurs séries; le frontend actuel ne gère qu'une série.
    // Pour rester compatible sans changer le frontend, on agrège en "toutes séries" si besoin :
    const { rows: prevSeries } = await db.query(
      `SELECT DATE_TRUNC('month', s.date_soumission)::DATE AS mois,
              COALESCE(SUM(vs.valeur_nombre),0) AS heures_preventives
       FROM soumissions s
       JOIN formulaires_types ft ON s.formulaire_type_id = ft.id
       JOIN valeurs_saisies vs ON vs.soumission_id = s.id
       JOIN champs_definitions cd ON vs.champ_def_id = cd.id
       LEFT JOIN equipements e ON s.equipement_id = e.id
       WHERE ft.module='MAINTENANCE' AND ft.code != 'PS-ME-MC-A'
         AND (cd.nom_champ ILIKE '%heure%' OR cd.unite ILIKE '%h%')
         AND EXTRACT(YEAR FROM s.date_soumission) = $1
         ${equipement_id ? 'AND e.id = $2' : ''}
       GROUP BY 1 ORDER BY 1`,
      equipement_id ? [anneeInt, equipement_id] : [anneeInt]
    );

    const prevMap = Object.fromEntries(
      prevSeries.map(p => [new Date(p.mois).toISOString().slice(0, 10), Number(p.heures_preventives)])
    );

    const enrich = (list) =>
      list.map(r => {
        const key = new Date(r.mois).toISOString().slice(0, 10);
        return {
          mois: r.mois,
          equipement_nom: r.equipement_nom || 'Tous équipements',
          heures_correctives: Number(r.heures_correctives || r.heures_maintenance || 0),
          heures_preventives: prevMap[key] || 0,
          heures_maintenance:
            Number(r.heures_correctives || r.heures_maintenance || 0) + (prevMap[key] || 0),
          nb_interventions: Number(r.nb_interventions || 0),
        };
      });

    if (!equipement_id) {
      const merged = new Map();
      for (const r of rows) {
        const key = new Date(r.mois).toISOString().slice(0, 10);
        if (!merged.has(key)) {
          merged.set(key, {
            mois: r.mois,
            equipement_nom: 'Tous équipements',
            heures_correctives: 0,
            nb_interventions: 0,
          });
        }
        const cur = merged.get(key);
        cur.heures_correctives += Number(r.heures_correctives || 0);
        cur.nb_interventions += Number(r.nb_interventions || 0);
      }
      return res.json(enrich(Array.from(merged.values()).sort((a, b) => new Date(a.mois) - new Date(b.mois))));
    }

    res.json(enrich(rows));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Données graphiques dashboard (toujours structurées, même vides)
 */
exports.dashboardGraphiques = async (req, res) => {
  try {
    const { mois, annee, ligne_id } = req.query;
    if (!annee) return res.json({ evolution: [], dispo_par_ligne: [], repartition: [], par_semaine: [] });

    const anneeInt = parseInt(annee, 10);
    const moisInt = mois ? parseInt(mois, 10) : null;
    const params = [anneeInt];
    let ligneFilter = '';
    if (ligne_id) {
      params.push(ligne_id);
      ligneFilter = ` AND ps.ligne_id = $${params.length}`;
    }

    const { rows: evolution } = await db.query(
      `SELECT DATE_TRUNC('month', i.modifie_le)::DATE AS mois,
              SUM(i.duree_arret_effectif)::NUMERIC(12,2) AS heures_correctives,
              COUNT(*)::int AS nb_interventions
       FROM intervention_quart i
       JOIN planning_quart pq ON i.planning_quart_id = pq.id
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE EXTRACT(YEAR FROM i.modifie_le) = $1 ${ligneFilter}
       GROUP BY 1 ORDER BY 1`,
      params
    );

    const dispoParams = [];
    let dispoWhere = 'WHERE 1=1';
    if (moisInt) {
      dispoParams.push(anneeInt, moisInt);
      dispoWhere += ` AND DATE_TRUNC('month', i.modifie_le) = make_date($1,$2,1)`;
    } else {
      dispoParams.push(anneeInt);
      dispoWhere += ` AND EXTRACT(YEAR FROM i.modifie_le) = $1`;
    }
    if (ligne_id) {
      dispoParams.push(ligne_id);
      dispoWhere += ` AND ps.ligne_id = $${dispoParams.length}`;
    }

    const { rows: dispo } = await db.query(
      `SELECT lp.code AS ligne, lp.nom AS ligne_nom,
              AVG(COALESCE(il.taux_disponibilite_calcule, i.taux_disponibilite_calcule)) AS taux
       FROM intervention_quart i
       JOIN planning_quart pq ON i.planning_quart_id = pq.id
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       JOIN ligne_production lp ON ps.ligne_id = lp.id
       LEFT JOIN intervention_ligne il ON il.planning_quart_id = pq.id
       ${dispoWhere}
       GROUP BY lp.code, lp.nom ORDER BY lp.code`,
      dispoParams
    );

    const kpiParams = moisInt ? [anneeInt, moisInt] : [anneeInt];
    let kpiSql = `
      SELECT COALESCE(SUM(i.duree_arret_effectif),0) AS corr
      FROM intervention_quart i
      JOIN planning_quart pq ON i.planning_quart_id = pq.id
      JOIN planning_jour pj ON pq.planning_jour_id = pj.id
      JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
      WHERE ${moisInt ? `DATE_TRUNC('month', i.modifie_le) = make_date($1,$2,1)` : `EXTRACT(YEAR FROM i.modifie_le) = $1`}
    `;
    if (ligne_id) {
      kpiParams.push(ligne_id);
      kpiSql += ` AND ps.ligne_id = $${kpiParams.length}`;
    }
    const { rows: corrKpi } = await db.query(kpiSql, kpiParams);

    const prevSql = `
      SELECT COALESCE(SUM(vs.valeur_nombre),0) AS prev
      FROM soumissions s
      JOIN formulaires_types ft ON s.formulaire_type_id = ft.id
      JOIN valeurs_saisies vs ON vs.soumission_id = s.id
      JOIN champs_definitions cd ON vs.champ_def_id = cd.id
      WHERE ft.module='MAINTENANCE' AND ft.code != 'PS-ME-MC-A'
        AND (cd.nom_champ ILIKE '%heure%' OR cd.unite ILIKE '%h%')
        AND s.statut IN ('SOUMIS','VALIDE')
        AND ${moisInt ? `DATE_TRUNC('month', s.date_soumission) = make_date($1,$2,1)` : `EXTRACT(YEAR FROM s.date_soumission) = $1`}
    `;
    const { rows: prevKpi } = await db.query(prevSql, kpiParams);

    const semParams = moisInt ? [anneeInt, moisInt] : [anneeInt];
    let semSql = `
      SELECT COALESCE(ps.semaine_index, 1) AS semaine,
             SUM(COALESCE(il.duree_arret_agregee,0)) AS heures
      FROM intervention_ligne il
      JOIN planning_quart pq ON il.planning_quart_id = pq.id
      JOIN planning_jour pj ON pq.planning_jour_id = pj.id
      JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
      WHERE ${moisInt ? `ps.mois = $2 AND ps.annee = $1` : `ps.annee = $1`}
    `;
    if (ligne_id) {
      semParams.push(ligne_id);
      semSql += ` AND ps.ligne_id = $${semParams.length}`;
    }
    semSql += ' GROUP BY ps.semaine_index ORDER BY semaine';
    const { rows: parSemaine } = await db.query(semSql, semParams);

    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const evolutionFull = [];
    for (let m = 1; m <= 12; m++) {
      const key = `${anneeInt}-${String(m).padStart(2, '0')}-01`;
      const found = evolution.find(
        e => new Date(e.mois).getMonth() + 1 === m
      );
      evolutionFull.push({
        mois: key,
        label: months[m - 1],
        heures_correctives: Number(found?.heures_correctives || 0),
        nb_interventions: Number(found?.nb_interventions || 0),
      });
    }

    res.json({
      evolution: evolutionFull,
      dispo_par_ligne: dispo.map(d => ({
        ligne: d.ligne,
        ligne_nom: d.ligne_nom,
        taux: Number(d.taux || 0),
      })),
      repartition: [
        { name: 'Corrective', value: Number(corrKpi[0]?.corr || 0), fill: '#dc2626' },
        { name: 'Préventive', value: Number(prevKpi[0]?.prev || 0), fill: '#4DB8A8' },
      ],
      par_semaine: parSemaine.map(s => ({
        semaine: `S${String(s.semaine).padStart(2, '0')}`,
        heures: Number(s.heures || 0),
      })),
    });
  } catch (e) {
    console.error('dashboardGraphiques:', e.message);
    res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
};

/**
 * Supprimer un créneau de quart planifié (admin)
 */
exports.supprimerPlanningQuart = async (req, res) => {
  try {
    const { planningQuartId } = req.params;
    const { rows } = await db.query(
      'DELETE FROM planning_quart WHERE id = $1 RETURNING id',
      [planningQuartId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Créneau introuvable' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour la ligne de production pour un quart (admin)
 */
exports.mettreAJourLigneQuart = async (req, res) => {
  try {
    const { planning_quart_id, ligne_id } = req.body;
    
    if (!planning_quart_id || !ligne_id) {
      return res.status(400).json({ error: 'planning_quart_id et ligne_id requis' });
    }

    // Récupérer la ligne_id actuelle du planning_semaine
    const { rows: ctx } = await db.query(
      `SELECT ps.ligne_id FROM planning_quart pq
       JOIN planning_jour pj ON pq.planning_jour_id = pj.id
       JOIN planning_semaine ps ON pj.planning_semaine_id = ps.id
       WHERE pq.id = $1`,
      [planning_quart_id]
    );

    if (!ctx.length) {
      return res.status(404).json({ error: 'Quart introuvable' });
    }

    // Mettre à jour intervention_ligne si elle existe
    await db.query(
      `UPDATE intervention_ligne 
       SET ligne_id = $1 
       WHERE planning_quart_id = $2`,
      [ligne_id, planning_quart_id]
    );

    res.json({ success: true, message: 'Ligne mise à jour' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ========================================
// UTILITAIRES
// ========================================

/**
 * Lister les lignes de production
 */
exports.listerLignes = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM ligne_production WHERE actif = TRUE ORDER BY code'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Lister les quarts
 */
exports.listerQuarts = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM quart_maintenance ORDER BY heure_debut'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Lister les maintenanciers (utilisateurs avec rôle Technicien)
 */
exports.listerMaintenanciers = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nom, u.prenom, u.email, r.nom AS role_nom
       FROM utilisateurs u 
       JOIN roles r ON u.role_id = r.id
       WHERE r.nom IN ('TECHNICIEN','RESP_MAINT','ADMIN') AND u.actif = TRUE
       ORDER BY u.nom, u.prenom`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Récupérer les semaines planifiées pour une ligne
 */
exports.listerSemainesPlanifiees = async (req, res) => {
  try {
    const { ligne_id, annee } = req.query;

    let query = 'SELECT * FROM planning_semaine WHERE 1=1';
    const params = [];

    if (ligne_id) {
      params.push(ligne_id);
      query += ` AND ligne_id = $${params.length}`;
    }
    if (annee) {
      params.push(parseInt(annee));
      query += ` AND annee = $${params.length}`;
    }

    query += ' ORDER BY date_debut_semaine DESC';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};