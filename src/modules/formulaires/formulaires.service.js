const { query } = require('../../config/db');

// ─── FORMULAIRES ──────────────────────────────────────────────────────

const getAll = async ({ module: mod, frequence, actif = true, search }) => {
    let where = 'WHERE ft.actif = $1';
    const params = [actif === 'false' ? false : true];

    if (mod)       { params.push(mod.toUpperCase());       where += ` AND ft.module = $${params.length}`; }
    if (frequence) { params.push(frequence.toUpperCase()); where += ` AND ft.frequence = $${params.length}`; }
    if (search)    { params.push(`%${search}%`);           where += ` AND (ft.titre ILIKE $${params.length} OR ft.code ILIKE $${params.length})`; }

    const { rows } = await query(
        `SELECT ft.*,
             COUNT(DISTINCT cd.id) FILTER (WHERE cd.actif = TRUE) AS nb_champs,
             MAX(s.date_soumission) AS derniere_soumission
         FROM formulaires_types ft
         LEFT JOIN champs_definitions cd ON cd.formulaire_type_id = ft.id
         LEFT JOIN soumissions s ON s.formulaire_type_id = ft.id
         ${where}
         GROUP BY ft.id
         ORDER BY ft.module, ft.frequence, ft.titre`,
        params
    );
    return rows;
};

const getById = async (id) => {
    const { rows } = await query(
        `SELECT ft.*,
             COUNT(DISTINCT cd.id) FILTER (WHERE cd.actif = TRUE) AS nb_champs
         FROM formulaires_types ft
         LEFT JOIN champs_definitions cd ON cd.formulaire_type_id = ft.id
         WHERE ft.id = $1
         GROUP BY ft.id`,
        [id]
    );
    if (rows.length === 0) {
        const err = new Error('Formulaire non trouvé.'); err.statusCode = 404; throw err;
    }
    // Charger aussi les champs actifs
    const champs = await getChamps(id);
    return { ...rows[0], champs };
};

const creer = async ({ code, titre, module: mod, frequence, description }) => {
    const { rows } = await query(
        `INSERT INTO formulaires_types (code, titre, module, frequence, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [code.toUpperCase(), titre, mod.toUpperCase(), frequence.toUpperCase(), description || null]
    );
    return rows[0];
};

const modifier = async (id, data) => {
    await getById(id);
    const sets = []; const params = [];
    const fields = ['titre', 'frequence', 'description', 'actif'];
    for (const f of fields) {
        if (data[f] !== undefined) { params.push(data[f]); sets.push(`${f} = $${params.length}`); }
    }
    if (sets.length === 0) return getById(id);
    params.push(new Date(), id);
    await query(`UPDATE formulaires_types SET ${sets.join(', ')}, modifie_le = $${params.length - 1} WHERE id = $${params.length}`, params);
    return getById(id);
};

// Soft delete: désactiver sans supprimer
const softDelete = async (id) => {
    const { rowCount } = await query(
        `UPDATE formulaires_types SET actif = FALSE, modifie_le = NOW() WHERE id = $1`,
        [id]
    );
    if (rowCount === 0) { const err = new Error('Formulaire non trouvé.'); err.statusCode = 404; throw err; }
};

// Restaurer un formulaire (désarchiver)
const restore = async (id) => {
    const { rowCount } = await query(
        `UPDATE formulaires_types SET actif = TRUE, modifie_le = NOW() WHERE id = $1 AND actif = FALSE`,
        [id]
    );
    if (rowCount === 0) { 
        const err = new Error('Formulaire non trouvé ou déjà actif.'); 
        err.statusCode = 404; 
        throw err; 
    }
};

// ─── CHAMPS ───────────────────────────────────────────────────────────

const getChamps = async (formulaireId) => {
    const { rows } = await query(
        `SELECT cd.*, cs.nom_champ AS champ_source_nom
         FROM champs_definitions cd
         LEFT JOIN champs_definitions cs ON cs.id = cd.champ_source_id
         WHERE cd.formulaire_type_id = $1 AND cd.actif = TRUE
         ORDER BY cd.section NULLS LAST, cd.ordre`,
        [formulaireId]
    );
    return rows;
};

const getChampsBySection = async (formulaireId) => {
    await getById(formulaireId);
    const champs = await getChamps(formulaireId);
    const sections = {};
    for (const champ of champs) {
        const s = champ.section || 'Général';
        if (!sections[s]) sections[s] = [];
        sections[s].push(champ);
    }
    return sections;
};

const addChamp = async (formulaireId, data) => {
    await getById(formulaireId);
    
    // Calculer le prochain ordre si non fourni
    let ordre = data.ordre;
    if (ordre === undefined || ordre === null) {
        const { rows } = await query(
            `SELECT COALESCE(MAX(ordre), -1) + 1 AS next_ordre FROM champs_definitions WHERE formulaire_type_id = $1`,
            [formulaireId]
        );
        ordre = rows[0].next_ordre;
    }
    
    // ✅ CORRECTION : Ajouter label (utiliser nom_champ comme valeur par défaut)
    const label = data.label || data.nom_champ;
    
    const { rows } = await query(
        `INSERT INTO champs_definitions
         (formulaire_type_id, nom_champ, label, type_champ, section, obligatoire,
          ordre, unite, placeholder, aide, options_liste, formule, champ_source_id,
          valeur_min, valeur_max)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
            formulaireId, 
            data.nom_champ, 
            label,  // ✅ NOUVEAU : champ label
            data.type_champ,
            data.section || null, 
            data.obligatoire || false,
            ordre, 
            data.unite || null,
            data.placeholder || null, 
            data.aide || null,
            data.options_liste ? JSON.stringify(data.options_liste) : null,
            data.formule || null, 
            data.champ_source_id || null,
            data.valeur_min ?? null, 
            data.valeur_max ?? null,
        ]
    );
    return rows[0];
};

