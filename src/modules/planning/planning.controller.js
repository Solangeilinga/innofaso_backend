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
           'verificateur_id', pq.verificateur_id,
           'verificateur_nom', u3.prenom || ' ' || u3.nom,
           'validateur_id', pq.validateur_id,
           'validateur_nom', u4.prenom || ' ' || u4.nom,
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
        LEFT JOIN utilisateurs u3 ON pq.verificateur_id   = u3.id
        LEFT JOIN utilisateurs u4 ON pq.validateur_id     = u4.id
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
    const { maintenancier_id, co_maintenancier_id, verificateur_id, validateur_id } = req.body;

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
           SET maintenancier_id = $1, co_maintenancier_id = $2,
               verificateur_id = $3, validateur_id = $4
           WHERE planning_jour_id = $5 AND quart_id = $6
           RETURNING *`,
          [maintenancier_id, co_maintenancier_id || null, verificateur_id || null, validateur_id || null, planningJourId, quartId]
        )
      : await db.query(
          `INSERT INTO planning_quart 
           (id, planning_jour_id, quart_id, maintenancier_id, co_maintenancier_id, verificateur_id, validateur_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [uuid(), planningJourId, quartId, maintenancier_id, co_maintenancier_id || null, verificateur_id || null, validateur_id || null]
        );

    // ── Alertes d'assignation ──────────────────────────────────────
    try {
      const alertesService = require('../alertes/alertes.service');

      // Récupérer les infos du quart et de la date
      const { rows: infos } = await db.query(
        `SELECT pj.date_jour, qm.nom AS quart_nom, qm.heure_debut, qm.heure_fin,
                lp.code AS ligne_code
         FROM planning_jour pj
         JOIN planning_semaine ps ON ps.id = pj.planning_semaine_id
         JOIN ligne_production lp ON lp.id = ps.ligne_id
         JOIN quart_maintenance qm ON qm.id = $1
         WHERE pj.id = $2`,
        [quartId, planningJourId]
      );

      if (infos.length > 0) {
        const { date_jour, quart_nom, heure_debut, heure_fin, ligne_code } = infos[0];
        const dateF = new Date(date_jour).toLocaleDateString('fr-FR');
        const msg = `🔧 Vous avez été assigné au ${quart_nom} (${heure_debut}h-${heure_fin}h) — Ligne ${ligne_code} le ${dateF}`;

        // Notifier le maintenancier principal
        await alertesService.creer({
          utilisateur_id: maintenancier_id,
          type_alerte:    'MAINTENANCE_PREVENTIVE',
          message:        msg,
        });

        // Notifier le co-maintenancier si présent
        if (co_maintenancier_id) {
          await alertesService.creer({
            utilisateur_id: co_maintenancier_id,
            type_alerte:    'MAINTENANCE_PREVENTIVE',
            message:        msg,
          });
        }

        // Notifier le vérificateur si présent
        if (verificateur_id) {
          await alertesService.creer({
            utilisateur_id: verificateur_id,
            type_alerte:    'MAINTENANCE_PREVENTIVE',
            message:        `🔍 Vous êtes vérificateur | ` + msg,
          });
        }

        // Notifier le validateur si présent
        if (validateur_id) {
          await alertesService.creer({
            utilisateur_id: validateur_id,
            type_alerte:    'MAINTENANCE_PREVENTIVE',
            message:        `✅ Vous êtes validateur | ` + msg,
          });
        }
      }
    } catch (alertErr) {
      console.error('Erreur alerte assignation:', alertErr.message);
    }

    // Synchroniser les processus_taches existants avec les nouvelles assignations
    try {
      const pqId = result.rows[0].id;
      await db.query(
        `UPDATE processus_taches
         SET executeur_id = $1, verificateur_id = $2, validateur_id = $3
         WHERE planning_quart_id = $4`,
        [maintenancier_id, verificateur_id || null, validateur_id || null, pqId]
      );
    } catch (_) {}

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
            'verificateur_id', pq.verificateur_id,
            'verificateur_nom', u3.prenom || ' ' || u3.nom,
            'validateur_id', pq.validateur_id,
            'validateur_nom', u4.prenom || ' ' || u4.nom,
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
        LEFT JOIN utilisateurs u3 ON pq.verificateur_id   = u3.id
        LEFT JOIN utilisateurs u4 ON pq.validateur_id     = u4.id
        WHERE pq.planning_jour_id = pj.id) AS quarts_assignes
       FROM planning_jour pj
       WHERE pj.planning_semaine_id = $1
       ORDER BY pj.date_jour`,
      [planning.id]
    );

    // Enrichir avec les formulaires tagués (table créée par migration 016).
    // Si la migration n'a pas encore été exécutée, on continue sans erreur.
    try {
      const quartIds = jours
        .flatMap(j => (j.quarts_assignes || []).filter(Boolean).map(q => q.id));
      if (quartIds.length > 0) {
        const { rows: fRows } = await db.query(
          `SELECT pqf.planning_quart_id, ft.id, ft.code, ft.titre, ft.module
           FROM planning_quart_formulaires pqf
           JOIN formulaires_types ft ON ft.id = pqf.formulaire_id
           WHERE pqf.planning_quart_id = ANY($1::uuid[])
           ORDER BY ft.titre`,
          [quartIds]
        );
        const byQuart = {};
        for (const r of fRows) {
          if (!byQuart[r.planning_quart_id]) byQuart[r.planning_quart_id] = [];
          byQuart[r.planning_quart_id].push({ id: r.id, code: r.code, titre: r.titre, module: r.module });
        }
        for (const jour of jours) {
          if (Array.isArray(jour.quarts_assignes)) {
            jour.quarts_assignes = jour.quarts_assignes.map(q =>
              q ? { ...q, formulaires: byQuart[q.id] || [] } : q
            );
          }
        }
      }
    } catch (_) {
      // table absente (migration non encore exécutée) — formulaires = []
    }

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
      commentaire,
      temps_couverture = 8.0,
      taux_cible,
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
             commentaire = COALESCE($4, commentaire),
             temps_couverture = COALESCE($5, temps_couverture),
             taux_cible = COALESCE($6, taux_cible),
             modifie_le = NOW()
         WHERE planning_quart_id = $7
         RETURNING *`,
        [duree_arret_agregee, cause_indisponibilite, observations, commentaire, temps_couverture, taux_cible, planning_quart_id]
      ));
    } else {
      ({ rows } = await db.query(
        `INSERT INTO intervention_ligne
         (id, planning_quart_id, ligne_id, duree_arret_agregee,
          cause_indisponibilite, observations, commentaire, temps_couverture, taux_cible)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          uuid(),
          planning_quart_id,
          ctx[0].ligne_id,
          duree_arret_agregee || 0,
          cause_indisponibilite || null,
          observations || null,
          commentaire || null,
          temps_couverture,
          taux_cible || null,
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

    // Filtre ligne optionnel
    const ligneJoin  = ligne_id ? `JOIN equipements eq ON eq.id = s.equipement_id` : '';
    const ligneWhere = ligne_id ? `AND eq.ligne_production = $3` : '';
    const baseParams = ligne_id ? [anneeInt, moisInt, ligne_id] : [anneeInt, moisInt];

    // ── KPIs depuis soumissions maintenance ────────────────────────
    const { rows: kpiRows } = await db.query(
      `SELECT
         COUNT(DISTINCT s.id)           AS nb_soumissions,
         COUNT(DISTINCT s.equipement_id) AS nb_equipements,
         COUNT(DISTINCT s.utilisateur_id) AS nb_techniciens,
         COUNT(DISTINCT CASE WHEN s.statut = 'VALIDE'  THEN s.id END) AS nb_valides,
         COUNT(DISTINCT CASE WHEN s.statut = 'REJETE'  THEN s.id END) AS nb_rejetes,
         COUNT(DISTINCT CASE WHEN s.statut = 'SOUMIS'  THEN s.id END) AS nb_en_attente
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR  FROM s.date_soumission) = $1
         AND EXTRACT(MONTH FROM s.date_soumission) = $2
         ${ligneWhere}`,
      baseParams
    );

    // ── Heures correctives (champs durée dans les soumissions correctives) ─
    const { rows: corrRows } = await db.query(
      `SELECT COALESCE(SUM(vs.valeur_nombre), 0) AS heures_correctives
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       JOIN valeurs_saisies vs   ON vs.soumission_id = s.id
       JOIN champs_definitions cd ON cd.id = vs.champ_def_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND (cd.nom_champ ILIKE '%durée%' OR cd.nom_champ ILIKE '%heure%' OR cd.nom_champ ILIKE '%temps%')
         AND vs.valeur_nombre IS NOT NULL
         AND EXTRACT(YEAR  FROM s.date_soumission) = $1
         AND EXTRACT(MONTH FROM s.date_soumission) = $2
         ${ligneWhere}`,
      baseParams
    );

    // ── Par technicien ─────────────────────────────────────────────
    const { rows: parTech } = await db.query(
      `SELECT
         u.prenom || ' ' || u.nom AS maintenancier_nom,
         COUNT(DISTINCT s.id)     AS nb_interventions,
         COUNT(DISTINCT s.equipement_id) AS nb_equipements,
         COUNT(DISTINCT CASE WHEN s.statut = 'VALIDE' THEN s.id END) AS nb_valides
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       JOIN utilisateurs u       ON u.id = s.utilisateur_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR  FROM s.date_soumission) = $1
         AND EXTRACT(MONTH FROM s.date_soumission) = $2
         ${ligneWhere}
       GROUP BY u.id, u.prenom, u.nom
       ORDER BY nb_interventions DESC`,
      baseParams
    );

    // ── Par formulaire ─────────────────────────────────────────────
    const { rows: parFormulaire } = await db.query(
      `SELECT
         ft.code, ft.titre,
         COUNT(s.id) AS nb,
         COUNT(CASE WHEN s.statut = 'VALIDE' THEN 1 END) AS nb_valides
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR  FROM s.date_soumission) = $1
         AND EXTRACT(MONTH FROM s.date_soumission) = $2
         ${ligneWhere}
       GROUP BY ft.id, ft.code, ft.titre
       ORDER BY nb DESC
       LIMIT 10`,
      baseParams
    );

    const k = kpiRows[0] || {};
    const total    = Number(k.nb_soumissions || 0);
    const valides  = Number(k.nb_valides || 0);
    const tauxValid = total > 0 ? Math.round((valides / total) * 100) : 0;

    res.json({
      kpis: {
        nb_interventions:      total,
        nb_equipements:        Number(k.nb_equipements || 0),
        nb_techniciens:        Number(k.nb_techniciens || 0),
        nb_valides:            valides,
        nb_rejetes:            Number(k.nb_rejetes || 0),
        nb_en_attente:         Number(k.nb_en_attente || 0),
        taux_validation:       tauxValid,
        heures_correctives:    Number(corrRows[0]?.heures_correctives || 0),
        disponibilite_moyenne: tauxValid,
      },
      par_maintenancier: parTech,
      par_formulaire:    parFormulaire,
    });
  } catch (e) {
    console.error('dashboardSynthese:', e.message);
    res.status(500).json({ error: 'Erreur serveur', detail: e.message });
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
      filter = ` AND e.ligne_production = $${params.length}`;
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
       LEFT JOIN ligne_production lp ON lp.code = e.ligne_production
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
      LEFT JOIN ligne_production lp ON lp.code = e.ligne_production
      WHERE EXTRACT(YEAR FROM i.modifie_le) = $1
    `;

    if (ligne_id) {
      params.push(ligne_id);
      query += ` AND e.ligne_production = $${params.length}`;
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
    if (!annee) return res.json({ evolution: [], dispo_par_ligne: [], repartition: [], par_semaine: [], par_formulaire: [] });

    const anneeInt = parseInt(annee, 10);
    const moisInt  = mois ? parseInt(mois, 10) : null;

    const ligneJoin  = ligne_id ? `JOIN equipements eq ON eq.id = s.equipement_id` : '';
    const ligneWhere = ligne_id ? `AND eq.ligne_production = $2` : '';
    const baseParams = ligne_id ? [anneeInt, ligne_id] : [anneeInt];

    // ── Evolution mensuelle (soumissions par mois sur l'année) ─────
    const { rows: evolution } = await db.query(
      `SELECT
         EXTRACT(MONTH FROM s.date_soumission)::int AS mois_num,
         COUNT(s.id)                                AS nb_soumissions,
         COUNT(CASE WHEN s.statut = 'VALIDE' THEN 1 END) AS nb_valides,
         COUNT(CASE WHEN s.statut = 'REJETE' THEN 1 END) AS nb_rejetes
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR FROM s.date_soumission) = $1
         ${ligneWhere}
       GROUP BY mois_num ORDER BY mois_num`,
      baseParams
    );

    // ── Répartition par type de formulaire ─────────────────────────
    const repartParams = moisInt
      ? (ligne_id ? [anneeInt, moisInt, ligne_id] : [anneeInt, moisInt])
      : baseParams;
    const repartWhere = moisInt
      ? `AND EXTRACT(MONTH FROM s.date_soumission) = $${ligne_id ? 3 : 2}`
      : '';

    const { rows: repartition } = await db.query(
      `SELECT ft.code AS name, ft.titre AS fullname, COUNT(s.id)::int AS value
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       ${ligneJoin}
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR FROM s.date_soumission) = $1
         ${repartWhere}
         ${ligne_id && !moisInt ? ligneWhere : (ligne_id && moisInt ? `AND eq.ligne_production = $3` : '')}
       GROUP BY ft.id, ft.code, ft.titre
       ORDER BY value DESC LIMIT 8`,
      repartParams
    );

    // ── Par équipement (top 8) ─────────────────────────────────────
    const { rows: parEquip } = await db.query(
      `SELECT e.nom AS equipement, COUNT(s.id)::int AS nb
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       JOIN equipements e ON e.id = s.equipement_id
       WHERE ft.module = 'MAINTENANCE'
         AND EXTRACT(YEAR FROM s.date_soumission) = $1
       GROUP BY e.id, e.nom ORDER BY nb DESC LIMIT 8`,
      [anneeInt]
    );

    // ── Construire l'évolution sur 12 mois ─────────────────────────
    const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const evolutionFull = Array.from({ length: 12 }, (_, i) => {
      const found = evolution.find(e => e.mois_num === i + 1);
      return {
        mois:           `${anneeInt}-${String(i+1).padStart(2,'0')}-01`,
        label:          months[i],
        nb_soumissions: Number(found?.nb_soumissions || 0),
        nb_valides:     Number(found?.nb_valides || 0),
        nb_rejetes:     Number(found?.nb_rejetes || 0),
        heures_correctives: 0,
        nb_interventions: Number(found?.nb_soumissions || 0),
      };
    });

    const COLORS = ['#4DB8A8','#1d4ed8','#f59e0b','#8b5cf6','#ef4444','#10b981','#f97316','#6366f1'];

    res.json({
      evolution:      evolutionFull,
      dispo_par_ligne: [],
      repartition:    repartition.map((r, i) => ({
        name:  r.name,
        label: r.fullname?.slice(0, 30),
        value: r.value,
        fill:  COLORS[i % COLORS.length],
      })),
      par_semaine:    [],
      par_equipement: parEquip,
    });
  } catch (e) {
    console.error('dashboardGraphiques:', e.message);
    res.status(500).json({ error: 'Erreur serveur', detail: e.message });
  }
};

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
// FORMULAIRES — Tagage sur planning_quart
// ========================================

