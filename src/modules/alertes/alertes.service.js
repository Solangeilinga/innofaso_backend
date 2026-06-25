const { query } = require('../../config/db');

const getAll = async (utilisateurId, role, { statut, type_alerte, module, page = 1, limit = 20 }) => {
    const params = [];
    const clauses = [];

    if (module) {
        params.push(module.toUpperCase());
        clauses.push(`(
            a.soumission_id IS NULL
            OR EXISTS (
                SELECT 1 FROM soumissions s
                JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
                WHERE s.id = a.soumission_id AND ft.module = $${params.length}
            )
        )`);
    }

    // TECHNICIEN et OPERATEUR voient seulement leurs propres alertes
    if (!['ADMIN','RESP_MAINT','RESP_PROD'].includes(role)) {
        params.push(utilisateurId);
        clauses.push(`a.utilisateur_id = $${params.length}`);
    }

    if (statut)      { params.push(statut.toUpperCase());      clauses.push(`a.statut = $${params.length}`); }
    if (type_alerte) { params.push(type_alerte.toUpperCase()); clauses.push(`a.type_alerte = $${params.length}`); }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const countRes = await query(`SELECT COUNT(*) FROM alertes a ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const { rows } = await query(
        `SELECT a.*, e.nom AS equipement_nom,
                u.nom AS utilisateur_nom, u.prenom AS utilisateur_prenom,
                ft.module AS module
         FROM alertes a
         LEFT JOIN equipements e ON e.id = a.equipement_id
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         LEFT JOIN soumissions s ON s.id = a.soumission_id
         LEFT JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         ${where}
         ORDER BY a.date_creation DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { data: rows, total, page: parseInt(page), limit: parseInt(limit) };
};

const marquerLue = async (alerteId, utilisateurId) => {
    await query(`UPDATE alertes SET statut = 'LUE' WHERE id = $1 AND utilisateur_id = $2`,
        [alerteId, utilisateurId]);
};

const marquerTraitee = async (alerteId) => {
    await query(`UPDATE alertes SET statut = 'TRAITEE' WHERE id = $1`, [alerteId]);
};

const creer = async ({ soumission_id = null, equipement_id = null, utilisateur_id,
    type_alerte, message, lien = null }) => {
    const { rows } = await query(
        `INSERT INTO alertes (soumission_id, equipement_id, utilisateur_id, type_alerte, message, date_creation, statut, lien)
         VALUES ($1,$2,$3,$4,$5,NOW(),'NON_LUE',$6) RETURNING id`,
        [soumission_id, equipement_id, utilisateur_id, type_alerte, message, lien]
    );
    return rows[0];
};

const creerAlertePanneCritique = async (soumissionId, equipementId) => {
    const { rows: dest } = await query(
        `SELECT id FROM utilisateurs WHERE actif=TRUE
         AND role_id IN (SELECT id FROM roles WHERE nom IN ('ADMIN','RESP_MAINT'))`
    );
    const { rows: eq } = await query('SELECT nom FROM equipements WHERE id=$1', [equipementId]);
    const message = `🔴 Panne critique : ${eq[0]?.nom || equipementId}`;
    for (const d of dest) {
        await creer({ soumission_id: soumissionId, equipement_id: equipementId,
            utilisateur_id: d.id, type_alerte: 'PANNE_CRITIQUE', message });
    }
};

// ── Vérification formulaires non soumis basée sur les PLANNINGS ──────
// On alerte uniquement quand un formulaire assigné à un quart planifié
// n'a pas été soumis par le maintenancier concerné.
const verifierPlanningsNonCouverts = async (fenetre_heures = 2) => {
    // Récupérer tous les quarts passés dont au moins un formulaire assigné
    // n'a pas été soumis par le maintenancier (ou co-maintenancier)
    const { rows: quartsNonCouverts } = await query(`
        SELECT
            pq.id                  AS planning_quart_id,
            pq.maintenancier_id,
            pq.co_maintenancier_id,
            pj.date_jour,
            qm.nom                 AS quart_nom,
            qm.heure_debut,
            qm.heure_fin,
            lp.code                AS ligne_code,
            ft.id                  AS formulaire_type_id,
            ft.titre               AS formulaire_titre,
            ft.module
        FROM planning_quart pq
        JOIN planning_jour pj          ON pj.id  = pq.planning_jour_id
        JOIN planning_semaine ps        ON ps.id  = pj.planning_semaine_id
        JOIN ligne_production lp        ON lp.id  = ps.ligne_id
        JOIN quart_maintenance qm       ON qm.id  = pq.quart_id
        JOIN planning_quart_formulaires pqf ON pqf.planning_quart_id = pq.id
        JOIN formulaires_types ft       ON ft.id  = pqf.formulaire_id
        WHERE
            -- Le quart est terminé (date passée ou heure dépassée aujourd'hui)
            (
                pj.date_jour < CURRENT_DATE
                OR (
                    pj.date_jour = CURRENT_DATE
                    AND qm.heure_fin <= EXTRACT(HOUR FROM NOW())
                )
            )
            -- Pas de soumission validée par le maintenancier (ou co) pour ce formulaire ce jour-là
            AND NOT EXISTS (
                SELECT 1 FROM soumissions s
                WHERE s.formulaire_type_id = ft.id
                  AND s.utilisateur_id IN (
                      pq.maintenancier_id,
                      pq.co_maintenancier_id
                  )
                  AND s.statut = 'SOUMIS'
                  AND s.date_soumission::DATE = pj.date_jour
            )
            -- Uniquement les quarts des dernières 48h (éviter de re-alerter sur des anciens)
            AND pj.date_jour >= CURRENT_DATE - INTERVAL '2 days'
    `);

    for (const quart of quartsNonCouverts) {
        const destinataires = [quart.maintenancier_id, quart.co_maintenancier_id].filter(Boolean);
        const dateF = new Date(quart.date_jour).toLocaleDateString('fr-FR');
        const msg = `⏰ Formulaire non soumis : "${quart.formulaire_titre}" — ${quart.quart_nom} Ligne ${quart.ligne_code} (${dateF})`;

        for (const uid of destinataires) {
            // Anti-doublon : pas deux alertes identiques dans la fenêtre (défaut 2h)
            const { rows: ex } = await query(`
                SELECT id FROM alertes
                WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
                  AND utilisateur_id = $1
                  AND message ILIKE $2
                  AND date_creation >= NOW() - INTERVAL '${fenetre_heures} hours'
            `, [uid, `%${quart.formulaire_titre}%${quart.ligne_code}%`]);

            if (ex.length === 0) {
                await creer({
                    utilisateur_id: uid,
                    type_alerte: 'FORMULAIRE_EN_RETARD',
                    message: msg,
                });
            }
        }

        // Alerter aussi les responsables (ADMIN, RESP_MAINT/RESP_PROD selon module)
        const { rows: resps } = await query(`
            SELECT u.id FROM utilisateurs u
            JOIN roles r ON r.id = u.role_id
            WHERE u.actif = TRUE AND (
                r.nom = 'ADMIN'
                OR (r.nom = 'RESP_MAINT' AND $1 = 'MAINTENANCE')
                OR (r.nom = 'RESP_PROD'  AND $1 = 'PRODUCTION')
            )
        `, [quart.module]);

        const msgResp = `🚨 Non couvert : "${quart.formulaire_titre}" — ${quart.quart_nom} Ligne ${quart.ligne_code} (${dateF})`;
        for (const r of resps) {
            const { rows: ex } = await query(`
                SELECT id FROM alertes
                WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
                  AND utilisateur_id = $1
                  AND message ILIKE $2
                  AND date_creation >= NOW() - INTERVAL '${fenetre_heures} hours'
            `, [r.id, `%${quart.formulaire_titre}%${quart.ligne_code}%`]);
            if (ex.length === 0) {
                await creer({ utilisateur_id: r.id, type_alerte: 'FORMULAIRE_EN_RETARD', message: msgResp });
            }
        }
    }

    return quartsNonCouverts.length;
};

// Fermer les alertes planning quand le formulaire est soumis depuis un quart
const fermerAlertesPlanningQuart = async (formulaireTypeId, utilisateurId, dateJour) => {
    const { rows: ft } = await query('SELECT titre FROM formulaires_types WHERE id = $1', [formulaireTypeId]);
    if (!ft.length) return;
    const dateStr = new Date(dateJour || Date.now()).toLocaleDateString('fr-FR');
    await query(`
        UPDATE alertes SET statut = 'TRAITEE'
        WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
          AND statut IN ('NON_LUE', 'LUE')
          AND utilisateur_id = $1
          AND message ILIKE $2
    `, [utilisateurId, `%${ft[0].titre}%`]);
};

// Alias conservé pour rétrocompatibilité (fermeture depuis soumissions.service)
const fermerAlertesFormulaire = fermerAlertesPlanningQuart;

const verifierStocksBas = async () => {
    const { rows: bas } = await query(
        `SELECT pr.id, pr.designation, pr.quantite_stock, pr.seuil_alerte, e.nom AS equipement_nom
         FROM pieces_rechange pr
         LEFT JOIN equipements e ON e.id = pr.equipement_id
         WHERE pr.actif = TRUE AND pr.quantite_stock <= pr.seuil_alerte`
    );
    const { rows: resp } = await query(
        `SELECT id FROM utilisateurs WHERE actif=TRUE
         AND role_id IN (SELECT id FROM roles WHERE nom IN ('ADMIN','RESP_MAINT'))`
    );
    for (const p of bas) {
        for (const r of resp) {
            const { rows: ex } = await query(
                `SELECT id FROM alertes WHERE type_alerte='STOCK_BAS'
                 AND utilisateur_id=$1 AND message ILIKE $2 AND date_creation >= CURRENT_DATE`,
                [r.id, `%${p.designation}%`]
            );
            if (ex.length === 0) {
                await creer({
                    utilisateur_id: r.id, type_alerte: 'STOCK_BAS',
                    message: `📦 Stock bas : "${p.designation}" — ${p.quantite_stock} unité(s) / seuil : ${p.seuil_alerte}${p.equipement_nom ? ` (${p.equipement_nom})` : ''}`,
                });
            }
        }
    }
    return bas.length;
};

const creerAlerteNouvellesoumission = async (soumissionId, formulaireModule) => {
    const rolesList = formulaireModule === 'MAINTENANCE'
        ? ['ADMIN','RESP_MAINT'] : ['ADMIN','RESP_PROD'];
    const { rows: [soum] } = await query(
        `SELECT ft.titre, u.nom, u.prenom FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u ON u.id = s.utilisateur_id
         WHERE s.id = $1`, [soumissionId]
    );
    const { rows: dest } = await query(
        `SELECT id FROM utilisateurs WHERE actif=TRUE
         AND role_id IN (SELECT id FROM roles WHERE nom = ANY($1))`,
        [rolesList]
    );
    for (const d of dest) {
        await creer({
            soumission_id: soumissionId, utilisateur_id: d.id,
            type_alerte: 'FORMULAIRE_EN_RETARD',
            message: `📋 Nouvelle soumission à valider : "${soum?.titre}" par ${soum?.prenom} ${soum?.nom}`,
        });
    }
};

// ── Fermeture auto quand formulaire soumis ────────────────────────────
const fermerAlertesFormulaire = async (formulaireTypeId) => {
    const { rows: ft } = await query(
        'SELECT titre FROM formulaires_types WHERE id = $1', [formulaireTypeId]
    );
    if (!ft.length) return;
    await query(`
        UPDATE alertes SET statut = 'TRAITEE'
        WHERE type_alerte = 'FORMULAIRE_EN_RETARD'
          AND statut IN ('NON_LUE', 'LUE')
          AND message ILIKE $1
    `, [`%${ft[0].titre}%`]);
};

// ── Alerte assignation planning (technicien) ──────────────────────────
const creerAlerteAssignationPlanning = async (technicierId, ligneCode, dateJour, quartNom) => {
    if (!technicierId) return;
    const dateF = new Date(dateJour).toLocaleDateString('fr-FR');
    // Éviter les doublons
    const { rows: ex } = await query(
        `SELECT id FROM alertes
         WHERE type_alerte='MAINTENANCE_PREVENTIVE'
           AND utilisateur_id=$1
           AND message ILIKE $2
           AND date_creation >= NOW() - INTERVAL '1 hour'`,
        [technicierId, `%${ligneCode}%${quartNom}%${dateF}%`]
    );
    if (ex.length > 0) return;
    await creer({
        utilisateur_id: technicierId,
        type_alerte: 'MAINTENANCE_PREVENTIVE',
        message: `🔧 Vous avez été assigné — Ligne ${ligneCode}, ${quartNom}, le ${dateF}`,
    });
};

module.exports = {
    getAll, marquerLue, marquerTraitee, creer,
    creerAlertePanneCritique, creerAlerteNouvellesoumission,
    verifierPlanningsNonCouverts,
    verifierStocksBas, fermerAlertesFormulaire, fermerAlertesPlanningQuart,
    creerAlerteAssignationPlanning,
};