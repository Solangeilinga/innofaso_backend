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

// Helper: extraire la valeur lisible d'un champ (tous types)
const getValeurLisible = (v) => {
    if (v.valeur_booleen !== null && v.valeur_booleen !== undefined)
        return v.valeur_booleen ? 'Oui' : 'Non';
    if (v.valeur_nombre !== null && v.valeur_nombre !== undefined)
        return v.unite ? `${v.valeur_nombre} ${v.unite}` : String(v.valeur_nombre);
    if (v.valeur_date)
        return new Date(v.valeur_date).toLocaleDateString('fr-FR');
    if (v.valeur_texte !== null && v.valeur_texte !== undefined && String(v.valeur_texte).trim())
        return String(v.valeur_texte).trim();
    if (v.valeur_json) {
        try {
            const j = typeof v.valeur_json === 'string' ? JSON.parse(v.valeur_json) : v.valeur_json;
            return Array.isArray(j) ? j.join(', ') : JSON.stringify(j);
        } catch { return String(v.valeur_json); }
    }
    return null; // champ vide
};

// ── Export PDF sans Puppeteer — HTML imprimable ──────────────────
const exportPDF = async (req, res, next) => {
    try {
        const service = require('./soumissions.service');
        const soumission = await service.getById(req.params.id);
        if (!soumission) return res.status(404).json({ message: 'Soumission non trouvée' });

        const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        const e = soumission.formulaire_entete || soumission.entete;
        const valeurs = (soumission.valeurs || []).filter(v => v.nom_champ);

        const sections = {};
        for (const v of valeurs) {
            const sec = v.section || 'Général';
            if (!sections[sec]) sections[sec] = [];
            sections[sec].push(v);
        }

        const statusColors = { VALIDE:'#16a34a', REJETE:'#dc2626', SOUMIS:'#2563eb', BROUILLON:'#64748b' };
        const statusColor = statusColors[soumission.statut] || '#64748b';

        const enteteHtml = e ? `
        <table class="entete-table">
          <tr><th>ÉMETTEUR</th><th>VÉRIFICATEUR</th><th>APPROBATEUR</th></tr>
          <tr>
            <td><strong>${esc(e.emetteur_nom||'—')}</strong><br><small>${esc(e.emetteur_fonction||'')}</small></td>
            <td><strong>${esc(e.verificateur_nom||'—')}</strong><br><small>${esc(e.verificateur_fonction||'')}</small></td>
            <td><strong>${esc(e.approbateur_nom||'—')}</strong><br><small>${esc(e.approbateur_fonction||'')}</small></td>
          </tr>
        </table>
        ${e.destinataires ? `<p class="destinataires"><strong>Destinataires :</strong> ${esc(e.destinataires)}</p>` : ''}
        ` : '';

        const sectionsHtml = Object.entries(sections).map(([sec, champs]) => `
        <div class="section">
          <div class="section-title">${esc(sec)}</div>
          <table class="data-table">
            <tr><th style="width:45%">Champ</th><th>Valeur</th></tr>
            ${champs.map(v => {
                const val = getValeurLisible(v);
                if (!val && val !== 0) return '';
                return `<tr><td class="label">${esc(v.nom_champ)}</td><td class="value">${esc(val)}</td></tr>`;
            }).join('')}
          </table>
        </div>`).join('');

        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${esc(soumission.formulaire_code)} - ${esc(soumission.formulaire_titre)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
    .header { border-bottom: 3px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px; }
    .header h1 { font-size: 16px; color: #1d4ed8; }
    .header .sub { font-size: 11px; color: #64748b; margin-top: 3px; }
    .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; }
    .meta-card .label { font-size: 9px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
    .meta-card .val { font-weight: 600; font-size: 12px; margin-top: 2px; }
    .status { color: ${statusColor}; font-weight: 700; }
    .entete-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
    .entete-table th { background: #f1f5f9; padding: 6px 10px; text-align: left; font-size: 9px; color: #64748b; text-transform: uppercase; }
    .entete-table td { padding: 6px 10px; border: 1px solid #e2e8f0; }
    .destinataires { font-size: 11px; color: #475569; margin-bottom: 12px; }
    .section { margin-bottom: 16px; }
    .section-title { background: #1d4ed8; color: white; padding: 5px 10px; font-weight: 600; font-size: 11px; border-radius: 4px 4px 0 0; }
    .data-table { width: 100%; border-collapse: collapse; font-size: 11px; }
    .data-table th { background: #e2e8f0; padding: 5px 10px; text-align: left; }
    .data-table tr:nth-child(even) { background: #f8fafc; }
    .data-table td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; }
    .data-table td.label { color: #475569; }
    .data-table td.value { font-weight: 500; }
    .rejet-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 14px; margin-top: 12px; }
    .rejet-box .title { color: #dc2626; font-weight: 700; font-size: 10px; text-transform: uppercase; }
    .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; text-align: right; }
    @media print { body { padding: 12px; } @page { margin: 1cm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(soumission.formulaire_code || '')} — ${esc(soumission.formulaire_titre || '')}</h1>
    <div class="sub">Module : ${esc(soumission.module||'')} · Fréquence : ${esc(soumission.frequence||'—')}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-card"><div class="label">Auteur</div><div class="val">${esc((soumission.auteur_prenom||'')+' '+(soumission.auteur_nom||''))}</div></div>
    <div class="meta-card"><div class="label">Date</div><div class="val">${soumission.date_soumission ? new Date(soumission.date_soumission).toLocaleString('fr-FR') : '—'}</div></div>
    <div class="meta-card"><div class="label">Statut</div><div class="val status">${esc(soumission.statut||'')}</div></div>
    ${soumission.equipement_nom ? `<div class="meta-card"><div class="label">Équipement</div><div class="val">${esc(soumission.equipement_nom)}</div></div>` : ''}
  </div>
  ${enteteHtml}
  ${sectionsHtml}
  ${soumission.commentaire_rejet ? `
  <div class="rejet-box">
    <div class="title">Motif de rejet</div>
    <p style="margin-top:4px;font-size:11px">${esc(soumission.commentaire_rejet)}</p>
  </div>` : ''}
  <div class="footer">Généré par InnoFaso · ${new Date().toLocaleDateString('fr-FR')}</div>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

        const code = (soumission.formulaire_code || 'formulaire').replace(/[^a-zA-Z0-9-]/g, '_');
        const date = (soumission.date_soumission || new Date()).toString().slice(0, 10);
        res.set({
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `inline; filename="${code}_${date}.html"`,
        });
        res.send(html);
    } catch (err) { next(err); }
};

// ── Export Excel individuel ───────────────────────────────────────
const exportSoumissionExcel = async (req, res, next) => {
    try {
        const ExcelJS = require('exceljs');
        const service = require('./soumissions.service');
        const soumission = await service.getById(req.params.id);
        if (!soumission) return res.status(404).json({ message: 'Soumission non trouvée' });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'InnoFaso';
        const ws = wb.addWorksheet('Formulaire');

        // Largeurs colonnes
        ws.columns = [
            { key: 'champ',  width: 38 },
            { key: 'valeur', width: 55 },
        ];

        const BLUE   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1d4ed8' } };
        const TEAL   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0f766e' } };
        const GRAY   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFf1f5f9' } };
        const WHITE  = { color: { argb: 'FFFFFFFF' } };
        const DARK   = { color: { argb: 'FF1e293b' } };

        const addTitle = (text) => {
            ws.mergeCells(`A${ws.rowCount+1}:B${ws.rowCount+1}`);
            const row = ws.lastRow;
            row.getCell(1).value = text;
            row.getCell(1).font = { bold: true, size: 12, color: WHITE };
            row.getCell(1).fill = BLUE;
            row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
            row.height = 22;
        };

        const addSection = (text) => {
            ws.mergeCells(`A${ws.rowCount+1}:B${ws.rowCount+1}`);
            const row = ws.lastRow;
            row.getCell(1).value = text;
            row.getCell(1).font = { bold: true, size: 11, color: WHITE };
            row.getCell(1).fill = TEAL;
            row.getCell(1).alignment = { vertical: 'middle', indent: 1 };
            row.height = 20;
        };

        const addRow = (champ, valeur, isGray = false) => {
            ws.addRow({ champ, valeur });
            const row = ws.lastRow;
            row.getCell(1).font = { color: { argb: 'FF475569' }, size: 10 };
            row.getCell(2).font = { bold: true, color: DARK, size: 10 };
            row.getCell(2).alignment = { wrapText: true };
            if (isGray) {
                row.getCell(1).fill = GRAY;
                row.getCell(2).fill = GRAY;
            }
            row.height = 16;
        };

        // ── Titre ──────────────────────────────────────────────
        addTitle(`${soumission.formulaire_code || ''} — ${soumission.formulaire_titre || ''}`);

        // ── Infos générales ────────────────────────────────────
        addSection('Informations générales');
        const date_str = soumission.date_soumission
            ? new Date(soumission.date_soumission).toLocaleString('fr-FR') : '—';
        addRow('Module',      soumission.module || '—');
        addRow('Fréquence',   soumission.frequence || '—', true);
        addRow('Statut',      soumission.statut || '—');
        addRow('Date',        date_str, true);
        addRow('Auteur',      `${soumission.auteur_prenom||''} ${soumission.auteur_nom||''}`.trim() || '—');
        addRow('Équipement',  soumission.equipement_nom || '—', true);

        // ── Entête officielle ──────────────────────────────────
        const e = soumission.formulaire_entete || soumission.entete;
        if (e && (e.emetteur_nom || e.verificateur_nom || e.approbateur_nom)) {
            addSection('Entête officielle');
            if (e.emetteur_nom)     addRow('Émetteur',     `${e.emetteur_nom} (${e.emetteur_fonction||''})`);
            if (e.verificateur_nom) addRow('Vérificateur', `${e.verificateur_nom} (${e.verificateur_fonction||''})`, true);
            if (e.approbateur_nom)  addRow('Approbateur',  `${e.approbateur_nom} (${e.approbateur_fonction||''})`);
            if (e.destinataires)    addRow('Destinataires', e.destinataires, true);
        }

        // ── Données du formulaire par section ──────────────────
        const sections = {};
        for (const v of (soumission.valeurs || [])) {
            if (!v.nom_champ) continue;
            const val = getValeurLisible(v);
            if (val === null || val === undefined) continue;
            const sec = v.section || 'Général';
            if (!sections[sec]) sections[sec] = [];
            sections[sec].push({ champ: v.nom_champ, valeur: val });
        }

        let rowIdx = 0;
        for (const [section, champs] of Object.entries(sections)) {
            addSection(section);
            champs.forEach((c, i) => addRow(c.champ, c.valeur, i % 2 === 1));
        }

        // ── Motif de rejet ─────────────────────────────────────
        if (soumission.commentaire_rejet) {
            addSection('Motif de rejet');
            addRow('Raison', soumission.commentaire_rejet);
        }

        ws.views = [{ state: 'normal' }];

        const code = (soumission.formulaire_code||'formulaire').replace(/[^a-zA-Z0-9-]/g, '_');
        const dateStr = (soumission.date_soumission||new Date()).toString().slice(0, 10);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${code}_${dateStr}.xlsx"`,
        });
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
};

module.exports.exportPDF = exportPDF;
module.exports.exportSoumissionExcel = exportSoumissionExcel;