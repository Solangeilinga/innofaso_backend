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
    if (equipement_id)      add(equipement_id, 's.equipement_id = ');
    if (utilisateur_id)     add(utilisateur_id, 's.utilisateur_id = ');
    if (statut)             add(statut.toUpperCase(), 's.statut = ');
    if (date_debut)         add(date_debut, 's.date_soumission::DATE >= ');
    if (date_fin)           add(date_fin, 's.date_soumission::DATE <= ');
    if (mod)                add(mod.toUpperCase(), 'ft.module = ');

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    const countRes = await query(
        `SELECT COUNT(*) FROM soumissions s JOIN formulaires_types ft ON ft.id = s.formulaire_type_id ${where}`,
        params
    );
    const total = parseInt(countRes.rows[0].count);
    const { offset, meta } = paginate(page, limit, total);

    params.push(limit, offset);
    const { rows } = await query(
        `SELECT s.id, s.statut, s.date_soumission, s.source,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre, ft.module, ft.frequence,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom, u.email AS operateur_email,
             e.nom AS equipement_nom, e.code_ref AS equipement_code
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         LEFT JOIN equipements e   ON e.id  = s.equipement_id
         ${where}
         ORDER BY s.date_soumission DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
    );
    return { data: rows, meta };
};

const getById = async (id) => {
    const { rows: soum } = await query(
        `SELECT s.*, ft.code, ft.titre, ft.module, ft.frequence,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom, u.id AS operateur_id,
             e.nom AS equipement_nom
         FROM soumissions s
         JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
         JOIN utilisateurs u       ON u.id  = s.utilisateur_id
         LEFT JOIN equipements e   ON e.id  = s.equipement_id
         WHERE s.id = $1`,
        [id]
    );
    if (soum.length === 0) {
        const err = new Error('Soumission non trouvée.');
        err.statusCode = 404;
        throw err;
    }

    const [{ rows: entete }, { rows: valeurs }, { rows: pieces }] = await Promise.all([
        query('SELECT * FROM entetes WHERE soumission_id = $1', [id]),
        query(
            `SELECT vs.*, cd.nom_champ, cd.type_champ, cd.section, cd.unite
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

        // Vérifier champs obligatoires si SOUMIS
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
                    val.valeur_date != null  || val.valeur_booleen != null ||
                    val.valeur_json != null
                );
                if (!rempli) {
                    const err = new Error(`Champ obligatoire manquant : "${champ.nom_champ}"`);
                    err.statusCode = 400;
                    throw err;
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
                    v.valeur_texte  || null, v.valeur_nombre  ?? null,
                    v.valeur_date   || null, v.valeur_booleen ?? null,
                    v.valeur_json ? JSON.stringify(v.valeur_json) : null,
                    v.est_conforme ?? null,
                ]
            );
        }

        // ── Fermer automatiquement les alertes FORMULAIRE_EN_RETARD ──────
        // Uniquement si la soumission est SOUMIS (pas brouillon)
        if ((data.statut || 'SOUMIS') === 'SOUMIS') {
            try {
                const alertesService = require('../alertes/alertes.service');
                await alertesService.fermerAlertesFormulaire(data.formulaire_type_id);
            } catch (e) {
                // Non bloquant — ne pas faire échouer la soumission
                console.error('fermerAlertesFormulaire error:', e.message);
            }
        }

        return { ...soum, entete: null, valeurs: [], pieces_jointes: [] };
    });
};

const updateStatut = async (id, statut, userId, role, ip, appareil, commentaire) => {
    const TRANSITIONS = {
        'BROUILLON': ['SOUMIS'],
        'SOUMIS':    ['BROUILLON', 'VALIDE', 'REJETE'],
        'VALIDE':    ['REJETE'],
        'REJETE':    ['SOUMIS'],
    };

    const { rows } = await query(
        'SELECT statut, utilisateur_id FROM soumissions WHERE id = $1', [id]
    );
    if (rows.length === 0) {
        const err = new Error('Soumission non trouvée.');
        err.statusCode = 404;
        throw err;
    }

    const actuel = rows[0].statut;
    if (['VALIDE','REJETE'].includes(statut) && !['ADMIN','RESP_MAINT','RESP_PROD'].includes(role)) {
        const err = new Error('Droits insuffisants pour valider/rejeter.');
        err.statusCode = 403;
        throw err;
    }
    if (!(TRANSITIONS[actuel] || []).includes(statut)) {
        const err = new Error(`Transition interdite : ${actuel} → ${statut}.`);
        err.statusCode = 400;
        throw err;
    }

    await query(`UPDATE soumissions SET statut = $1, date_modification = NOW() WHERE id = $2`, [statut, id]);

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
        const err = new Error('Pièce jointe non trouvée.');
        err.statusCode = 404;
        throw err;
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
    const { data } = await getAll({ ...filters, limit: 10000, page: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'InnoFaso';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Soumissions', {
        pageSetup: { paperSize: 9, orientation: 'landscape' }
    });

    sheet.columns = [
        { header: 'Date',        key: 'date_soumission',  width: 18 },
        { header: 'Formulaire',  key: 'formulaire_titre', width: 35 },
        { header: 'Code',        key: 'formulaire_code',  width: 18 },
        { header: 'Module',      key: 'module',           width: 14 },
        { header: 'Fréquence',   key: 'frequence',        width: 14 },
        { header: 'Statut',      key: 'statut',           width: 12 },
        { header: 'Opérateur',   key: 'operateur',        width: 22 },
        { header: 'Équipement',  key: 'equipement_nom',   width: 22 },
        { header: 'Source',      key: 'source',           width: 12 },
    ];

    sheet.getRow(1).eachCell(cell => {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } };
        cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF81C784' } } };
    });
    sheet.getRow(1).height = 24;

    const STATUT_COLORS_XL = {
        SOUMIS: 'FFBBDEFB', VALIDE: 'FFC8E6C9', REJETE: 'FFFFCDD2', BROUILLON: 'FFF5F5F5',
    };

    data.forEach((row, i) => {
        const excelRow = sheet.addRow({
            date_soumission: row.date_soumission
                ? new Date(row.date_soumission).toLocaleString('fr-FR') : '',
            formulaire_titre: row.formulaire_titre,
            formulaire_code:  row.formulaire_code,
            module:           row.module,
            frequence:        row.frequence,
            statut:           row.statut,
            operateur:        `${row.operateur_prenom || ''} ${row.operateur_nom || ''}`.trim(),
            equipement_nom:   row.equipement_nom || '',
            source:           row.source,
        });

        const bgColor    = i % 2 === 0 ? 'FFFAFAFA' : 'FFFFFFFF';
        const statutColor = STATUT_COLORS_XL[row.statut] || bgColor;

        excelRow.eachCell((cell, colNum) => {
            cell.fill = { type: 'pattern', pattern: 'solid',
                fgColor: { argb: colNum === 6 ? statutColor : bgColor } };
            cell.alignment = { vertical: 'middle' };
            cell.border = {
                top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
                bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
                left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
                right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
            };
        });
    });

    sheet.views     = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'I1' };

    const buffer   = await workbook.xlsx.writeBuffer();
    const filename = `soumissions_${new Date().toISOString().slice(0,10)}.xlsx`;
    return { buffer, filename };
};

module.exports = { getAll, getById, create, updateStatut, addPieceJointe, deletePieceJointe, sync, exportExcel };