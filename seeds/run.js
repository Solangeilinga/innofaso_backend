const { pool } = require('../src/config/db');
const bcrypt = require('bcrypt');

async function seed() {
    console.log('🌱 Chargement des données initiales...\n');

    // ── 1. RÔLES ─────────────────────────────────────────────
    const roles = [
        { nom: 'ADMIN', description: 'Accès total — administration et configuration' },
        { nom: 'RESP_MAINT', description: 'Responsable maintenance — lecture/écriture maintenance' },
        { nom: 'RESP_PROD', description: 'Responsable production — lecture/écriture production' },
        { nom: 'TECHNICIEN', description: 'Technicien de maintenance — saisie formulaires maintenance' },
        { nom: 'OPERATEUR', description: 'Opérateur production — saisie formulaires production' },
        { nom: 'LECTEUR', description: 'Lecteur / Auditeur — consultation uniquement' },
    ];

    const roleIds = {};
    for (const role of roles) {
        const { rows } = await pool.query(
            `INSERT INTO roles (nom, description)
       VALUES ($1, $2)
       ON CONFLICT (nom) DO UPDATE SET description = EXCLUDED.description
       RETURNING id, nom`,
            [role.nom, role.description]
        );
        roleIds[role.nom] = rows[0].id;
        console.log(`  ✅ Rôle : ${role.nom}`);
    }

    // ── 2. UTILISATEUR ADMIN PAR DÉFAUT ──────────────────────
    const adminHash = await bcrypt.hash('admin123', 12);
    await pool.query(
        `INSERT INTO utilisateurs (role_id, nom, prenom, email, mot_de_passe)
     VALUES ($1, 'Admin', 'Système', 'admin@innofaso.com', $2)
     ON CONFLICT (email) DO NOTHING`,
        [roleIds['ADMIN'], adminHash]
    );
    console.log('\n  ✅ Admin : admin@innofaso.com / admin123');
    // ── 3. FORMULAIRES TYPES (51 formulaires du CDC) ─────────
    const formulaires = [
        // ─── MAINTENANCE JOURNALIERS (21) ─────────────────────
        { code: 'PS-ME-EN-CAQ-A', titre: "Compresseur d'air", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-EIC-A', titre: "Suivi de stock encre imprimante carton", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-ETE-A', titre: "Maintenance corrective des bâtiments – externe", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-FDV-A', titre: "Fiche de vie des équipements", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-FOH-A', titre: "Maintenance du fondoir à huile", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-FVE-A', titre: "Intervention fiche de vie des équipements", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-GCG-A', titre: "Gestion de la consommation des groupes électrogènes", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MCI-A', titre: "Maintenance de conditionneuse IMANPACK", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MCP-A', titre: "Maintenance corrective – pannes", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MCT-A', titre: "Maintenance cuve tampon", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MEC-A', titre: "Maintenance échangeur de chaleur", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MJC-A', titre: "Maintenance de l'ensacheuse NEW", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MPE-A', titre: "Maintenance préventive des équipements", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-MTH-A', titre: "Maintenance du thermorégulateur", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-NPE-A', titre: "Nettoyage des pièces en production", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-PAM-A', titre: "Planning des activités de maintenance", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-PVM-A', titre: "Liste de produits validés pour la maintenance", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-REM-A', titre: "Rapport journalier de maintenance", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-SEL-A', titre: "Suivi encre Leibinger", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-SOL-A', titre: "Suivi de solvant", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        { code: 'PS-ME-EN-SPR-A', titre: "Suivi manuel de sortie de pièces de rechange", module: 'MAINTENANCE', frequence: 'JOURNALIER' },
        // ─── MAINTENANCE HEBDOMADAIRES (9) ────────────────────
        { code: 'PO-ME-EN-CCH-A', titre: "Contrôle de cuve balance d'huile", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PO-ME-EN-HTM-A', titre: "Habilitation des techniciens de maintenance", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-CCH-A', titre: "Contrôle balance cuve d'huile", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-CCP-A', titre: "Contrôle cuve à peson", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-CGA-A', titre: "Contrôle de la grille aimantée", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-DCA-A', titre: "Dust Collector et des anneaux", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-DPM-A', titre: "Contrôle du détecteur de particules métalliques", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-EHG-A', titre: "GE 275 Kva", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        { code: 'PS-ME-EN-MDO-A', titre: "Maintenance de la doseuse Nova", module: 'MAINTENANCE', frequence: 'HEBDOMADAIRE' },
        // ─── MAINTENANCE MENSUELS (9) ─────────────────────────
        { code: 'PS-ME-EN-ACC-A', titre: "Appoint d'eau des circuits de chauffe", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-CBS-A', titre: "Contrôle de couronne broyeur Stephan", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-CTM-A', titre: "Contrôle du temps de mélange", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-FPF-A', titre: "Filtre produit fini", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-LUV-A', titre: "Entretien des lampes UV", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-MBR-A', titre: "Maintenance des broyeurs", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-MCO-A', titre: "Maintenance de convoyeur", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-MEA-A', titre: "Maintenance des extracteurs d'air", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        { code: 'PS-ME-EN-MMC-A', titre: "Maintenance CTA", module: 'MAINTENANCE', frequence: 'MENSUEL' },
        // ─── MAINTENANCE TRIMESTRIELS (2) ─────────────────────
        { code: 'PS-ME-EN-CRC-A', titre: "Contrôle des résistances chauffantes triphasées", module: 'MAINTENANCE', frequence: 'TRIMESTRIEL' },
        { code: 'PS-ME-EN-MPO-A', titre: "Maintenance trimestrielle des pompes", module: 'MAINTENANCE', frequence: 'TRIMESTRIEL' },
        // ─── MAINTENANCE SEMESTRIEL / ANNUEL (6) ──────────────
        { code: 'PS-ME-EN-CAA-A', titre: "Maintenance compresseur à air", module: 'MAINTENANCE', frequence: 'ANNUEL' },
        { code: 'PS-ME-EN-CRD-A', titre: "Contrôle et réaffûtage de dents de broyeur", module: 'MAINTENANCE', frequence: 'SEMESTRIEL' },
        { code: 'PS-ME-EN-CST-A', titre: "Contrôle des sondes", module: 'MAINTENANCE', frequence: 'SEMESTRIEL' },
        { code: 'PS-ME-EN-EGA-A', titre: "Générateur d'azote", module: 'MAINTENANCE', frequence: 'ANNUEL' },
        { code: 'PS-ME-EN-MSC-A', titre: "Maintenance semestrielle CTA", module: 'MAINTENANCE', frequence: 'SEMESTRIEL' },
        { code: 'PS-ME-EN-PAM-S', titre: "Planning des activités de maintenance (semestriel)", module: 'MAINTENANCE', frequence: 'SEMESTRIEL' },
        // ─── PRODUCTION AU BESOIN (5) ─────────────────────────
        { code: 'PO-AP-EN-CPE-B', titre: "Changement de produit sur un même équipement", module: 'PRODUCTION', frequence: 'AU_BESOIN' },
        { code: 'PO-AP-EN-DLD-B', titre: "Demande de libération par dérogation MP", module: 'PRODUCTION', frequence: 'AU_BESOIN' },
        { code: 'PO-AP-EN-DRP-B', titre: "Demande de reprise de production", module: 'PRODUCTION', frequence: 'AU_BESOIN' },
        { code: 'PO-AP-EN-PNP-F', titre: "Enregistrement de la pousse lors du nettoyage profond", module: 'PRODUCTION', frequence: 'AU_BESOIN' },
        { code: 'PO-QS-EN-DCP-B', titre: "Demande de changement de produit", module: 'PRODUCTION', frequence: 'AU_BESOIN' },
        // ─── PRODUCTION HEBDOMADAIRES (5) ─────────────────────
        { code: 'PO-AP-EN-PDP-B', titre: "Planning de production", module: 'PRODUCTION', frequence: 'HEBDOMADAIRE' },
        { code: 'PO-AP-EN-PFP-A', titre: "Planning de formation du personnel de production", module: 'PRODUCTION', frequence: 'HEBDOMADAIRE' },
        { code: 'PO-AP-EN-PPH-B', titre: "Prévision de production hebdomadaire", module: 'PRODUCTION', frequence: 'HEBDOMADAIRE' },
        { code: 'PO-AP-EN-PPH-PDP-PDMPFP-B', titre: "Planning consolidé (production, équipes, maintenance, formation)", module: 'PRODUCTION', frequence: 'HEBDOMADAIRE' },
        { code: 'PO-AP-EN-PPM-B', titre: "Planning des équipes de production et de maintenance", module: 'PRODUCTION', frequence: 'HEBDOMADAIRE' },
        // ─── PRODUCTION JOURNALIERS (3) ───────────────────────
        { code: 'PO-AP-EN-CDP-A', titre: "Cahier de passation chef de quart (version A)", module: 'PRODUCTION', frequence: 'JOURNALIER' },
        { code: 'PO-AP-EN-CDP-B', titre: "Cahier de passation chef de quart (version B)", module: 'PRODUCTION', frequence: 'JOURNALIER' },
        { code: 'PO-AP-EN-SPM-B', titre: "Suivi des pertes de matières premières", module: 'PRODUCTION', frequence: 'JOURNALIER' },
        // ─── PRODUCTION MENSUEL (1) ───────────────────────────
        { code: 'PO-AP-EN-IGD-A', titre: "Indicateur de gestion des déchets", module: 'PRODUCTION', frequence: 'MENSUEL' },
    ];

    for (const f of formulaires) {
        await pool.query(
            `INSERT INTO formulaires_types (code, titre, module, frequence)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET titre = EXCLUDED.titre`,
            [f.code, f.titre, f.module, f.frequence]
        );
    }
    console.log(`\n  ✅ ${formulaires.length} formulaires types insérés`);

    console.log('\n🎉 Seed terminé avec succès.');
    await pool.end();



}

seed().catch(err => {
    console.error('❌ Erreur seed :', err.message);
    process.exit(1);
});