const { v4: uuid } = require('uuid');
const { pool } = require('../config/db');
const db = { query: (...a) => pool.query(...a), getClient: () => pool.connect() };

const FORM_CODE_CORRECTIVE = 'PS-ME-MC-A';

const CHAMP_MAP = {
  'date intervention': 'date',
  quart: 'quart',
  'ligne de production': 'ligne',
  équipement: 'equipement',
  equipement: 'equipement',
  "durée d'arrêt effectif (heures)": 'duree',
  "duree d'arret effectif (heures)": 'duree',
  "cause d'indisponibilité": 'cause',
  "cause d'indisponibilite": 'cause',
  observations: 'observations',
};

function parseValeur(v) {
  if (v.valeur_date) return v.valeur_date;
  if (v.valeur_nombre != null) return v.valeur_nombre;
  if (v.valeur_texte) return v.valeur_texte;
  return null;
}

function semaineIndexFromDate(d) {
  const day = d.getDate();
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function weekRange(annee, mois, semaineIndex) {
  const lastDay = new Date(annee, mois, 0).getDate();
  const starts = [1, 8, 15, 22];
  const start = starts[semaineIndex - 1];
  const end = semaineIndex === 4 ? lastDay : starts[semaineIndex] - 1;
  const dateDebut = new Date(annee, mois - 1, start);
  const dateFin = new Date(annee, mois - 1, end);
  return { dateDebut, dateFin, start, end };
}

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

async function ensurePlanningSemaine(client, { ligneId, annee, mois, semaineIndex, adminId }) {
  const { dateDebut, dateFin } = weekRange(annee, mois, semaineIndex);
  let { rows } = await client.query(
    `SELECT * FROM planning_semaine
     WHERE ligne_id=$1 AND annee=$2 AND mois=$3 AND semaine_index=$4`,
    [ligneId, annee, mois, semaineIndex]
  );
  if (rows.length) return rows[0];

  const semaineNum = annee * 100 + mois * 10 + semaineIndex;
  const id = uuid();
  await client.query(
    `INSERT INTO planning_semaine
     (id, ligne_id, date_debut_semaine, date_fin_semaine, semaine_num, annee, mois, semaine_index, admin_id, statut)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLIE')`,
    [
      id,
      ligneId,
      dateDebut.toISOString().split('T')[0],
      dateFin.toISOString().split('T')[0],
      semaineNum,
      annee,
      mois,
      semaineIndex,
      adminId,
    ]
  );

  for (let d = new Date(dateDebut); d <= dateFin; d.setDate(d.getDate() + 1)) {
    const cur = new Date(d);
    const ds = cur.toISOString().split('T')[0];
    const { rows: exJ } = await client.query(
      'SELECT id FROM planning_jour WHERE planning_semaine_id=$1 AND date_jour=$2',
      [id, ds]
    );
    if (!exJ.length) {
      await client.query(
        `INSERT INTO planning_jour (id, planning_semaine_id, date_jour, jour_semaine)
         VALUES ($1,$2,$3,$4)`,
        [uuid(), id, ds, JOURS[cur.getDay()]]
      );
    }
  }

  ({ rows } = await client.query('SELECT * FROM planning_semaine WHERE id=$1', [id]));
  return rows[0];
}

async function ensurePlanningQuart(client, { planningJourId, quartId, maintenancierId }) {
  let { rows } = await client.query(
    `SELECT * FROM planning_quart WHERE planning_jour_id=$1 AND quart_id=$2`,
    [planningJourId, quartId]
  );
  if (rows.length) return rows[0];

  const id = uuid();
  await client.query(
    `INSERT INTO planning_quart (id, planning_jour_id, quart_id, maintenancier_id)
     VALUES ($1,$2,$3,$4)`,
    [id, planningJourId, quartId, maintenancierId]
  );
  ({ rows } = await client.query('SELECT * FROM planning_quart WHERE id=$1', [id]));
  return rows[0];
}

async function agregerInterventionsLigne(client, planningQuartId, ligneId) {
  const { rows: sums } = await client.query(
    `SELECT COALESCE(SUM(i.duree_arret_effectif),0) AS total,
            STRING_AGG(DISTINCT i.cause_indisponibilite, ' | ') AS causes,
            STRING_AGG(DISTINCT i.observations, ' | ') AS obs
     FROM intervention_quart i
     JOIN equipements e ON i.equipement_id = e.id
     WHERE i.planning_quart_id = $1 AND (e.ligne_id = $2 OR e.ligne_id IS NULL)`,
    [planningQuartId, ligneId]
  );
  const total = Number(sums[0]?.total || 0);
  const causes = sums[0]?.causes || null;
  const obs = sums[0]?.obs || null;

  const { rows: existing } = await client.query(
    'SELECT id FROM intervention_ligne WHERE planning_quart_id=$1',
    [planningQuartId]
  );

  if (existing.length) {
    await client.query(
      `UPDATE intervention_ligne
       SET duree_arret_agregee=$1, cause_indisponibilite=COALESCE($2, cause_indisponibilite),
           observations=COALESCE($3, observations), modifie_le=NOW()
       WHERE planning_quart_id=$4`,
      [total, causes, obs, planningQuartId]
    );
  } else {
    await client.query(
      `INSERT INTO intervention_ligne
       (id, planning_quart_id, ligne_id, duree_arret_agregee, cause_indisponibilite, observations)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [uuid(), planningQuartId, ligneId, total, causes, obs]
    );
  }
}

async function resolveEquipement(client, nomOrCode, ligneId) {
  if (!nomOrCode) return null;
  const q = `%${String(nomOrCode).trim()}%`;
  const { rows } = await client.query(
    `SELECT id FROM equipement
     WHERE actif = TRUE AND ligne_id = $1
       AND (nom ILIKE $2 OR code_ref ILIKE $2)
     ORDER BY nom LIMIT 1`,
    [ligneId, q]
  );
  if (rows.length) return rows[0].id;
  const { rows: anyEq } = await client.query(
    `SELECT id FROM equipements WHERE actif=TRUE AND (nom ILIKE $1 OR code_ref ILIKE $1) LIMIT 1`,
    [q]
  );
  return anyEq[0]?.id || null;
}

async function resolveQuartId(client, quartLabel) {
  const label = String(quartLabel || '').toLowerCase();
  let nom = 'Quart A';
  if (label.includes('b') || label.includes('14')) nom = 'Quart B';
  if (label.includes('c') || label.includes('22')) nom = 'Quart C';
  const { rows } = await client.query(
    'SELECT id FROM quart_maintenance WHERE nom=$1',
    [nom]
  );
  return rows[0]?.id || null;
}

/**
 * Synchronise une soumission de maintenance corrective vers intervention_quart + agrégation ligne.
 */
async function syncSoumissionToPlanning(soumissionId, clientExt = null) {
  const client = clientExt || db;
  const runInTx = !clientExt;

  const exec = async (c) => {
    const { rows: soum } = await c.query(
      `SELECT s.*, ft.code AS form_code
       FROM soumissions s
       JOIN formulaires_types ft ON s.formulaire_type_id = ft.id
       WHERE s.id = $1`,
      [soumissionId]
    );
    if (!soum.length || soum[0].form_code !== FORM_CODE_CORRECTIVE) return null;

    const { rows: vals } = await c.query(
      `SELECT vs.*, cd.nom_champ
       FROM valeurs_saisies vs
       JOIN champs_definitions cd ON vs.champ_def_id = cd.id
       WHERE vs.soumission_id = $1`,
      [soumissionId]
    );

    const data = {};
    for (const v of vals) {
      const key = CHAMP_MAP[String(v.nom_champ).toLowerCase().trim()];
      if (key) data[key] = parseValeur(v);
    }

    if (!data.date || !data.ligne) return null;

    const { rows: lp } = await c.query(
      'SELECT id FROM ligne_production WHERE code ILIKE $1',
      [String(data.ligne).trim()]
    );
    if (!lp.length) return null;
    const ligneId = lp[0].id;

    const dateInt = new Date(data.date);
    const annee = dateInt.getFullYear();
    const mois = dateInt.getMonth() + 1;
    const semaineIndex = semaineIndexFromDate(dateInt);
    const dateStr = dateInt.toISOString().split('T')[0];

    const quartId = await resolveQuartId(c, data.quart);
    if (!quartId) return null;

    const planning = await ensurePlanningSemaine(c, {
      ligneId,
      annee,
      mois,
      semaineIndex,
      adminId: soum[0].utilisateur_id,
    });

    const { rows: jour } = await c.query(
      `SELECT id FROM planning_jour WHERE planning_semaine_id=$1 AND date_jour=$2`,
      [planning.id, dateStr]
    );
    if (!jour.length) return null;

    const pq = await ensurePlanningQuart(c, {
      planningJourId: jour[0].id,
      quartId,
      maintenancierId: soum[0].utilisateur_id,
    });

    const equipementId =
      soum[0].equipement_id || (await resolveEquipement(c, data.equipement, ligneId));
    if (!equipementId) return null;

    const duree = Number(data.duree) || 0;

    const { rows: existing } = await c.query(
      'SELECT id FROM intervention_quart WHERE soumission_id=$1',
      [soumissionId]
    );

    let interventionId;
    if (existing.length) {
      interventionId = existing[0].id;
      await c.query(
        `UPDATE intervention_quart
         SET duree_arret_effectif=$1, cause_indisponibilite=$2, observations=$3,
             equipement_id=$4, statut='VALIDE', modifie_le=NOW()
         WHERE id=$5`,
        [duree, data.cause || null, data.observations || null, equipementId, interventionId]
      );
    } else {
      interventionId = uuid();
      await c.query(
        `INSERT INTO intervention_quart
         (id, planning_quart_id, equipement_id, duree_arret_effectif,
          cause_indisponibilite, observations, statut, soumission_id)
         VALUES ($1,$2,$3,$4,$5,$6,'VALIDE',$7)`,
        [
          interventionId,
          pq.id,
          equipementId,
          duree,
          data.cause || null,
          data.observations || null,
          soumissionId,
        ]
      );
    }

    await agregerInterventionsLigne(c, pq.id, ligneId);
    return { interventionId, planning_quart_id: pq.id };
  };

  if (runInTx) {
    const pgClient = await db.getClient();
    try {
      await pgClient.query('BEGIN');
      const result = await exec(pgClient);
      await pgClient.query('COMMIT');
      return result;
    } catch (e) {
      await pgClient.query('ROLLBACK');
      throw e;
    } finally {
      pgClient.release();
    }
  }
  return exec(client);
}

module.exports = {
  FORM_CODE_CORRECTIVE,
  syncSoumissionToPlanning,
  agregerInterventionsLigne,
  ensurePlanningSemaine,
  ensurePlanningQuart,
  weekRange,
  semaineIndexFromDate,
};
