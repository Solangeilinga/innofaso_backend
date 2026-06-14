const pdfGenerator = require('../../utils/pdfGenerator');
const ExcelJS = require('exceljs');
const { query } = require('../../config/db');
const logger = require('../../utils/logger');

// ── Rapport journalier maintenance ────────────────────────────────────
const genererRapportJournalierPDF = async (date) => {
    const dateStr = date || new Date().toISOString().split('T')[0];

    const { rows } = await query(
        `SELECT s.id, s.date_soumission, s.statut,
            ft.code AS formulaire_code, ft.titre AS formulaire_titre,
            u.nom AS operateur_nom, u.prenom AS operateur_prenom,
            e.nom AS equipement_nom
     FROM soumissions s
     JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
     JOIN utilisateurs u       ON u.id  = s.utilisateur_id
     LEFT JOIN equipements e   ON e.id  = s.equipement_id
     WHERE ft.module = 'MAINTENANCE'
       AND s.date_soumission::DATE = $1
     ORDER BY s.date_soumission`,
        [dateStr]
    );

    logger.info('Génération rapport journalier maintenance', { date: dateStr, nb: rows.length });
    return pdfGenerator.rapportJournalierMaintenance(rows, dateStr);
};

// ── Rapport hebdomadaire consolidé ────────────────────────────────────
const genererRapportHebdomadairePDF = async (semaine) => {
    // semaine = '2026-W20'
    const [year, weekPart] = (semaine || '').split('-W');
    const week = parseInt(weekPart) || getCurrentWeek();
    const annee = parseInt(year) || new Date().getFullYear();

    const [maintenance, production] = await Promise.all([
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE ft.module = 'MAINTENANCE'
        AND EXTRACT(YEAR FROM s.date_soumission) = $1
        AND EXTRACT(WEEK FROM s.date_soumission) = $2
      ORDER BY s.date_soumission`, [annee, week]),
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE ft.module = 'PRODUCTION'
        AND EXTRACT(YEAR FROM s.date_soumission) = $1
        AND EXTRACT(WEEK FROM s.date_soumission) = $2
      ORDER BY s.date_soumission`, [annee, week]),
    ]);

    return pdfGenerator.rapportHebdomadaire({
        maintenance: maintenance.rows,
        production: production.rows,
        semaine: `${annee} — Semaine ${week}`,
    });
};

// ── Fiche équipement PDF ───────────────────────────────────────────────
const genererFicheEquipementPDF = async (equipementId) => {
    const [equip, historique, pieces] = await Promise.all([
        query('SELECT * FROM equipements WHERE id = $1', [equipementId]),
        query(`
      SELECT s.date_soumission, s.statut,
             ft.code AS formulaire_code, ft.titre AS formulaire_titre,
             u.nom AS operateur_nom, u.prenom AS operateur_prenom
      FROM soumissions s
      JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
      JOIN utilisateurs u       ON u.id  = s.utilisateur_id
      WHERE s.equipement_id = $1
      ORDER BY s.date_soumission DESC
      LIMIT 50`, [equipementId]),
        query('SELECT * FROM pieces_rechange WHERE equipement_id = $1', [equipementId]),
    ]);

    if (equip.rows.length === 0) {
        const err = new Error('Équipement non trouvé.'); err.statusCode = 404; throw err;
    }

    return pdfGenerator.ficheEquipement(equip.rows[0], historique.rows, pieces.rows);
};

// ── Export Excel ──────────────────────────────────────────────────────
const exporterExcel = async ({ date_debut, date_fin, module: mod }) => {
    const params = [];
    let where = "WHERE s.statut = 'SOUMIS'";

    if (date_debut) { params.push(date_debut); where += ` AND s.date_soumission::DATE >= $${params.length}`; }
    if (date_fin) { params.push(date_fin); where += ` AND s.date_soumission::DATE <= $${params.length}`; }
    if (mod) { params.push(mod.toUpperCase()); where += ` AND ft.module = $${params.length}`; }

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

    const wb = new ExcelJS.Workbook();
    wb.creator = 'InnoFaso App';
    wb.created = new Date();

    const ws = wb.addWorksheet('Soumissions', {
        views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = [
        { header: 'Date & Heure', key: 'date_soumission', width: 22 },
        { header: 'Code', key: 'code', width: 28 },
        { header: 'Formulaire', key: 'titre', width: 50 },
        { header: 'Module', key: 'module', width: 14 },
        { header: 'Fréquence', key: 'frequence', width: 16 },
        { header: 'Opérateur', key: 'operateur', width: 28 },
        { header: 'Équipement', key: 'equipement', width: 30 },
        { header: 'Source', key: 'source', width: 14 },
        { header: 'Statut', key: 'statut', width: 14 },
    ];

    // Style en-tête
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.height = 20;

    for (const row of rows) {
        const added = ws.addRow({
            ...row,
            date_soumission: new Date(row.date_soumission).toLocaleString('fr-FR'),
        });

        // Couleur ligne selon statut
        if (row.statut === 'SOUMIS') {
            added.getCell('statut').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        }
    }

    // Bordures sur toutes les cellules
    ws.eachRow((row) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                bottom: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                left: { style: 'thin', color: { argb: 'FFDDE3EA' } },
                right: { style: 'thin', color: { argb: 'FFDDE3EA' } },
            };
        });
    });

    logger.info('Export Excel généré', { nb_lignes: rows.length, module: mod });
    return wb;
};

const getCurrentWeek = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
};

module.exports = {
    genererRapportJournalierPDF,
    genererRapportHebdomadairePDF,
    genererFicheEquipementPDF,
    exporterExcel,
};