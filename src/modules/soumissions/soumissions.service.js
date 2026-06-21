const { query, transaction } = require('../../config/db');
const { logAudit } = require('../../middleware/auditLogger');
const paginate = require('../../utils/pagination');
const ExcelJS = require('exceljs');

const getAll = async ({ page = 1, limit = 20, formulaire_type_id, equipement_id,
    utilisateur_id, statut, date_debut, date_fin, module: mod }) => {
    const params = [];
    const clauses = [];
    const add = (val, sql) => { params.push(val); clauses.push(`${sql}$${params.length}`); };

    if (formulaire_type_id) add(formulaire_type_id, 's.formulaire_type_id = ');
    if (equipement_id)      add(equipement_id,      's.equipement_id = ');
    if (utilisateur_id)     add(utilisateur_id,     's.utilisateur_id = ');
    if (statut)             add(statut.toUpperCase(), 's.statut::text = ');
    if (date_debut)         add(date_debut,           's.date_soumission::DATE >= ');
    if (date_fin)           add(date_fin,             's.date_soumission::DATE <= ');
    if (mod)                add(mod.toUpperCase(),    'ft.module::text = ');

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const countRes = await query(
        `SELECT COUNT(*) FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id ${where}`,
        params
    );
    const total = parseInt(countRes.rows[0].count);

    const p     = Math.max(1, parseInt(page));
    const l     = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (p - 1) * l;

    params.push(l, offset);
    const { rows } = await query(
        `SELECT s.id, s.statut::text AS statut, s.date_soumission, s.source,
             COALESCE(s.commentaire_rejet, '') AS commentaire_rejet,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             ft.module::text AS module, ft.frequence,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom, u.email AS operateur_email,
             e.nom AS equipement_nom, e.code_ref AS equipement_code,
             vp.nom AS valideur_nom, vp.prenom AS valideur_prenom
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         LEFT JOIN equipements e   ON e.id  = s.equipement_id
         LEFT JOIN utilisateurs vp ON vp.id = s.valide_par
         ${where}
         ORDER BY s.date_soumission DESC NULLS LAST, s.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );

    return {
        data: rows,
        meta: {
            page:        p,
            limit:       l,
            total,
            totalPages:  Math.ceil(total / l),
            total_pages: Math.ceil(total / l),
            has_next:    p * l < total,
            has_prev:    p > 1,
        },
    };
};

const getById = async (id) => {
    const { rows: soum } = await query(
        `SELECT s.*,
             ft.code AS form_code, ft.titre AS form_titre, ft.module, ft.frequence AS form_frequence,
             u.nom  AS auteur_nom, u.prenom AS auteur_prenom, u.id AS auteur_id, r.nom AS auteur_role,
             e.nom  AS equipement_nom,
             vp.nom AS valideur_nom, vp.prenom AS valideur_prenom
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         JOIN roles r              ON r.id  = u.role_id
         LEFT JOIN equipements e   ON e.id  = s.equipement_id
         LEFT JOIN utilisateurs vp ON vp.id = s.valide_par
         WHERE s.id = $1`,
        [id]
    );
    if (soum.length === 0) {
        const err = new Error('Soumission non trouvée.'); err.statusCode = 404; throw err;
    }

    const [{ rows: entete }, { rows: valeurs }, { rows: pieces }] = await Promise.all([
        query('SELECT * FROM entetes WHERE soumission_id = $1', [id]),
        query(
            `SELECT vs.*, cd.nom_champ, cd.type_champ, cd.section, cd.unite, cd.ordre
             FROM valeurs_saisies vs
             LEFT JOIN champs_definitions cd ON cd.id = vs.champ_def_id
             WHERE vs.soumission_id = $1
             ORDER BY cd.section NULLS LAST, cd.ordre`,
            [id]
        ),
        query('SELECT * FROM pieces_jointes WHERE soumission_id = $1', [id]),
    ]);

    return { ...soum[0], entete: entete[0] || null, valeurs: valeurs || [], pieces_jointes: pieces || [] };
};

const create = async (data, utilisateurId, ip, appareil) => {
    return transaction(async (client) => {
        if (data.id_local) {
            const { rows: existing } = await client.query(
                'SELECT id FROM soumissions WHERE id_local = $1', [data.id_local]
            );
            if (existing.length > 0) return { id: existing[0].id, alreadyExists: true };
        }

        if (data.statut === 'SOUMIS') {
            const { rows: champsOblig } = await client.query(
                `SELECT id, nom_champ FROM champs_definitions
                 WHERE formulaire_type_id = $1 AND obligatoire = TRUE AND actif = TRUE`,
                [data.formulaire_type_id]
            );
            for (const champ of champsOblig) {
                const val = (data.valeurs || []).find(v => v.champ_def_id === champ.id);
                const rempli = val && (
                    val.valeur_texte != null || val.valeur_nombre != null ||
                    val.valeur_date  != null || val.valeur_booleen != null || val.valeur_json != null
                );
                if (!rempli) {
                    const err = new Error(`Champ obligatoire manquant : "${champ.nom_champ}"`);
                    err.statusCode = 400; throw err;
                }
            }
        }

        const { rows: [soum] } = await client.query(
            `INSERT INTO soumissions
             (formulaire_type_id, utilisateur_id, equipement_id, statut, source, id_local, cree_localement_le)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
                data.formulaire_type_id, utilisateurId, data.equipement_id || null,
                data.statut || 'SOUMIS', data.source || 'EN_LIGNE',
                data.id_local || null, data.cree_localement_le || null,
            ]
        );

        if (data.entete && typeof data.entete === 'object' && Object.keys(data.entete).length > 0) {
            const e = data.entete;
            await client.query(
                `INSERT INTO entetes
                 (soumission_id, emetteur_nom, emetteur_fonction, emetteur_date, emetteur_signature,
                  verificateur_nom, verificateur_fonction, verificateur_date, verificateur_signature,
                  approbateur_nom, approbateur_fonction, approbateur_date, approbateur_signature)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    soum.id,
                    e.emetteur_nom || null, e.emetteur_fonction || null,
                    e.emetteur_date || null, e.emetteur_signature || null,
                    e.verificateur_nom || null, e.verificateur_fonction || null,
                    e.verificateur_date || null, e.verificateur_signature || null,
                    e.approbateur_nom || null, e.approbateur_fonction || null,
                    e.approbateur_date || null, e.approbateur_signature || null,
                ]
            );
        }

        for (const v of (data.valeurs || [])) {
            await client.query(
                `INSERT INTO valeurs_saisies
                 (soumission_id, champ_def_id, valeur_texte, valeur_nombre,
                  valeur_date, valeur_booleen, valeur_json, est_conforme)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    soum.id, v.champ_def_id,
                    v.valeur_texte || null, v.valeur_nombre ?? null,
                    v.valeur_date  || null, v.valeur_booleen ?? null,
                    v.valeur_json ? JSON.stringify(v.valeur_json) : null,
                    v.est_conforme ?? null,
                ]
            );
        }

        if ((data.statut || 'SOUMIS') === 'SOUMIS') {
            try {
                const alertesService = require('../alertes/alertes.service');
                await alertesService.fermerAlertesFormulaire(data.formulaire_type_id);
            } catch (e) { console.error('fermerAlertesFormulaire error:', e.message); }
        }

        return { ...soum, entete: null, valeurs: [], pieces_jointes: [] };
    });
};

