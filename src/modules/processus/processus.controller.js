const { query } = require('../../config/db');
const { v4: uuid } = require('uuid');
const alertesService = require('../alertes/alertes.service');

const TACHE_FIELDS = `
  pt.*,
  ft.titre AS formulaire_titre, ft.code AS formulaire_code, ft.module AS formulaire_module,
  exec_u.nom AS executeur_nom, exec_u.prenom AS executeur_prenom,
  verif_u.nom AS verificateur_nom, verif_u.prenom AS verificateur_prenom,
  valid_u.nom AS validateur_nom, valid_u.prenom AS validateur_prenom,
  planif_u.nom AS planificateur_nom, planif_u.prenom AS planificateur_prenom,
  s.date_soumission, s.statut AS soumission_statut
`;

const TACHE_JOINS = `
  FROM processus_taches pt
  JOIN formulaires_types ft ON ft.id = pt.formulaire_id
  LEFT JOIN utilisateurs exec_u  ON exec_u.id  = pt.executeur_id
  LEFT JOIN utilisateurs verif_u ON verif_u.id = pt.verificateur_id
  LEFT JOIN utilisateurs valid_u ON valid_u.id = pt.validateur_id
  LEFT JOIN utilisateurs planif_u ON planif_u.id = pt.planificateur_id
  LEFT JOIN soumissions s ON s.id = pt.soumission_id
`;

const isGestionnaire = (role) => ['ADMIN','RESP_MAINT','RESP_PROD'].includes(role);

// ── Lister ────────────────────────────────────────────────────────
exports.lister = async (req, res, next) => {
  try {
    const { etape, statut, utilisateur_id } = req.query;
    const params = [];
    const clauses = [];

    if (etape) { params.push(etape.toUpperCase()); clauses.push(`pt.etape_courante = $${params.length}`); }

    if (statut === 'EN_COURS') {
      params.push('EN_ATTENTE', 'EN_COURS');
      clauses.push(`(pt.statut_execution = $${params.length-1} OR pt.statut_execution = $${params.length})`);
    } else if (statut === 'TERMINEE') {
      params.push('TERMINEE');
      clauses.push(`(pt.statut_execution = $${params.length} OR pt.statut_verification = $${params.length} OR pt.statut_validation = $${params.length})`);
    }

    if (utilisateur_id) {
      params.push(utilisateur_id);
      clauses.push(`(pt.executeur_id=$${params.length} OR pt.verificateur_id=$${params.length} OR pt.validateur_id=$${params.length} OR pt.planificateur_id=$${params.length})`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} ${where} ORDER BY pt.cree_le DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// ── Récupérer une tâche ───────────────────────────────────────────
exports.getUne = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} WHERE pt.id = $1`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Tâche non trouvée' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── Créer ─────────────────────────────────────────────────────────
exports.creer = async (req, res, next) => {
  try {
    const { formulaire_id, executeur_id, verificateur_id, validateur_id, planificateur_id } = req.body;
    if (!formulaire_id || !executeur_id || !verificateur_id || !validateur_id) {
      return res.status(400).json({ error: 'formulaire_id, executeur_id, verificateur_id, validateur_id requis' });
    }

    const id = uuid();
    await query(
      `INSERT INTO processus_taches (id, formulaire_id, executeur_id, verificateur_id, validateur_id, planificateur_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, formulaire_id, executeur_id, verificateur_id, validateur_id, planificateur_id || null]
    );

    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} WHERE pt.id = $1`, [id]
    );

    await alertesService.creer({
      utilisateur_id: executeur_id,
      type_alerte: 'VALIDATION',
      message: `📋 Nouvelle tâche assignée : "${rows[0]?.formulaire_titre}" — veuillez remplir le formulaire.`,
    }).catch(() => {});

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

// ── Assigner (modifier les personnes) ─────────────────────────────
exports.assigner = async (req, res, next) => {
  try {
    const { executeur_id, verificateur_id, validateur_id } = req.body;
    const sets = []; const params = [];

    if (executeur_id)   { params.push(executeur_id);   sets.push(`executeur_id = $${params.length}`); }
    if (verificateur_id){ params.push(verificateur_id); sets.push(`verificateur_id = $${params.length}`); }
    if (validateur_id)  { params.push(validateur_id);   sets.push(`validateur_id = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'Aucun champ à modifier' });

    sets.push('modifie_le = NOW()');
    params.push(req.params.id);
    await query(
      `UPDATE processus_taches SET ${sets.join(', ')} WHERE id = $${params.length}`, params
    );

    // Retourner la tâche complète avec les noms
    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} WHERE pt.id = $1`, [req.params.id]
    );

    res.json(rows[0] || { message: 'Assignation mise à jour' });
  } catch (err) { next(err); }
};

// ── Exécuter (marquer comme fait) ─────────────────────────────────
exports.executer = async (req, res, next) => {
  try {
    let { soumission_id } = req.body;
    const role = req.user.role;

    // Vérifier que la tâche existe
    const { rows: tacheRows } = await query(
      'SELECT * FROM processus_taches WHERE id = $1', [req.params.id]
    );
    if (!tacheRows.length) return res.status(404).json({ error: 'Tâche non trouvée' });

    // Vérifier le droit : soit l'exécuteur, soit un gestionnaire
    if (!isGestionnaire(role) && tacheRows[0].executeur_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul l\'exécuteur assigné peut marquer cette tâche' });
    }

    // Chercher automatiquement une soumission liée si non fournie
    if (!soumission_id) {
      const { rows: found } = await query(
        `SELECT s.id FROM soumissions s
         JOIN processus_taches pt ON pt.formulaire_id = s.formulaire_type_id
         WHERE pt.id = $1 AND s.statut IN ('SOUMIS','VALIDE')
         ORDER BY s.date_soumission DESC LIMIT 1`,
        [req.params.id]
      );
      if (found.length) soumission_id = found[0].id;
    }

    if (!soumission_id) {
      return res.status(400).json({ error: 'Aucune soumission trouvée. Veuillez d\'abord remplir le formulaire.' });
    }

    await query(
      `UPDATE processus_taches
       SET etape_courante = 'VERIFICATION',
           statut_execution = 'TERMINEE',
           statut_verification = 'EN_COURS',
           soumission_id = $1,
           modifie_le = NOW()
       WHERE id = $2`,
      [soumission_id, req.params.id]
    );

    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} WHERE pt.id = $1`, [req.params.id]
    );
    const tache = rows[0];

    await alertesService.creer({
      utilisateur_id: tache.verificateur_id,
      type_alerte: 'VALIDATION',
      message: `✅ Formulaire exécuté : "${tache.formulaire_titre}" — veuillez vérifier.`,
    }).catch(() => {});

    res.json(tache);
  } catch (err) { next(err); }
};

