
const service = require('./rapports.service');

const getJournalierMaintenance = async (req, res, next) => {
    try {
        const pdf = await service.genererRapportJournalierPDF(req.query.date);
        const date = req.query.date || new Date().toISOString().split('T')[0];
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="rapport_maintenance_${date}.pdf"`,
        });
        res.send(pdf);
    } catch (err) { next(err); }
};

const getHebdomadaire = async (req, res, next) => {
    try {
        const pdf = await service.genererRapportHebdomadairePDF(req.query.semaine);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="rapport_hebdomadaire.pdf"',
        });
        res.send(pdf);
    } catch (err) { next(err); }
};

const getFicheEquipement = async (req, res, next) => {
    try {
        const pdf = await service.genererFicheEquipementPDF(req.params.id);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="fiche_equipement.pdf"',
        });
        res.send(pdf);
    } catch (err) { next(err); }
};

const getExportExcel = async (req, res, next) => {
    try {
        const wb = await service.exporterExcel(req.query);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="export_innofaso.xlsx"',
        });
        await wb.xlsx.write(res);
        res.end();
    } catch (err) { next(err); }
};

// Export CSV brut — nouveau endpoint
const getExportCSV = async (req, res, next) => {
    try {
        const { query } = require('../../config/db');
        const params = [];
        let where = "WHERE s.statut = 'SOUMIS'";

        if (req.query.date_debut) { params.push(req.query.date_debut); where += ` AND s.date_soumission::DATE >= $${params.length}`; }
        if (req.query.date_fin) { params.push(req.query.date_fin); where += ` AND s.date_soumission::DATE <= $${params.length}`; }
        if (req.query.module) { params.push(req.query.module.toUpperCase()); where += ` AND ft.module = $${params.length}`; }

        const { rows } = await query(
            `SELECT s.date_soumission, ft.code, ft.titre, ft.module, ft.frequence,
              u.nom || ' ' || u.prenom AS operateur,
              e.nom AS equipement, s.source, s.statut
       FROM soumissions s
       JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
       JOIN utilisateurs u       ON u.id  = s.utilisateur_id
       LEFT JOIN equipements e   ON e.id  = s.equipement_id
       ${where} ORDER BY s.date_soumission DESC`,
            params
        );

        const headers = ['Date', 'Code', 'Formulaire', 'Module', 'Fréquence', 'Opérateur', 'Équipement', 'Source', 'Statut'];
        const lines = rows.map(r => [
            new Date(r.date_soumission).toLocaleString('fr-FR'),
            r.code, r.titre, r.module, r.frequence,
            r.operateur, r.equipement || '', r.source, r.statut,
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));

        const csv = [headers.join(';'), ...lines].join('\r\n');
        res.set({
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="export_innofaso.csv"',
        });
        res.send('\uFEFF' + csv); // BOM pour Excel
    } catch (err) { next(err); }
};

module.exports = {
    getJournalierMaintenance,
    getHebdomadaire,
    getFicheEquipement,
    getExportExcel,
    getExportCSV,
};