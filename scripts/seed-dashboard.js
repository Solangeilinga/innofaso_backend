require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');
const { v4: uuid } = require('uuid');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const CAUSES = [
  'Usure pièce mécanique', 'Défaillance moteur', 'Fuite hydraulique',
  'Problème électrique', 'Surchauffe', 'Désalignement courroie',
  'Capteur défectueux', 'Obstruction filtre', 'Lubrification insuffisante',
  'Cassure support', 'Corrosion', 'Erreur opérateur',
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Nettoyage des données existantes ──────────────────────────
    await client.query('DELETE FROM processus_taches');
    await client.query('DELETE FROM planning_quart_formulaires');
    await client.query('DELETE FROM intervention_quart');
    await client.query('DELETE FROM intervention_ligne');
    await client.query('DELETE FROM maintenance_corrective');
    await client.query('DELETE FROM maintenance_corrective_formulaires');
    await client.query('DELETE FROM soumissions');
    await client.query('DELETE FROM suivi_equipement_action');
    await client.query('DELETE FROM planning_autre');
    await client.query('DELETE FROM planning_quart');
    await client.query('DELETE FROM planning_jour');
    await client.query('DELETE FROM planning_semaine');
    console.log('Nettoyage terminé');

    // ── Récupérer les lignes existantes ──────────────────────────
    const lignes = (await client.query('SELECT id, code, nom FROM ligne_production ORDER BY code')).rows;
    if (lignes.length === 0) {
      console.log('Création de lignes...');
      for (const l of [{ code: 'L1', nom: 'Ligne 1 — Emballage' }, { code: 'L2', nom: 'Ligne 2 — Conditionnement' }, { code: 'L3', nom: 'Ligne 3 — Assemblage' }]) {
        lignes.push((await client.query(
          `INSERT INTO ligne_production (id, code, nom, actif) VALUES ($1,$2,$3,true) RETURNING *`,
          [uuid(), l.code, l.nom]
        )).rows[0]);
      }
    }
    console.log(`${lignes.length} lignes`);

    // ── Récupérer les quarts ──────────────────────────────────────
    const quarts = (await client.query('SELECT id, nom FROM quart_maintenance')).rows;
    console.log(`${quarts.length} quarts`);

    // ── Récupérer / créer des utilisateurs (maintenanciers) ──────
    let users = (await client.query('SELECT id, nom, email FROM utilisateurs ORDER BY nom')).rows;
    if (users.length < 4) {
      const newUsers = [
        { nom: 'Diallo',   prenom: 'Mamadou', email: 'mamadou.diallo@innofaso.com', role: 'TECHNICIEN' },
        { nom: 'Traoré',   prenom: 'Fatoumata', email: 'fatou.traore@innofaso.com',  role: 'TECHNICIEN' },
        { nom: 'Koné',     prenom: 'Drissa', email: 'drissa.kone@innofaso.com',     role: 'TECHNICIEN' },
        { nom: 'Sissoko',  prenom: 'Aminata', email: 'aminata.sissoko@innofaso.com', role: 'TECHNICIEN' },
      ];
      for (const u of newUsers) {
        const role = (await client.query("SELECT id FROM roles WHERE nom = $1", [u.role])).rows[0];
        if (role) {
          const created = (await client.query(
            `INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, role_id, actif)
             VALUES ($1,$2,$3,$4,'\$2a\$10\$dummy', $5, true) RETURNING id, nom, prenom, email`,
            [uuid(), u.nom, u.prenom, u.email, role.id]
          )).rows[0];
          users.push(created);
        }
      }
    }
    console.log(`${users.length} utilisateurs`);

    // ── Récupérer l'admin ─────────────────────────────────────────
    const admin = users.find(u => u.email === 'admin@innofaso.com') || users[0];
    console.log('Admin:', admin.email);

    // ── Créer des équipements ────────────────────────────────────
    let equipements = (await client.query('SELECT id, nom, code_ref, ligne_production FROM equipements WHERE actif = true')).rows;
    if (equipements.length < 8) {
      const eqData = [
        { nom: 'Cond. Simple',    code: 'COND-01', ligne: 'L1' },
        { nom: 'Fondoir à huile', code: 'FOND-01', ligne: 'L1' },
        { nom: 'Compresseur Air', code: 'COMP-01', ligne: 'L2' },
        { nom: 'Groupe électro',  code: 'GEG-01',  ligne: 'L2' },
        { nom: 'Bande transporteuse', code: 'BT-01', ligne: 'L3' },
        { nom: 'Mélangeur',       code: 'MEL-01',  ligne: 'L3' },
        { nom: 'Centrifugeuse',   code: 'CENT-01', ligne: 'L1' },
        { nom: 'Pompe vide',      code: 'POMP-01', ligne: 'L2' },
      ];
      for (const eq of eqData) {
        const ligne = lignes.find(l => l.code === eq.ligne);
        if (ligne) {
          const existing = (await client.query(
            `SELECT * FROM equipements WHERE code_ref = $1`, [eq.code]
          )).rows[0];
          if (existing) {
            equipements.push(existing);
          } else {
            const created = (await client.query(
              `INSERT INTO equipements (id, nom, code_ref, ligne_production, actif)
               VALUES ($1,$2,$3,$4,true) RETURNING *`,
              [uuid(), eq.nom, eq.code, eq.ligne]
            )).rows[0];
            equipements.push(created);
          }
        }
      }
    }
    console.log(`${equipements.length} équipements`);

    // ── Récupérer les formulaires MAINTENANCE ─────────────────────
    const formulaires = (await client.query(
      `SELECT id, code, titre FROM formulaires_types WHERE module = 'MAINTENANCE'`
    )).rows;
    console.log(`${formulaires.length} formulaires`);

    // ── Créer des semaines, jours, quarts ─────────────────────────
    const annee = 2026;
    const mois = 6; // Juin
    const joursMois = new Date(annee, mois, 0).getDate();

    const allQuarts = []; // { id, jour, quart_id, jour_date }
    const allSemaines = [];

    for (let d = 1; d <= joursMois; d++) {
      const date = new Date(annee, mois - 1, d);
      const jourSem = ['LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI','DIMANCHE'][date.getDay() === 0 ? 6 : date.getDay() - 1];
      const semaineNum = Math.min(Math.ceil(d / 7), 4);
      const semaineIndex = semaineNum;

      for (const ligne of lignes) {
        let sem = allSemaines.find(s => s.ligne_id === ligne.id && s.semaine_num === semaineNum);
        if (!sem) {
          sem = (await client.query(
            `SELECT * FROM planning_semaine WHERE ligne_id = $1 AND annee = $2 AND mois = $3 AND semaine_index = $4`,
            [ligne.id, annee, mois, semaineIndex]
          )).rows[0];
        }
        if (!sem) {
          const lundi = new Date(annee, mois - 1, (semaineNum - 1) * 7 + 1);
          const dimanche = new Date(annee, mois - 1, Math.min(semaineNum * 7, joursMois));
          sem = (await client.query(
            `INSERT INTO planning_semaine (id, ligne_id, date_debut_semaine, date_fin_semaine, semaine_num, annee, mois, semaine_index, admin_id, statut)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLIE') RETURNING *`,
            [uuid(), ligne.id, lundi, dimanche, semaineNum, annee, mois, semaineIndex, admin.id]
          )).rows[0];
          allSemaines.push(sem);
        }

        // Jour
        let jour = (await client.query(
          `SELECT id FROM planning_jour WHERE planning_semaine_id = $1 AND date_jour = $2`,
          [sem.id, date]
        )).rows[0];
        if (!jour) {
          jour = (await client.query(
            `INSERT INTO planning_jour (id, planning_semaine_id, date_jour, jour_semaine)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [uuid(), sem.id, date, jourSem]
          )).rows[0];
        }

        // Quarts (A, B, C) avec maintenanciers
        for (const quart of quarts) {
          const maintenancier = users[Math.floor(Math.random() * users.length)];
          let pq = (await client.query(
            `SELECT id FROM planning_quart WHERE planning_jour_id = $1 AND quart_id = $2`,
            [jour.id, quart.id]
          )).rows[0];
          if (!pq) {
            pq = (await client.query(
              `INSERT INTO planning_quart (id, planning_jour_id, quart_id, maintenancier_id)
               VALUES ($1,$2,$3,$4) RETURNING id`,
              [uuid(), jour.id, quart.id, maintenancier.id]
            )).rows[0];
          }
          allQuarts.push({ id: pq.id, jour: d, quart_id: quart.id, jour_date: date, maintenancier_id: maintenancier.id, ligne_id: ligne.id });
        }
      }
    }
    console.log(`${allSemaines.length} semaines, ${allQuarts.length} quarts créés`);

    // ── Créer intervention_ligne (préventif) ─────────────────────
    let nbIL = 0;
    for (const pq of allQuarts) {
      // 70% des quarts ont une intervention
      if (Math.random() > 0.3) {
        const dureeArret = Math.round(Math.random() * 4 * 10) / 10; // 0-4h
        const tempsCouv = 8;
        const txDispo = Math.round(((tempsCouv - dureeArret) / tempsCouv) * 100 * 10) / 10;
        const cause = CAUSES[Math.floor(Math.random() * CAUSES.length)];
        await client.query(
          `INSERT INTO intervention_ligne (id, planning_quart_id, ligne_id, duree_arret_agregee, temps_couverture,
             taux_disponibilite_calcule, taux_cible, cause_indisponibilite, observations, commentaire)
           VALUES ($1,$2,$3,$4,$5,$6,90,$7,$8,$9)`,
          [uuid(), pq.id, pq.ligne_id, dureeArret, tempsCouv, txDispo,
           cause,
           `Observation aléatoire #${Math.floor(Math.random() * 100)}`,
           txDispo < 90 ? `Commentaire: Taux ${txDispo}% sous cible — action requise.` : null
          ]
        );
        nbIL++;
      }
    }
    console.log(`${nbIL} intervention_ligne créés`);

    // ── Créer intervention_quart (préventif par équipement) ──────
    let nbIQ = 0;
    for (const pq of allQuarts) {
      // Associer les équipements de cette ligne
      const eqs = equipements.filter(e => e.ligne_production === lignes.find(l => l.id === pq.ligne_id)?.code);
      if (eqs.length > 0 && Math.random() > 0.4) {
        const eq = eqs[Math.floor(Math.random() * eqs.length)];
        const duree = Math.round(Math.random() * 3 * 10) / 10;
        const cause = CAUSES[Math.floor(Math.random() * CAUSES.length)];
        await client.query(
          `INSERT INTO intervention_quart (id, planning_quart_id, equipement_id, duree_arret_effectif, cause_indisponibilite, observations, temps_couverture, taux_disponibilite_calcule, taux_cible, statut)
           VALUES ($1,$2,$3,$4,$5,$6,8,$7,90,'TERMINE')`,
          [uuid(), pq.id, eq.id, duree, cause,
           `Observation équipement ${eq.code_ref}`,
           Math.round((1 - duree / 8) * 100 * 10) / 10]
        );
        nbIQ++;
      }
    }
    console.log(`${nbIQ} intervention_quart créés`);

    // ── Créer soumissions (préventif) ─────────────────────────────
    let nbSoumissions = 0;
    for (let i = 0; i < 60; i++) {
      const eq = equipements[Math.floor(Math.random() * equipements.length)];
      const usr = users[Math.floor(Math.random() * users.length)];
      const fmt = formulaires[Math.floor(Math.random() * formulaires.length)];
      const jour = Math.floor(Math.random() * joursMois) + 1;
      const date = new Date(annee, mois - 1, jour, Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60));
      const statuses = ['VALIDE', 'VALIDE', 'VALIDE', 'SOUMIS', 'REJETE'];
      const statut = statuses[Math.floor(Math.random() * statuses.length)];
      try {
        await client.query(
          `INSERT INTO soumissions (id, formulaire_type_id, utilisateur_id, equipement_id, statut, date_soumission, date_modification)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuid(), fmt.id, usr.id, eq.id, statut, date, statut === 'VALIDE' ? date : null]
        );
        nbSoumissions++;
      } catch (e) {
        // skip duplicate
      }
    }
    console.log(`${nbSoumissions} soumissions créées`);

    // ── Créer maintenance_corrective (correctif) ─────────────────
    let nbCorrectifs = 0;
    for (let i = 0; i < 25; i++) {
      const eq = equipements[Math.floor(Math.random() * equipements.length)];
      const sem = allSemaines[Math.floor(Math.random() * allSemaines.length)];
      const dureeArret = Math.round((Math.random() * 6 + 0.5) * 10) / 10; // 0.5-6.5h
      const dureeMaint = Math.round((Math.random() * 3 + 0.5) * 10) / 10; // 0.5-3.5h
      const dateInterv = new Date(annee, mois - 1, Math.floor(Math.random() * joursMois) + 1);
      const cause = CAUSES[Math.floor(Math.random() * CAUSES.length)];
      await client.query(
        `INSERT INTO maintenance_corrective (id, planning_semaine_id, equipement_id, executeur_id, duree_arret, duree_maintenance, cause, observations, statut, date_intervention, temps_couverture, taux_cible, commentaire)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'termine',$9,8,90,$10)`,
        [uuid(), sem.id, eq.id, users[Math.floor(Math.random() * users.length)].id,
         dureeArret, dureeMaint, cause, `Correction suite à ${cause.toLowerCase()}`,
         dateInterv, dureeArret > 3 ? `Intervention critique: ${dureeArret}h d'arrêt` : null
        ]
      );
      nbCorrectifs++;
    }
    console.log(`${nbCorrectifs} maintenance_corrective créés`);

    // ── Créer suivi_equipement_action ─────────────────────────────
    let nbActions = 0;
    for (const eq of equipements.slice(0, 5)) {
      const moisDate = new Date(annee, mois - 1, 1);
      const actions = [
        'Nettoyage complet prévu', 'Remplacement courroie', 'Vidange huile',
        'Calibration capteurs', 'Inspection générale',
      ];
      await client.query(
        `INSERT INTO suivi_equipement_action (id, equipement_id, mois, difficulte, action, responsable, delai)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [uuid(), eq.id, moisDate,
         Math.random() > 0.5 ? 'Élevée' : 'Moyenne',
         actions[Math.floor(Math.random() * actions.length)],
         users[Math.floor(Math.random() * users.length)].prenom + ' ' + users[Math.floor(Math.random() * users.length)].nom,
         new Date(annee, mois, Math.floor(Math.random() * 15) + 1)]
      );
      nbActions++;
    }
    console.log(`${nbActions} suivi_equipement_action créés`);

    await client.query('COMMIT');
    console.log('\n✅ Seed terminé avec succès !');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur seed:', e.message);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