const updateEntete = async (soumissionId, enteteData) => {
    // Vérifier que la soumission existe
    const { rows } = await query('SELECT id, statut FROM soumissions WHERE id = $1', [soumissionId]);
    if (rows.length === 0) {
        const err = new Error('Soumission non trouvée.'); err.statusCode = 404; throw err;
    }

    const e = enteteData;
    // Upsert entête
    const { rows: existing } = await query('SELECT id FROM entetes WHERE soumission_id = $1', [soumissionId]);
    if (existing.length > 0) {
        await query(
            `UPDATE entetes SET
             emetteur_nom=$1, emetteur_fonction=$2, emetteur_date=$3, emetteur_signature=$4,
             verificateur_nom=$5, verificateur_fonction=$6, verificateur_date=$7, verificateur_signature=$8,
             approbateur_nom=$9, approbateur_fonction=$10, approbateur_date=$11, approbateur_signature=$12
             WHERE soumission_id=$13`,
            [
                e.emetteur_nom || null, e.emetteur_fonction || null,
                e.emetteur_date || null, e.emetteur_signature || null,
                e.verificateur_nom || null, e.verificateur_fonction || null,
                e.verificateur_date || null, e.verificateur_signature || null,
                e.approbateur_nom || null, e.approbateur_fonction || null,
                e.approbateur_date || null, e.approbateur_signature || null,
                soumissionId,
            ]
        );
    } else {
        await query(
            `INSERT INTO entetes
             (soumission_id, emetteur_nom, emetteur_fonction, emetteur_date, emetteur_signature,
              verificateur_nom, verificateur_fonction, verificateur_date, verificateur_signature,
              approbateur_nom, approbateur_fonction, approbateur_date, approbateur_signature)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
                soumissionId,
                e.emetteur_nom || null, e.emetteur_fonction || null,
                e.emetteur_date || null, e.emetteur_signature || null,
                e.verificateur_nom || null, e.verificateur_fonction || null,
                e.verificateur_date || null, e.verificateur_signature || null,
                e.approbateur_nom || null, e.approbateur_fonction || null,
                e.approbateur_date || null, e.approbateur_signature || null,
            ]
        );
    }
    return { success: true };
};

const updateStatut = async (id, statut, userId, role, ip, appareil, commentaire) => {
    const TRANSITIONS = {
        'BROUILLON': ['SOUMIS'],
        'SOUMIS':    ['BROUILLON', 'VALIDE', 'REJETE'],
        'VALIDE':    ['REJETE'],
        'REJETE':    ['SOUMIS'],
    };

    const { rows } = await query(
        `SELECT s.statut, s.utilisateur_id, ft.module, ft.titre AS form_titre,
                u.nom AS auteur_nom, u.prenom AS auteur_prenom
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         WHERE s.id = $1`, [id]
    );
    if (rows.length === 0) {
        const err = new Error('Soumission non trouvée.'); err.statusCode = 404; throw err;
    }

    const actuel    = rows[0].statut;
    const module    = rows[0].module;
    const auteurId  = rows[0].utilisateur_id;
    const formTitre = rows[0].form_titre;

    if (['VALIDE','REJETE'].includes(statut)) {
        const autorise =
            role === 'ADMIN' ||
            (module === 'MAINTENANCE' && role === 'RESP_MAINT') ||
            (module === 'PRODUCTION'  && role === 'RESP_PROD');
        if (!autorise) {
            const err = new Error(
                `Seul le responsable ${module === 'MAINTENANCE' ? 'maintenance' : 'production'} peut valider ce formulaire.`
            );
            err.statusCode = 403; throw err;
        }
    }

    if (!(TRANSITIONS[actuel] || []).includes(statut)) {
        const err = new Error(`Transition interdite : ${actuel} → ${statut}.`);
        err.statusCode = 400; throw err;
    }

    // Sauvegarder le commentaire de rejet et l'info de validation
    if (statut === 'REJETE') {
        await query(
            `UPDATE soumissions SET statut=$1, date_modification=NOW(),
             commentaire_rejet=$2, valide_par=$3, valide_le=NOW() WHERE id=$4`,
            [statut, commentaire || null, userId, id]
        );
    } else if (statut === 'VALIDE') {
        await query(
            `UPDATE soumissions SET statut=$1, date_modification=NOW(),
             commentaire_rejet=NULL, valide_par=$2, valide_le=NOW() WHERE id=$3`,
            [statut, userId, id]
        );
    } else {
        await query(
            `UPDATE soumissions SET statut=$1, date_modification=NOW() WHERE id=$2`,
            [statut, id]
        );
    }

    // Notifier l'auteur de la soumission
    if (['VALIDE','REJETE'].includes(statut) && auteurId !== userId) {
        try {
            const alertesService = require('../alertes/alertes.service');
            const emoji = statut === 'VALIDE' ? '✅' : '❌';
            const msg = statut === 'VALIDE'
                ? `${emoji} Votre formulaire "${formTitre}" a été validé.`
                : `${emoji} Votre formulaire "${formTitre}" a été rejeté${commentaire ? ` : ${commentaire}` : '.'}`;
            await alertesService.creer({
                utilisateur_id: auteurId,
                type_alerte:    statut === 'VALIDE' ? 'VALIDATION' : 'FORMULAIRE_EN_RETARD',
                message:        msg,
            });
        } catch (e) { console.error('Notif validation error:', e.message); }
    }

    await logAudit({
        utilisateur_id: userId, table_cible: 'soumissions', enregistrement_id: id,
        action: 'UPDATE', ancienne_valeur: { statut: actuel },
        nouvelle_valeur: { statut, commentaire }, adresse_ip: ip, appareil,
    });
};

const addPieceJointe = async (soumissionId, file) => {
    const { rows } = await query(
        `INSERT INTO pieces_jointes (soumission_id, nom_fichier, url_stockage, type_mime)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [soumissionId, file.originalname, `/uploads/${file.filename}`, file.mimetype]
    );
    return rows[0];
};

const deletePieceJointe = async (pjId) => {
    const { rowCount } = await query('DELETE FROM pieces_jointes WHERE id = $1', [pjId]);
    if (rowCount === 0) {
        const err = new Error('Pièce jointe non trouvée.'); err.statusCode = 404; throw err;
    }
};

const sync = async (soumissions, userId, ip, appareil) => {
    const results = [];
    for (const s of soumissions) {
        try {
            const result = await create(s, userId, ip, appareil);
            results.push({ id_local: s.id_local, success: true, id: result.id });
        } catch (err) {
            results.push({ id_local: s.id_local, success: false, error: err.message });
        }
    }
    return results;
};

const exportExcel = async (filters) => {
    const { pool } = require('../../config/db');

    // Date par défaut : 3 dernières années
    const dateDebut = filters.date_debut ||
        new Date(new Date().setFullYear(new Date().getFullYear() - 3))
            .toISOString().split('T')[0];

    const params = [dateDebut];
    const clauses = [`s.date_soumission::date >= $1`];

    if (filters.date_fin)  { params.push(filters.date_fin);  clauses.push(`s.date_soumission::date <= $${params.length}`); }
    if (filters.module)    { params.push(filters.module);     clauses.push(`ft.module = $${params.length}`); }
    if (filters.statut)    { params.push(filters.statut);     clauses.push(`s.statut = $${params.length}`); }

    const where = `WHERE ${clauses.join(' AND ')}`;

    // 1. Récupérer toutes les soumissions avec leurs métadonnées
    const { rows: soumissions } = await pool.query(
        `SELECT
            s.id,
            s.statut,
            s.date_soumission,
            s.commentaire_rejet,
            ft.code    AS formulaire_code,
            ft.titre   AS formulaire_titre,
            ft.module,
            u.prenom   AS operateur_prenom,
            u.nom      AS operateur_nom,
            e.nom      AS equipement_nom,
            vp.prenom  AS valideur_prenom,
            vp.nom     AS valideur_nom,
            s.valide_le
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         LEFT JOIN equipements e   ON e.id  = s.equipement_id
         LEFT JOIN utilisateurs vp ON vp.id = s.valide_par
         ${where}
         ORDER BY s.date_soumission DESC
         LIMIT 50000`,
        params
    );

    if (soumissions.length === 0) {
        // Retourner un fichier vide avec message
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Aucune donnée');
        sheet.addRow(['Aucune soumission trouvée pour les filtres sélectionnés.']);
        const buffer = await workbook.xlsx.writeBuffer();
        return { buffer, filename: 'soumissions_vide.xlsx' };
    }

    // 2. Récupérer toutes les valeurs saisies pour ces soumissions
    const soumIds = soumissions.map(s => s.id);
    const { rows: valeurs } = await pool.query(
        `SELECT
            vs.soumission_id,
            cd.nom_champ,
            cd.type_champ,
            cd.section,
            cd.ordre,
            cd.unite,
            vs.valeur_texte,
            vs.valeur_nombre,
            vs.valeur_date,
            vs.valeur_booleen,
            vs.valeur_json
         FROM valeurs_saisies vs
         JOIN champs_definitions cd ON cd.id = vs.champ_def_id
         WHERE vs.soumission_id = ANY($1)
         ORDER BY vs.soumission_id, cd.section NULLS LAST, cd.ordre`,
        [soumIds]
    );

    // Grouper les valeurs par soumission_id
    const valeursMap = {};
    for (const v of valeurs) {
        if (!valeursMap[v.soumission_id]) valeursMap[v.soumission_id] = [];
        valeursMap[v.soumission_id].push(v);
    }

    // Collecter tous les noms de champs uniques (colonnes dynamiques)
    const champsSet = new Set();
    for (const v of valeurs) champsSet.add(v.nom_champ);
    const champsUniques = [...champsSet];

    // Fonction pour extraire la valeur lisible
    const getVal = (v) => {
        if (v.valeur_booleen !== null && v.valeur_booleen !== undefined)
            return v.valeur_booleen ? 'Oui' : 'Non';
        if (v.valeur_nombre !== null && v.valeur_nombre !== undefined)
            return `${v.valeur_nombre}${v.unite ? ' ' + v.unite : ''}`;
        if (v.valeur_date)
            return new Date(v.valeur_date).toLocaleDateString('fr-FR');
        if (v.valeur_texte) return v.valeur_texte;
        if (v.valeur_json) {
            try { return JSON.stringify(v.valeur_json); } catch { return ''; }
        }
        return '';
    };

    // 3. Créer le workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'InnoFaso';
    workbook.created = new Date();

    // ── Feuille 1 : Vue synthèse ──────────────────────────────────────
    const sheetSynth = workbook.addWorksheet('Synthèse', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    const colsSynth = [
        { header: 'Date',           key: 'date',      width: 18 },
        { header: 'Code',           key: 'code',      width: 18 },
        { header: 'Formulaire',     key: 'titre',     width: 40 },
        { header: 'Module',         key: 'module',    width: 14 },
        { header: 'Statut',         key: 'statut',    width: 12 },
        { header: 'Opérateur',      key: 'operateur', width: 22 },
        { header: 'Équipement',     key: 'equip',     width: 22 },
        { header: 'Validé par',     key: 'valideur',  width: 22 },
        { header: 'Date validation',key: 'val_date',  width: 18 },
        { header: 'Motif rejet',    key: 'rejet',     width: 35 },
        ...champsUniques.map(c => ({ header: c, key: c, width: 20 })),
    ];
    sheetSynth.columns = colsSynth;

    // Style en-tête
    sheetSynth.getRow(1).eachCell(cell => {
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1565C0' } };
        cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
        cell.alignment = { vertical:'middle', horizontal:'center', wrapText:true };
    });
    sheetSynth.getRow(1).height = 28;

    const COLORS = { SOUMIS:'FFBBDEFB', VALIDE:'FFC8E6C9', REJETE:'FFFFCDD2', BROUILLON:'FFF5F5F5' };

    soumissions.forEach((s, i) => {
        const bg = i%2===0 ? 'FFFAFAFA' : 'FFFFFFFF';
        const vSoum = valeursMap[s.id] || [];

        const rowData = {
            date:      s.date_soumission ? new Date(s.date_soumission).toLocaleString('fr-FR') : '',
            code:      s.formulaire_code,
            titre:     s.formulaire_titre,
            module:    s.module,
            statut:    s.statut,
            operateur: `${s.operateur_prenom||''} ${s.operateur_nom||''}`.trim(),
            equip:     s.equipement_nom || '',
            valideur:  s.valideur_nom ? `${s.valideur_prenom||''} ${s.valideur_nom}`.trim() : '',
            val_date:  s.valide_le ? new Date(s.valide_le).toLocaleDateString('fr-FR') : '',
            rejet:     s.commentaire_rejet || '',
        };

        // Ajouter les valeurs des champs dynamiques
        for (const nomChamp of champsUniques) {
            const v = vSoum.find(v => v.nom_champ === nomChamp);
            rowData[nomChamp] = v ? getVal(v) : '';
        }

        const excelRow = sheetSynth.addRow(rowData);
        const statutCol = 5;
        excelRow.eachCell((cell, col) => {
            cell.fill = { type:'pattern', pattern:'solid',
                fgColor:{ argb: col===statutCol ? (COLORS[s.statut]||bg) : bg } };
            cell.alignment = { vertical:'middle' };
            cell.font = { size: 9 };
        });
    });

    sheetSynth.views = [{ state:'frozen', ySplit:1 }];
    sheetSynth.autoFilter = { from:'A1', to:`J1` };

    // ── Feuille 2 : Par formulaire (1 onglet par type) ────────────────
    const parFormulaire = {};
    for (const s of soumissions) {
        if (!parFormulaire[s.formulaire_code]) parFormulaire[s.formulaire_code] = [];
        parFormulaire[s.formulaire_code].push(s);
    }

    for (const [code, soums] of Object.entries(parFormulaire).slice(0, 20)) {
        const sheetF = workbook.addWorksheet(code.slice(0, 31));
        const champsF = new Set();
        for (const s of soums) {
            for (const v of (valeursMap[s.id] || [])) champsF.add(v.nom_champ);
        }
        const champsArr = [...champsF];

        sheetF.columns = [
            { header: 'Date',      key: 'date',      width: 18 },
            { header: 'Statut',    key: 'statut',    width: 12 },
            { header: 'Opérateur', key: 'operateur', width: 22 },
            { header: 'Équipement',key: 'equip',     width: 20 },
            ...champsArr.map(c => ({ header: c, key: c, width: 20 })),
        ];

        sheetF.getRow(1).eachCell(cell => {
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF2E7D32' } };
            cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, size:10 };
            cell.alignment = { vertical:'middle', horizontal:'center' };
        });
        sheetF.getRow(1).height = 24;

        soums.forEach((s, i) => {
            const bg = i%2===0 ? 'FFFAFAFA' : 'FFFFFFFF';
            const vSoum = valeursMap[s.id] || [];
            const rowData = {
                date:      s.date_soumission ? new Date(s.date_soumission).toLocaleString('fr-FR') : '',
                statut:    s.statut,
                operateur: `${s.operateur_prenom||''} ${s.operateur_nom||''}`.trim(),
                equip:     s.equipement_nom || '',
            };
            for (const nomChamp of champsArr) {
                const v = vSoum.find(v => v.nom_champ === nomChamp);
                rowData[nomChamp] = v ? getVal(v) : '';
            }
            const excelRow = sheetF.addRow(rowData);
            excelRow.eachCell(cell => {
                cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: bg } };
                cell.alignment = { vertical:'middle' };
                cell.font = { size: 9 };
            });
        });

        sheetF.views = [{ state:'frozen', ySplit:1 }];
    }

    const buffer   = await workbook.xlsx.writeBuffer();
    const filename = `innofaso_soumissions_${new Date().toISOString().slice(0,10)}.xlsx`;
    return { buffer, filename };
};

module.exports = { getAll, getById, create, updateStatut, updateEntete, addPieceJointe, deletePieceJointe, sync, exportExcel };