/**
 * Lister tous les formulaires disponibles pour le tagage
 */
exports.listerFormulairesDisponibles = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, code, titre, module
       FROM formulaires_types
       WHERE actif = TRUE
       ORDER BY module, titre`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Taguer ou détaguer un formulaire sur un quart (toggle)
 */
exports.toggleFormulaireQuart = async (req, res) => {
  try {
    const { planning_quart_id, formulaire_id } = req.body;
    if (!planning_quart_id || !formulaire_id) {
      return res.status(400).json({ error: 'planning_quart_id et formulaire_id requis' });
    }

    const { rows: existing } = await db.query(
      `SELECT id FROM planning_quart_formulaires
       WHERE planning_quart_id = $1 AND formulaire_id = $2`,
      [planning_quart_id, formulaire_id]
    );

    if (existing.length) {
      // Supprimer d'abord la tâche processus (FK) puis le lien formulaire
      await db.query('DELETE FROM processus_taches WHERE planning_quart_formulaire_id = $1', [existing[0].id]);
      await db.query('DELETE FROM planning_quart_formulaires WHERE id = $1', [existing[0].id]);
      return res.json({ action: 'removed' });
    }

    const { rows } = await db.query(
      `INSERT INTO planning_quart_formulaires (id, planning_quart_id, formulaire_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [uuid(), planning_quart_id, formulaire_id]
    );

    // Auto‑création de la tâche processus si le quart a ses 3 acteurs
    try {
      const { rows: assignees } = await db.query(
        `SELECT maintenancier_id, verificateur_id, validateur_id
         FROM planning_quart WHERE id = $1`,
        [planning_quart_id]
      );
      const a = assignees[0];
      if (a && a.maintenancier_id && a.verificateur_id && a.validateur_id) {
        await db.query(
          `INSERT INTO processus_taches
           (id, formulaire_id, planning_quart_id, planning_quart_formulaire_id,
            executeur_id, verificateur_id, validateur_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuid(), formulaire_id, planning_quart_id, rows[0].id,
           a.maintenancier_id, a.verificateur_id, a.validateur_id]
        );
      }
    } catch (_) {}

    res.json({ action: 'added', ...rows[0] });
  } catch (e) {
    if (e.code === '42P01') {
      return res.status(503).json({ error: 'Migration 016 non encore exécutée sur ce serveur' });
    }
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Obtenir les formulaires tagués d'un quart
 */
exports.getFormulairesQuart = async (req, res) => {
  try {
    const { planningQuartId } = req.params;
    const { rows } = await db.query(
      `SELECT ft.id, ft.code, ft.titre, ft.module
       FROM planning_quart_formulaires pqf
       JOIN formulaires_types ft ON ft.id = pqf.formulaire_id
       WHERE pqf.planning_quart_id = $1
       ORDER BY ft.titre`,
      [planningQuartId]
    );
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
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

// ========================================
// SIGNALEMENTS DE PANNES
// ========================================

exports.creerSignalementPanne = async (req, res) => {
  try {
    const { signale_par_id, assigne_a_id, observation } = req.body;
    if (!signale_par_id || !assigne_a_id) {
      return res.status(400).json({ error: 'signale_par_id et assigne_a_id requis' });
    }
    const { rows } = await db.query(
      `INSERT INTO signalements_pannes (id, signale_par_id, assigne_a_id, observation)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [uuid(), signale_par_id, assigne_a_id, observation || null]
    );
    try {
      const alertesService = require('../alertes/alertes.service');
      await alertesService.creer({
        utilisateur_id: assigne_a_id,
        type_alerte:    'MAINTENANCE_CORRECTIVE',
        message:        `⚠️ Panne signalée nécessitant votre planification corrective.`,
        lien:           '/plannification',
      });
    } catch (_) {}
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.listerSignalements = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT sp.*,
        jsonb_build_object('id', s.id, 'nom', s.nom, 'prenom', s.prenom) AS signaleur,
        jsonb_build_object('id', a.id, 'nom', a.nom, 'prenom', a.prenom) AS assigne
       FROM signalements_pannes sp
       LEFT JOIN utilisateurs s ON s.id = sp.signale_par_id
       LEFT JOIN utilisateurs a ON a.id = sp.assigne_a_id
       ORDER BY sp.cree_le DESC`
    );
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ========================================
// MAINTENANCE CORRECTIVE
// ========================================

exports.obtenirCorrectifSemaine = async (req, res) => {
  try {
    const { planning_semaine_id } = req.params;
    if (!planning_semaine_id) return res.status(400).json({ error: 'planning_semaine_id requis' });

    const { rows } = await db.query(
      `SELECT mc.*,
        jsonb_build_object('id', eq.id, 'nom', eq.nom, 'code_ref', eq.code_ref, 'ligne', eq.ligne_production) AS equipement,
        jsonb_build_object('id', ex.id, 'nom', ex.nom, 'prenom', ex.prenom) AS executeur,
        jsonb_build_object('id', co.id, 'nom', co.nom, 'prenom', co.prenom) AS co_executeur,
        jsonb_build_object('id', vf.id, 'nom', vf.nom, 'prenom', vf.prenom) AS verificateur,
        jsonb_build_object('id', vl.id, 'nom', vl.nom, 'prenom', vl.prenom) AS validateur
       FROM maintenance_corrective mc
       LEFT JOIN equipements  eq ON eq.id = mc.equipement_id
       LEFT JOIN utilisateurs ex ON ex.id = mc.executeur_id
       LEFT JOIN utilisateurs co ON co.id = mc.co_executeur_id
       LEFT JOIN utilisateurs vf ON vf.id = mc.verificateur_id
       LEFT JOIN utilisateurs vl ON vl.id = mc.validateur_id
       WHERE mc.planning_semaine_id = $1
       ORDER BY mc.cree_le`,
      [planning_semaine_id]
    );
    for (const row of rows) {
      try {
        const { rows: forms } = await db.query(
          `SELECT ft.id, ft.code, ft.titre
           FROM maintenance_corrective_formulaires mcf
           JOIN formulaires_types ft ON ft.id = mcf.formulaire_id
           WHERE mcf.maintenance_corrective_id = $1`,
          [row.id]
        );
        row.formulaires = forms;
      } catch { row.formulaires = []; }
    }
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.sauvegarderCorrectif = async (req, res) => {
  try {
    const {
      planning_semaine_id, equipement_id, equipement_libre, date_intervention,
      heure_intervention, temps_couverture, taux_cible, commentaire,
      executeur_id, co_executeur_id, verificateur_id, validateur_id,
      signalement_panne_id, duree_arret, duree_maintenance, cause, observations,
    } = req.body;

    if (!planning_semaine_id) {
      return res.status(400).json({ error: 'planning_semaine_id requis' });
    }

    // Fix __libre__ UUID bug
    const eqId = (equipement_id && equipement_id !== '__libre__') ? equipement_id : null;

    const { rows: existing } = await db.query(
      'SELECT id FROM maintenance_corrective WHERE planning_semaine_id = $1',
      [planning_semaine_id]
    );

    let result;
    if (existing.length) {
      ({ rows: result } = await db.query(
        `UPDATE maintenance_corrective
         SET equipement_id = $1, equipement_libre = $2, date_intervention = $3,
             heure_intervention = $4, temps_couverture = $5, taux_cible = $6, commentaire = $7,
             executeur_id = $8, co_executeur_id = $9,
             verificateur_id = $10, validateur_id = $11,
             signalement_panne_id = $12,
             duree_arret = $13, duree_maintenance = $14,
             cause = $15, observations = $16,
             modifie_le = NOW()
         WHERE planning_semaine_id = $17
         RETURNING *`,
        [eqId, equipement_libre || null, date_intervention || null,
         heure_intervention || null, temps_couverture || 8, taux_cible || 90, commentaire || null,
         executeur_id, co_executeur_id || null, verificateur_id || null, validateur_id || null,
         signalement_panne_id || null,
         duree_arret || 0, duree_maintenance || 0,
         cause || null, observations || null,
         planning_semaine_id]
      ));
    } else {
      ({ rows: result } = await db.query(
        `INSERT INTO maintenance_corrective
         (id, planning_semaine_id, equipement_id, equipement_libre, date_intervention,
          heure_intervention, temps_couverture, taux_cible, commentaire,
          executeur_id, co_executeur_id, verificateur_id, validateur_id,
          signalement_panne_id, duree_arret, duree_maintenance, cause, observations)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [uuid(), planning_semaine_id, eqId, equipement_libre || null, date_intervention || null,
         heure_intervention || null, temps_couverture || 8, taux_cible || 90, commentaire || null,
         executeur_id, co_executeur_id || null, verificateur_id || null, validateur_id || null,
         signalement_panne_id || null, duree_arret || 0, duree_maintenance || 0,
         cause || null, observations || null]
      ));
    }

    // ── Synchroniser processus_taches ──────────────────────────────────
    try {
      const mcId = result[0].id;
      const { rows: forms } = await db.query(
        'SELECT formulaire_id FROM maintenance_corrective_formulaires WHERE maintenance_corrective_id = $1',
        [mcId]
      );
      const a = result[0];
      if (a && a.executeur_id && a.verificateur_id && a.validateur_id && forms.length > 0) {
        for (const f of forms) {
          const { rows: existing } = await db.query(
            'SELECT id FROM processus_taches WHERE maintenance_corrective_id = $1 AND formulaire_id = $2',
            [mcId, f.formulaire_id]
          );
          if (!existing.length) {
            await db.query(
              `INSERT INTO processus_taches
               (id, formulaire_id, executeur_id, verificateur_id, validateur_id, maintenance_corrective_id)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [uuid(), f.formulaire_id, a.executeur_id, a.verificateur_id, a.validateur_id, mcId]
            );
          }
        }
      }
    } catch (_) {}

    res.json(result[0]);
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ error: 'Migration 020 non exécutée' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.toggleFormulaireCorrectif = async (req, res) => {
  try {
    const { maintenance_corrective_id, formulaire_id } = req.body;
    if (!maintenance_corrective_id || !formulaire_id) {
      return res.status(400).json({ error: 'IDs requis' });
    }
    const { rows: existing } = await db.query(
      'SELECT id FROM maintenance_corrective_formulaires WHERE maintenance_corrective_id = $1 AND formulaire_id = $2',
      [maintenance_corrective_id, formulaire_id]
    );
    if (existing.length) {
      await db.query('DELETE FROM maintenance_corrective_formulaires WHERE id = $1', [existing[0].id]);
      await db.query(
        'DELETE FROM processus_taches WHERE maintenance_corrective_id = $1 AND formulaire_id = $2',
        [maintenance_corrective_id, formulaire_id]
      );
    } else {
      await db.query(
        'INSERT INTO maintenance_corrective_formulaires (id, maintenance_corrective_id, formulaire_id) VALUES ($1,$2,$3)',
        [uuid(), maintenance_corrective_id, formulaire_id]
      );
      try {
        const { rows: mc } = await db.query(
          'SELECT executeur_id, verificateur_id, validateur_id FROM maintenance_corrective WHERE id = $1',
          [maintenance_corrective_id]
        );
        const a = mc[0];
        if (a && a.executeur_id && a.verificateur_id && a.validateur_id) {
          await db.query(
            `INSERT INTO processus_taches
             (id, formulaire_id, executeur_id, verificateur_id, validateur_id, maintenance_corrective_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuid(), formulaire_id, a.executeur_id, a.verificateur_id, a.validateur_id, maintenance_corrective_id]
          );
        }
      } catch (_) {}
    }
    res.json({ success: true });
  } catch (e) {
    if (e.code === '42P01') return res.json({ success: true });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Historique maintenance corrective (lecture seule)
 */
exports.listerHistoriqueCorrectif = async (req, res) => {
  try {
    const { ligne_id, mois, annee } = req.query;
    const params = [];
    let query = `
      SELECT mc.id, mc.duree_arret, mc.duree_maintenance, mc.cause, mc.observations,
             mc.date_intervention, mc.statut, mc.cree_le,
             ps.semaine_index, ps.date_debut_semaine, ps.date_fin_semaine, ps.annee,
             lp.code AS ligne_code, lp.nom AS ligne_nom,
             eq.nom AS equipement_nom, eq.code_ref AS equipement_code,
             mc.equipement_libre,
             jsonb_build_object('id', ex.id, 'nom', ex.nom, 'prenom', ex.prenom) AS executeur,
             jsonb_build_object('id', co.id, 'nom', co.nom, 'prenom', co.prenom) AS co_executeur,
             jsonb_build_object('id', vf.id, 'nom', vf.nom, 'prenom', vf.prenom) AS verificateur,
             jsonb_build_object('id', vl.id, 'nom', vl.nom, 'prenom', vl.prenom) AS validateur,
             (SELECT COUNT(*) FROM maintenance_corrective_formulaires mcf WHERE mcf.maintenance_corrective_id = mc.id) AS nb_formulaires
      FROM maintenance_corrective mc
      JOIN planning_semaine ps ON ps.id = mc.planning_semaine_id
      JOIN ligne_production lp ON lp.id = ps.ligne_id
      LEFT JOIN equipements eq ON eq.id = mc.equipement_id
      LEFT JOIN utilisateurs ex ON ex.id = mc.executeur_id
      LEFT JOIN utilisateurs co ON co.id = mc.co_executeur_id
      LEFT JOIN utilisateurs vf ON vf.id = mc.verificateur_id
      LEFT JOIN utilisateurs vl ON vl.id = mc.validateur_id
      WHERE 1=1
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
      ORDER BY ps.annee DESC, ps.mois DESC, ps.semaine_index DESC, mc.cree_le DESC
      LIMIT 50
    `;

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

/**
 * Obtenir ou créer un planning_semaine à partir d'une date (pour corrective)
 */
exports.obtenirSemaineParDate = async (req, res) => {
  try {
    const { date, ligne_id } = req.query;
    if (!date || !ligne_id) {
      return res.status(400).json({ error: 'date et ligne_id requis' });
    }

    const dateObj = new Date(date);
    const annee = dateObj.getFullYear();
    const mois = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    const semaineIndex = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;

    let { rows: existing } = await db.query(
      'SELECT * FROM planning_semaine WHERE ligne_id=$1 AND annee=$2 AND mois=$3 AND semaine_index=$4',
      [ligne_id, annee, mois, semaineIndex]
    );

    if (existing.length) {
      return res.json({ planning_semaine: existing[0], semaine_index: semaineIndex });
    }

    const adminId = req.user.id;
    const planning = await ensurePlanningSemaine(db, {
      ligneId: ligne_id,
      annee,
      mois,
      semaineIndex,
      adminId,
    });

    res.json({ planning_semaine: planning, semaine_index: semaineIndex });
  } catch (e) {
    console.error('obtenirSemaineParDate:', e.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ========================================
// PLANNING AUTRE
// ========================================

exports.creerPlanningAutre = async (req, res) => {
  try {
    const { date_planif, heure_planif, executeur_id, verificateur_id, validateur_id, formulaire_id } = req.body;
    if (!date_planif || !executeur_id || !formulaire_id) {
      return res.status(400).json({ error: 'date_planif, executeur_id et formulaire_id requis' });
    }
    const { rows } = await db.query(
      `INSERT INTO planning_autre (id, date_planif, heure_planif, executeur_id, verificateur_id, validateur_id, formulaire_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [uuid(), date_planif, heure_planif || null, executeur_id, verificateur_id || null, validateur_id || null, formulaire_id]
    );

    // Sync processus_taches
    try {
      const r = rows[0];
      if (r.executeur_id && r.verificateur_id && r.validateur_id) {
        const { rows: exist } = await db.query(
          'SELECT id FROM processus_taches WHERE planning_autre_id = $1',
          [r.id]
        );
        if (!exist.length) {
          await db.query(
            `INSERT INTO processus_taches (id, formulaire_id, executeur_id, verificateur_id, validateur_id, planning_autre_id, date_debut)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [uuid(), r.formulaire_id, r.executeur_id, r.verificateur_id, r.validateur_id, r.id, r.date_planif]
          );
        }
      }
    } catch (_) {}

    // Alerte
    try {
      const alertesService = require('../alertes/alertes.service');
      const { rows: u } = await db.query(
        'SELECT prenom, nom FROM utilisateurs WHERE id=$1', [executeur_id]
      );
      await alertesService.creer({
        utilisateur_id: executeur_id,
        type_alerte: 'MAINTENANCE_AUTRE',
        message: `Nouvelle tâche planifiée le ${date_planif}${heure_planif ? ' à ' + heure_planif.slice(0,5) : ''}`,
      });
    } catch (_) {}
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '42P01') return res.status(503).json({ error: 'Migration 027 non exécutée' });
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.modifierPlanningAutre = async (req, res) => {
  try {
    const { id } = req.params;
    const { date_planif, heure_planif, executeur_id, verificateur_id, validateur_id, formulaire_id } = req.body;
    const { rows } = await db.query(
      `UPDATE planning_autre
       SET date_planif = COALESCE($1, date_planif),
           heure_planif = COALESCE($2, heure_planif),
           executeur_id = COALESCE($3, executeur_id),
           verificateur_id = COALESCE($4, verificateur_id),
           validateur_id = COALESCE($5, validateur_id),
           formulaire_id = COALESCE($6, formulaire_id),
           modifie_le = NOW()
       WHERE id = $7 RETURNING *`,
      [date_planif, heure_planif, executeur_id, verificateur_id, validateur_id, formulaire_id, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Planning non trouvé' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.listerPlanningAutre = async (req, res) => {
  try {
    const { date_debut, date_fin, executeur_id } = req.query;
    const params = [];
    let query = `
      SELECT pa.*,
        jsonb_build_object('id', ex.id, 'nom', ex.nom, 'prenom', ex.prenom) AS executeur,
        jsonb_build_object('id', vf.id, 'nom', vf.nom, 'prenom', vf.prenom) AS verificateur,
        jsonb_build_object('id', vl.id, 'nom', vl.nom, 'prenom', vl.prenom) AS validateur,
        jsonb_build_object('id', ft.id, 'titre', ft.titre, 'code', ft.code) AS formulaire
      FROM planning_autre pa
      LEFT JOIN utilisateurs ex ON ex.id = pa.executeur_id
      LEFT JOIN utilisateurs vf ON vf.id = pa.verificateur_id
      LEFT JOIN utilisateurs vl ON vl.id = pa.validateur_id
      JOIN formulaires_types ft ON ft.id = pa.formulaire_id
      WHERE 1=1
    `;
    if (date_debut) { params.push(date_debut); query += ` AND pa.date_planif >= $${params.length}`; }
    if (date_fin)   { params.push(date_fin);   query += ` AND pa.date_planif <= $${params.length}`; }
    if (executeur_id) { params.push(executeur_id); query += ` AND pa.executeur_id = $${params.length}`; }
    query += ' ORDER BY pa.date_planif DESC, pa.cree_le DESC';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.supprimerPlanningAutre = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM processus_taches WHERE planning_autre_id = $1', [id]);
    const { rows } = await db.query('DELETE FROM planning_autre WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Planning non trouvé' });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.listerHistoriqueAutre = async (req, res) => {
  try {
    const { mois, annee } = req.query;
    const params = [];
    let query = `
      SELECT pa.*,
        jsonb_build_object('id', ex.id, 'nom', ex.nom, 'prenom', ex.prenom) AS executeur,
        jsonb_build_object('id', vf.id, 'nom', vf.nom, 'prenom', vf.prenom) AS verificateur,
        jsonb_build_object('id', vl.id, 'nom', vl.nom, 'prenom', vl.prenom) AS validateur,
        jsonb_build_object('id', ft.id, 'titre', ft.titre, 'code', ft.code) AS formulaire
      FROM planning_autre pa
      LEFT JOIN utilisateurs ex ON ex.id = pa.executeur_id
      LEFT JOIN utilisateurs vf ON vf.id = pa.verificateur_id
      LEFT JOIN utilisateurs vl ON vl.id = pa.validateur_id
      JOIN formulaires_types ft ON ft.id = pa.formulaire_id
      WHERE 1=1
    `;
    if (mois) {
      params.push(parseInt(mois, 10));
      query += ` AND EXTRACT(MONTH FROM pa.date_planif) = $${params.length}`;
    }
    if (annee) {
      params.push(parseInt(annee, 10));
      query += ` AND EXTRACT(YEAR FROM pa.date_planif) = $${params.length}`;
    }
    query += ' ORDER BY pa.date_planif DESC, pa.cree_le DESC LIMIT 50';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (e) {
    if (e.code === '42P01') return res.json([]);
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.listerEquipementsEtLignes = async (req, res) => {
  try {
    const [eqRows, ligRows] = await Promise.all([
      db.query("SELECT id, nom, code_ref, 'equipement' AS type FROM equipements WHERE actif = TRUE ORDER BY nom"),
      db.query("SELECT id, code AS nom, code AS code_ref, 'ligne' AS type FROM ligne_production WHERE actif = TRUE ORDER BY code"),
    ]);
    res.json([...eqRows.rows, ...ligRows.rows]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};