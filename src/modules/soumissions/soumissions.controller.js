const service = require('./soumissions.service');

const getAll    = async (req, res, next) => { try { res.json(await service.getAll(req.query)); } catch (e) { next(e); } };
const getById   = async (req, res, next) => { try { res.json(await service.getById(req.params.id)); } catch (e) { next(e); } };
const create    = async (req, res, next) => {
    try { res.status(201).json(await service.create(req.body, req.user.id, req.ip_client, req.user_agent)); } catch (e) { next(e); }
};
const updateStatut = async (req, res, next) => {
    try {
        await service.updateStatut(req.params.id, req.body.statut, req.user.id, req.user.role, req.ip_client, req.user_agent, req.body.commentaire);
        res.json({ message: 'Statut mis à jour.' });
    } catch (e) { next(e); }
};
const uploadPieceJointe = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
        res.status(201).json(await service.addPieceJointe(req.params.id, req.file));
    } catch (e) { next(e); }
};
const deletePieceJointe = async (req, res, next) => {
    try { await service.deletePieceJointe(req.params.pjId); res.json({ message: 'Pièce jointe supprimée.' }); } catch (e) { next(e); }
};
const sync = async (req, res, next) => {
    try {
        const results = await service.sync(req.body.soumissions, req.user.id, req.ip_client, req.user_agent);
        res.json({ results });
    } catch (e) { next(e); }
};

const exportExcel = async (req, res, next) => {
    try {
        const { buffer, filename } = await service.exportExcel(req.query);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (e) { next(e); }
};

module.exports = { getAll, getById, create, updateStatut, uploadPieceJointe, deletePieceJointe, sync, exportExcel };

// ── Export PDF d'une soumission individuelle ──────────────────────
exports.exportPDF = async (req, res, next) => {
    try {
        const service = require('./soumissions.service');
        const pdfGenerator = require('../../utils/pdfGenerator');
        const soumission = await service.getById(req.params.id);
        if (!soumission) return res.status(404).json({ message: 'Soumission non trouvée' });

        const entete = soumission.formulaire_entete || soumission.entete || null;
        const pdf = await pdfGenerator.ficheFormulaire(soumission, soumission.valeurs || [], entete);

        const code = soumission.formulaire_code?.replace(/[^a-zA-Z0-9-]/g, '_') || 'formulaire';
        const date = (soumission.date_soumission || new Date()).toString().slice(0, 10);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${code}_${date}.pdf"`,
        });
        res.send(pdf);
    } catch (err) { next(err); }
};

// ── Export Excel d'une soumission individuelle ────────────────────
exports.exportSoumissionExcel = async (req, res, next) => {
    try {
        const ExcelJS = require('exceljs');
        const service = require('./soumissions.service');
        const soumission = await service.getById(req.params.id);
        if (!soumission) return res.status(404).json({ message: 'Soumission non trouvée' });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'InnoFaso';

        // ── Feuille 1 : Métadonnées ────────────────────────────────
        const sheetMeta = wb.addWorksheet('Informations');
        sheetMeta.columns = [
            { header: 'Champ', key: 'champ', width: 28 },
            { header: 'Valeur', key: 'valeur', width: 45 },
        ];
        sheetMeta.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheetMeta.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } };

        const meta = [
            ['Formulaire',  `${soumission.formulaire_code} — ${soumission.formulaire_titre}`],
            ['Module',      soumission.module],
            ['Statut',      soumission.statut],
            ['Date',        soumission.date_soumission ? new Date(soumission.date_soumission).toLocaleString('fr-FR') : '—'],
            ['Auteur',      `${soumission.auteur_prenom || ''} ${soumission.auteur_nom || ''}`.trim()],
            ['Équipement',  soumission.equipement_nom || '—'],
            ['Fréquence',   soumission.frequence || '—'],
        ];
        meta.forEach(([champ, valeur]) => sheetMeta.addRow({ champ, valeur }));

        // Entête officielle
        const e = soumission.formulaire_entete || soumission.entete;
        if (e) {
            sheetMeta.addRow({});
            sheetMeta.addRow({ champ: '— ENTÊTE OFFICIELLE —', valeur: '' });
            [
                ['Émetteur', `${e.emetteur_nom || '—'} (${e.emetteur_fonction || ''})`],
                ['Vérificateur', `${e.verificateur_nom || '—'} (${e.verificateur_fonction || ''})`],
                ['Approbateur', `${e.approbateur_nom || '—'} (${e.approbateur_fonction || ''})`],
                ['Destinataires', e.destinataires || '—'],
            ].forEach(([champ, valeur]) => sheetMeta.addRow({ champ, valeur }));
        }

        // ── Feuille 2 : Valeurs saisies ───────────────────────────
        const sheetVals = wb.addWorksheet('Données saisies');
        sheetVals.columns = [
            { header: 'Section',   key: 'section',   width: 22 },
            { header: 'Champ',     key: 'champ',     width: 35 },
            { header: 'Valeur',    key: 'valeur',    width: 45 },
            { header: 'Unité',     key: 'unite',     width: 12 },
        ];
        sheetVals.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheetVals.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0d9488' } };

        for (const v of (soumission.valeurs || [])) {
            let val = '';
            if (v.valeur_booleen !== null && v.valeur_booleen !== undefined)
                val = v.valeur_booleen ? 'Oui' : 'Non';
            else if (v.valeur_nombre !== null && v.valeur_nombre !== undefined)
                val = v.valeur_nombre;
            else if (v.valeur_date)
                val = new Date(v.valeur_date).toLocaleDateString('fr-FR');
            else if (v.valeur_texte)
                val = v.valeur_texte;

            sheetVals.addRow({
                section: v.section || 'Général',
                champ:   v.nom_champ || '',
                valeur:  val,
                unite:   v.unite || '',
            });
        }

        sheetVals.views = [{ state: 'frozen', ySplit: 1 }];

        const code = soumission.formulaire_code?.replace(/[^a-zA-Z0-9-]/g, '_') || 'formulaire';
        const date = (soumission.date_soumission || new Date()).toString().slice(0, 10);

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${code}_${date}.xlsx"`,
        });
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
};