// ── Vérifier ──────────────────────────────────────────────────────
exports.verifier = async (req, res, next) => {
  try {
    const { commentaire } = req.body;
    const role = req.user.role;

    const { rows: tacheRows } = await query(
      'SELECT * FROM processus_taches WHERE id = $1', [req.params.id]
    );
    if (!tacheRows.length) return res.status(404).json({ error: 'Tâche non trouvée' });

    if (!isGestionnaire(role) && tacheRows[0].verificateur_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul le vérificateur assigné peut vérifier cette tâche' });
    }

    await query(
      `UPDATE processus_taches
       SET etape_courante = 'VALIDATION',
           statut_verification = 'TERMINEE',
           statut_validation = 'EN_COURS',
           commentaire_verification = COALESCE($1, commentaire_verification),
           modifie_le = NOW()
       WHERE id = $2`,
      [commentaire || null, req.params.id]
    );

    const { rows } = await query(
      `SELECT ${TACHE_FIELDS} ${TACHE_JOINS} WHERE pt.id = $1`, [req.params.id]
    );
    const tache = rows[0];

    await alertesService.creer({
      utilisateur_id: tache.validateur_id,
      type_alerte: 'VALIDATION',
      message: `🔍 Formulaire vérifié : "${tache.formulaire_titre}" — veuillez valider.`,
    }).catch(() => {});

    res.json(tache);
  } catch (err) { next(err); }
};

// ── Valider ───────────────────────────────────────────────────────
exports.valider = async (req, res, next) => {
  try {
    const { commentaire } = req.body;
    const role = req.user.role;

    const { rows: tacheRows } = await query(
      'SELECT * FROM processus_taches WHERE id = $1', [req.params.id]
    );
    if (!tacheRows.length) return res.status(404).json({ error: 'Tâche non trouvée' });

    if (!isGestionnaire(role) && tacheRows[0].validateur_id !== req.user.id) {
      return res.status(403).json({ error: 'Seul le validateur assigné peut valider cette tâche' });
    }

    await query(
      `UPDATE processus_taches
       SET etape_courante = 'VALIDATION',
           statut_validation = 'TERMINEE',
           commentaire_validation = COALESCE($1, commentaire_validation),
           modifie_le = NOW(),
           termine_le = NOW()
       WHERE id = $2`,
      [commentaire || null, req.params.id]
    );

    // Notifier l'exécuteur que c'est terminé
    await alertesService.creer({
      utilisateur_id: tacheRows[0].executeur_id,
      type_alerte: 'VALIDATION',
      message: `🎉 Tâche complètement validée !`,
    }).catch(() => {});

    res.json({ message: 'Tâche validée avec succès' });
  } catch (err) { next(err); }
};

// ── Compter ───────────────────────────────────────────────────────
exports.compterTaches = async (req, res, next) => {
  try {
    const userId = req.query.utilisateur_id || req.user.id;
    const role = req.user.role;

    let whereClause = '';
    const params = [];
    if (!isGestionnaire(role)) {
      params.push(userId);
      whereClause = `WHERE (pt.executeur_id=$1 OR pt.verificateur_id=$1 OR pt.validateur_id=$1)`;
    }

    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE pt.etape_courante='EXECUTION'    AND pt.statut_execution    IN ('EN_ATTENTE','EN_COURS')) AS execution_en_cours,
        COUNT(*) FILTER (WHERE pt.etape_courante='EXECUTION'    AND pt.statut_execution    = 'TERMINEE')                 AS execution_terminee,
        COUNT(*) FILTER (WHERE pt.etape_courante='VERIFICATION' AND pt.statut_verification IN ('EN_ATTENTE','EN_COURS')) AS verification_en_cours,
        COUNT(*) FILTER (WHERE pt.etape_courante='VERIFICATION' AND pt.statut_verification = 'TERMINEE')                 AS verification_terminee,
        COUNT(*) FILTER (WHERE pt.etape_courante='VALIDATION'   AND pt.statut_validation   IN ('EN_ATTENTE','EN_COURS')) AS validation_en_cours,
        COUNT(*) FILTER (WHERE pt.etape_courante='VALIDATION'   AND pt.statut_validation   = 'TERMINEE')                 AS validation_terminee
      FROM processus_taches pt
      ${whereClause}
    `, params);

    res.json(rows[0]);
  } catch (err) { next(err); }
};