const updateChamp = async (champId, data) => {
    // ✅ Vérifier que data n'est pas vide
    if (!data || Object.keys(data).length === 0) {
        const err = new Error('Aucune donnée à mettre à jour');
        err.statusCode = 400;
        throw err;
    }
    
    const updates = [];
    const params = [];
    const fields = ['nom_champ', 'label', 'type_champ', 'section', 'obligatoire', 'ordre', 'unite',
                    'placeholder', 'aide', 'options_liste', 'formule', 'valeur_min', 'valeur_max'];
    
    for (const field of fields) {
        if (data[field] !== undefined) {
            let val = data[field];
            if (field === 'options_liste' && val) {
                val = typeof val === 'string' ? val : JSON.stringify(val);
            }
            params.push(val);
            updates.push(`${field} = $${params.length}`);
        }
    }
    
    if (updates.length === 0) {
        const err = new Error('Aucun champ valide à mettre à jour');
        err.statusCode = 400;
        throw err;
    }
    
    params.push(new Date(), champId);
    const { rows } = await query(
        `UPDATE champs_definitions SET ${updates.join(', ')}, modifie_le = $${params.length - 1}
         WHERE id = $${params.length} AND actif = TRUE RETURNING *`,
        params
    );
    
    if (rows.length === 0) {
        const err = new Error('Champ non trouvé');
        err.statusCode = 404;
        throw err;
    }
    return rows[0];
};

// Soft delete champ
const softDeleteChamp = async (champId) => {
    const { rowCount } = await query(
        `UPDATE champs_definitions SET actif = FALSE, modifie_le = NOW() WHERE id = $1`,
        [champId]
    );
    if (rowCount === 0) { 
        const err = new Error('Champ non trouvé.'); 
        err.statusCode = 404; 
        throw err; 
    }
};

// Restaurer un champ (désarchiver)
const restoreChamp = async (champId) => {
    const { rowCount } = await query(
        `UPDATE champs_definitions SET actif = TRUE, modifie_le = NOW() WHERE id = $1 AND actif = FALSE`,
        [champId]
    );
    if (rowCount === 0) { 
        const err = new Error('Champ non trouvé ou déjà actif.'); 
        err.statusCode = 404; 
        throw err; 
    }
};

// Réordonner les champs
const reordonner = async (formulaireId, ordres) => {
    // ordres: [{ id, ordre }]
    for (const { id, ordre } of ordres) {
        await query(
            `UPDATE champs_definitions SET ordre = $1, modifie_le = NOW()
             WHERE id = $2 AND formulaire_type_id = $3`,
            [ordre, id, formulaireId]
        );
    }
};

const typesChamps = () => [
    { value: 'TEXTE',     label: 'Texte',            icon: 'Type' },
    { value: 'NOMBRE',    label: 'Nombre',           icon: 'Hash' },
    { value: 'DATE',      label: 'Date',             icon: 'Calendar', auto: true },
    { value: 'HEURE',     label: 'Heure',            icon: 'Clock',    auto: true },
    { value: 'BOOLEEN',   label: 'Oui / Non',        icon: 'ToggleLeft' },
    { value: 'LISTE',     label: 'Liste déroulante', icon: 'ChevronDown' },
    { value: 'SIGNATURE', label: 'Signature',        icon: 'PenLine' },
    { value: 'CALCULE',   label: 'Calculé',          icon: 'Calculator' },
    { value: 'PHOTO',     label: 'Photo',            icon: 'Camera' },
];

module.exports = {
    getAll, 
    getById, 
    creer, 
    modifier, 
    softDelete,
    restore,
    getChamps, 
    getChampsBySection, 
    addChamp, 
    updateChamp, 
    softDeleteChamp,
    restoreChamp, 
    reordonner,
    typesChamps,
};