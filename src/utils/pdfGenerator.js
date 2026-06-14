const puppeteer = require('puppeteer');
const logger = require('./logger');

// Instance browser réutilisable (évite de relancer Chromium à chaque rapport)
let browserInstance = null;

const getBrowser = async () => {
    if (!browserInstance || !browserInstance.isConnected()) {
        browserInstance = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });
        // Réinitialiser si le browser se déconnecte
        browserInstance.on('disconnected', () => { browserInstance = null; });
    }
    return browserInstance;
};

const buildHtmlPage = ({ titre, sousTitre = '', contenu, date = new Date() }) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Arial', sans-serif; font-size: 11px; color: #1a1a2e; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: center;
      background: #1e3a5f; color: #fff; padding: 14px 20px; margin-bottom: 20px; }
    .header .logo-text { font-size: 20px; font-weight: bold; letter-spacing: 2px; }
    .header .doc-info { text-align: right; font-size: 10px; opacity: 0.85; }
    .titre-section { padding: 0 20px 16px; border-bottom: 2px solid #1e3a5f; margin-bottom: 20px; }
    .titre-section h1 { font-size: 15px; color: #1e3a5f; }
    .titre-section p  { font-size: 11px; color: #666; margin-top: 4px; }
    table { width: calc(100% - 40px); border-collapse: collapse; margin: 0 20px 20px; }
    th { background: #1e3a5f; color: #fff; padding: 8px 10px; text-align: left;
         font-size: 10px; font-weight: bold; }
    td { border: 1px solid #dde3ea; padding: 7px 10px; vertical-align: top; font-size: 10px; }
    tr:nth-child(even) td { background: #f5f8fc; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 9px; font-weight: bold; }
    .badge-soumis     { background: #d1fae5; color: #065f46; }
    .badge-brouillon  { background: #fef3c7; color: #92400e; }
    .badge-retard     { background: #fee2e2; color: #991b1b; }
    .badge-realise    { background: #dbeafe; color: #1e40af; }
    .badge-panne      { background: #fce7f3; color: #9d174d; }
    .badge-ok         { background: #d1fae5; color: #065f46; }
    .metrics { display: flex; gap: 12px; padding: 0 20px 20px; flex-wrap: wrap; }
    .metric-card { flex: 1; min-width: 100px; background: #f0f4f8; border-radius: 8px;
                   padding: 12px; text-align: center; }
    .metric-card .nb    { font-size: 24px; font-weight: bold; color: #1e3a5f; }
    .metric-card .label { font-size: 9px; color: #666; margin-top: 4px; }
    .section-title { background: #e8eff7; color: #1e3a5f; font-weight: bold; font-size: 11px;
                     padding: 6px 20px; margin-bottom: 12px; border-left: 4px solid #1e3a5f; }
    .footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 8px; color: #999;
              padding: 8px 20px; border-top: 1px solid #dde3ea; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-text">INNOFASO</div>
    <div class="doc-info">
      <div><strong>Digitalisation Maintenance &amp; Production</strong></div>
      <div>Généré le : ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR')}</div>
    </div>
  </div>
  <div class="titre-section">
    <h1>${titre}</h1>
    ${sousTitre ? `<p>${sousTitre}</p>` : ''}
  </div>
  ${contenu}
  <div class="footer">
    <span>InnoFaso — Application de Digitalisation v1.0</span>
    <span>Document confidentiel — Usage interne</span>
  </div>
</body>
</html>
`;

const genererPDF = async (html) => {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', bottom: '20mm', left: '10mm', right: '10mm' },
        });
        return pdf;
    } finally {
        await page.close();  // Fermer la page, pas le browser
    }
};

const rapportJournalierMaintenance = async (soumissions, date) => {
    const stats = {
        total: soumissions.length,
        soumis: soumissions.filter(s => s.statut === 'SOUMIS').length,
        brouillon: soumissions.filter(s => s.statut === 'BROUILLON').length,
    };

    const lignesTableau = soumissions.map(s => `
    <tr>
      <td>${s.formulaire_code}</td>
      <td>${s.formulaire_titre}</td>
      <td>${s.operateur_prenom} ${s.operateur_nom}</td>
      <td>${s.equipement_nom || '—'}</td>
      <td>${new Date(s.date_soumission).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td><span class="badge badge-${s.statut.toLowerCase()}">${s.statut}</span></td>
    </tr>`).join('');

    const contenu = `
    <div class="metrics">
      <div class="metric-card"><div class="nb">${stats.total}</div><div class="label">Total formulaires</div></div>
      <div class="metric-card"><div class="nb" style="color:#065f46">${stats.soumis}</div><div class="label">Validés (SOUMIS)</div></div>
      <div class="metric-card"><div class="nb" style="color:#92400e">${stats.brouillon}</div><div class="label">En cours</div></div>
      <div class="metric-card"><div class="nb" style="color:#1e3a5f">
        ${stats.total > 0 ? Math.round(stats.soumis / stats.total * 100) : 0}%
      </div><div class="label">Taux complétion</div></div>
    </div>
    <div class="section-title">Détail des formulaires saisis</div>
    <table>
      <thead><tr><th>Code</th><th>Formulaire</th><th>Opérateur</th><th>Équipement</th><th>Heure</th><th>Statut</th></tr></thead>
      <tbody>${lignesTableau || '<tr><td colspan="6" style="text-align:center;color:#999">Aucune saisie</td></tr>'}</tbody>
    </table>`;

    return genererPDF(buildHtmlPage({
        titre: 'Rapport Journalier de Maintenance',
        sousTitre: `Date : ${new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
        contenu,
    }));
};

const rapportHebdomadaire = async ({ maintenance, production, semaine }) => {
    const buildTable = (rows, cols) => `
    <table>
      <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(s => `
        <tr>
          <td>${new Date(s.date_soumission).toLocaleDateString('fr-FR')}</td>
          <td>${s.formulaire_code}</td>
          <td>${s.formulaire_titre}</td>
          <td>${s.operateur_prenom} ${s.operateur_nom}</td>
          <td><span class="badge badge-${s.statut.toLowerCase()}">${s.statut}</span></td>
        </tr>`).join('') || `<tr><td colspan="${cols.length}" style="text-align:center;color:#999">Aucune saisie</td></tr>`}
      </tbody>
    </table>`;

    const cols = ['Date', 'Code', 'Formulaire', 'Opérateur', 'Statut'];
    const contenu = `
    <div class="metrics">
      <div class="metric-card"><div class="nb">${maintenance.length}</div><div class="label">Maintenance</div></div>
      <div class="metric-card"><div class="nb">${production.length}</div><div class="label">Production</div></div>
      <div class="metric-card"><div class="nb">${maintenance.length + production.length}</div><div class="label">Total semaine</div></div>
    </div>
    <div class="section-title">Maintenance — Saisies de la semaine</div>
    ${buildTable(maintenance, cols)}
    <div class="section-title">Production — Saisies de la semaine</div>
    ${buildTable(production, cols)}`;

    return genererPDF(buildHtmlPage({ titre: 'Rapport Hebdomadaire Consolidé', sousTitre: `Semaine : ${semaine}`, contenu }));
};

const ficheEquipement = async (equipement, historique, piecesRechange) => {
    const contenu = `
    <div class="section-title">Informations générales</div>
    <table><tbody>
      <tr><td><strong>Code référence</strong></td><td>${equipement.code_ref}</td>
          <td><strong>Nom</strong></td><td>${equipement.nom}</td></tr>
      <tr><td><strong>Ligne production</strong></td><td>${equipement.ligne_production || '—'}</td>
          <td><strong>Localisation</strong></td><td>${equipement.localisation || '—'}</td></tr>
      <tr><td><strong>Type</strong></td><td>${equipement.type_equipement || '—'}</td>
          <td><strong>État actuel</strong></td>
          <td><span class="badge badge-${equipement.etat === 'OPERATIONNEL' ? 'ok' : 'panne'}">${equipement.etat}</span></td></tr>
      <tr><td><strong>Date installation</strong></td>
          <td>${equipement.date_installation ? new Date(equipement.date_installation).toLocaleDateString('fr-FR') : '—'}</td>
          <td><strong>Prochaine maintenance</strong></td>
          <td>${equipement.prochaine_maintenance ? new Date(equipement.prochaine_maintenance).toLocaleDateString('fr-FR') : 'Non planifiée'}</td></tr>
    </tbody></table>

    <div class="section-title">Historique des interventions (${historique.length})</div>
    <table>
      <thead><tr><th>Date</th><th>Formulaire</th><th>Opérateur</th><th>Statut</th></tr></thead>
      <tbody>${historique.slice(0, 30).map(h => `
        <tr>
          <td>${new Date(h.date_soumission).toLocaleDateString('fr-FR')}</td>
          <td>${h.formulaire_titre} (${h.formulaire_code})</td>
          <td>${h.operateur_prenom} ${h.operateur_nom}</td>
          <td><span class="badge badge-${h.statut.toLowerCase()}">${h.statut}</span></td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:#999">Aucune intervention</td></tr>'}
      </tbody>
    </table>

    <div class="section-title">Pièces de rechange (${piecesRechange.length})</div>
    <table>
      <thead><tr><th>Référence</th><th>Désignation</th><th>Stock actuel</th><th>Seuil alerte</th><th>Statut stock</th></tr></thead>
      <tbody>${piecesRechange.map(p => `
        <tr>
          <td>${p.reference}</td><td>${p.designation}</td>
          <td>${p.quantite_stock} ${p.unite}</td><td>${p.seuil_alerte} ${p.unite}</td>
          <td><span class="badge ${p.quantite_stock <= p.seuil_alerte ? 'badge-panne' : 'badge-ok'}">
            ${p.quantite_stock <= p.seuil_alerte ? 'STOCK BAS' : 'OK'}
          </span></td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#999">Aucune pièce</td></tr>'}
      </tbody>
    </table>`;

    return genererPDF(buildHtmlPage({
        titre: `Fiche Équipement — ${equipement.nom}`,
        sousTitre: `Référence : ${equipement.code_ref} · Localisation : ${equipement.localisation || 'Non renseignée'}`,
        contenu,
    }));
};

module.exports = { genererPDF, buildHtmlPage, rapportJournalierMaintenance, rapportHebdomadaire, ficheEquipement };
