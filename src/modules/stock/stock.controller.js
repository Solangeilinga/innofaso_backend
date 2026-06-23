const { query, pool } = require('../../config/db');

// ── Lister pièces ─────────────────────────────────────────────────
exports.listerPieces = async (req, res, next) => {
  try {
    const { search, equipement_id, alerte } = req.query;
    const params = []; const clauses = ['pr.actif = TRUE'];
    if (search) { params.push(`%${search}%`); clauses.push(`(pr.designation ILIKE $${params.length} OR pr.reference ILIKE $${params.length})`); }
    if (equipement_id) { params.push(equipement_id); clauses.push(`pr.equipement_id = $${params.length}`); }
    if (alerte === 'true') clauses.push('pr.quantite_stock <= pr.seuil_alerte');

    const { rows } = await query(
      `SELECT pr.*, e.nom AS equipement_nom,
              CASE WHEN pr.quantite_stock <= pr.seuil_alerte THEN true ELSE false END AS en_alerte
       FROM pieces_rechange pr
       LEFT JOIN equipements e ON e.id = pr.equipement_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY pr.designation`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// ── Récupérer une pièce ───────────────────────────────────────────
exports.getPiece = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT pr.*, e.nom AS equipement_nom
       FROM pieces_rechange pr
       LEFT JOIN equipements e ON e.id = pr.equipement_id
       WHERE pr.id = $1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Pièce non trouvée' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── Créer pièce ───────────────────────────────────────────────────
exports.creerPiece = async (req, res, next) => {
  try {
    const { reference, designation, quantite_stock = 0, seuil_alerte = 5, unite = 'pièce', equipement_id } = req.body;
    if (!reference || !designation) return res.status(400).json({ message: 'Référence et désignation requises' });
    const { rows } = await query(
      `INSERT INTO pieces_rechange (reference, designation, quantite_stock, seuil_alerte, unite, equipement_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [reference, designation, quantite_stock, seuil_alerte, unite, equipement_id || null]
    );
    // Mouvement d'entrée initial si quantité > 0
    if (quantite_stock > 0) {
      await query(
        `INSERT INTO mouvements_stock (piece_id, utilisateur_id, type_mouvement, quantite, motif)
         VALUES ($1,$2,'ENTREE',$3,'Stock initial')`,
        [rows[0].id, req.user.id, quantite_stock]
      );
    }
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
};

// ── Modifier pièce ────────────────────────────────────────────────
exports.modifierPiece = async (req, res, next) => {
  try {
    const { reference, designation, seuil_alerte, unite, equipement_id } = req.body;
    const { rows } = await query(
      `UPDATE pieces_rechange SET
         reference=$1, designation=$2, seuil_alerte=$3, unite=$4, equipement_id=$5
       WHERE id=$6 RETURNING *`,
      [reference, designation, seuil_alerte, unite, equipement_id || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Pièce non trouvée' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── Supprimer (soft) ──────────────────────────────────────────────
exports.supprimerPiece = async (req, res, next) => {
  try {
    await query('UPDATE pieces_rechange SET actif=FALSE WHERE id=$1', [req.params.id]);
    res.json({ message: 'Pièce archivée' });
  } catch (err) { next(err); }
};

// ── Mouvements d'une pièce ────────────────────────────────────────
exports.getMouvements = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT ms.*, u.nom AS user_nom, u.prenom AS user_prenom
       FROM mouvements_stock ms
       LEFT JOIN utilisateurs u ON u.id = ms.utilisateur_id
       WHERE ms.piece_id = $1
       ORDER BY ms.date_mouvement DESC
       LIMIT 50`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

// ── Entrée stock ──────────────────────────────────────────────────
exports.entree = async (req, res, next) => {
  try {
    const { quantite, motif } = req.body;
    if (!quantite || quantite <= 0) return res.status(400).json({ message: 'Quantité invalide' });
    await query('UPDATE pieces_rechange SET quantite_stock = quantite_stock + $1 WHERE id = $2', [quantite, req.params.id]);
    await query(
      `INSERT INTO mouvements_stock (piece_id, utilisateur_id, type_mouvement, quantite, motif)
       VALUES ($1,$2,'ENTREE',$3,$4)`,
      [req.params.id, req.user.id, quantite, motif || null]
    );
    const { rows } = await query('SELECT * FROM pieces_rechange WHERE id=$1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── Sortie stock ──────────────────────────────────────────────────
exports.sortie = async (req, res, next) => {
  try {
    const { quantite, motif } = req.body;
    if (!quantite || quantite <= 0) return res.status(400).json({ message: 'Quantité invalide' });
    const { rows: current } = await query('SELECT quantite_stock FROM pieces_rechange WHERE id=$1', [req.params.id]);
    if (!current.length) return res.status(404).json({ message: 'Pièce non trouvée' });
    if (current[0].quantite_stock < quantite) {
      return res.status(400).json({ message: `Stock insuffisant (disponible: ${current[0].quantite_stock})` });
    }
    await query('UPDATE pieces_rechange SET quantite_stock = quantite_stock - $1 WHERE id = $2', [quantite, req.params.id]);
    await query(
      `INSERT INTO mouvements_stock (piece_id, utilisateur_id, type_mouvement, quantite, motif)
       VALUES ($1,$2,'SORTIE',$3,$4)`,
      [req.params.id, req.user.id, quantite, motif || null]
    );
    const { rows } = await query('SELECT * FROM pieces_rechange WHERE id=$1', [req.params.id]);
    // Vérifier alerte stock bas
    if (rows[0].quantite_stock <= rows[0].seuil_alerte) {
      const alertesService = require('../alertes/alertes.service');
      const { rows: resps } = await query(
        `SELECT u.id FROM utilisateurs u JOIN roles r ON r.id=u.role_id WHERE r.nom IN ('ADMIN','RESP_MAINT') AND u.actif=TRUE`
      );
      for (const r of resps) {
        await alertesService.creer({
          utilisateur_id: r.id,
          type_alerte: 'MAINTENANCE_PREVENTIVE',
          message: `⚠️ Stock bas : "${rows[0].designation}" (${rows[0].quantite_stock} ${rows[0].unite} restant${rows[0].quantite_stock > 1 ? 's' : ''}, seuil: ${rows[0].seuil_alerte})`,
        }).catch(() => {});
      }
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// ── Déduction automatique depuis soumission ──────────────────────
exports.deduireDepuisSoumission = async (soumissionId, utilisateurId) => {
  try {
    // Chercher les champs pièce_reference + piece_quantite dans la soumission
    const { rows: valeurs } = await query(
      `SELECT vs.valeur_texte, vs.valeur_nombre, cd.nom_champ
       FROM valeurs_saisies vs
       JOIN champs_definitions cd ON cd.id = vs.champ_def_id
       WHERE vs.soumission_id = $1`,
      [soumissionId]
    );

    // Regrouper par section pour trouver les paires (référence + quantité)
    const refChamps   = valeurs.filter(v => /piece.*ref|ref.*piece/i.test(v.nom_champ));
    const qtyChamps   = valeurs.filter(v => /piece.*quant|quant.*piece/i.test(v.nom_champ));

    for (const refV of refChamps) {
      if (!refV.valeur_texte) continue;
      // Trouver la quantité correspondante (même section/ordre proche)
      const qtyV = qtyChamps[0]; // simplification
      const qty = qtyV?.valeur_nombre || 1;

      // Chercher la pièce par référence
      const { rows: pieces } = await query(
        'SELECT id, quantite_stock FROM pieces_rechange WHERE reference ILIKE $1 AND actif=TRUE LIMIT 1',
        [refV.valeur_texte]
      );
      if (!pieces.length) continue;

      const piece = pieces[0];
      const deduit = Math.min(qty, piece.quantite_stock);
      if (deduit <= 0) continue;

      await query('UPDATE pieces_rechange SET quantite_stock = quantite_stock - $1 WHERE id=$2', [deduit, piece.id]);
      await query(
        `INSERT INTO mouvements_stock (piece_id, utilisateur_id, soumission_id, type_mouvement, quantite, motif)
         VALUES ($1,$2,$3,'SORTIE',$4,'Maintenance — soumission automatique')`,
        [piece.id, utilisateurId, soumissionId, deduit]
      );
    }
  } catch (err) {
    console.error('Erreur déduction stock:', err.message);
  }
};