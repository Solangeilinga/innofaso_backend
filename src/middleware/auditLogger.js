const { query } = require('../config/db');

// Enregistre une entrée d'audit dans audit_logs
// Appelé manuellement dans les services après chaque opération importante
const logAudit = async ({
    utilisateur_id,
    table_cible,
    enregistrement_id,
    action,             // 'INSERT' | 'UPDATE' | 'DELETE'
    ancienne_valeur = null,
    nouvelle_valeur = null,
    adresse_ip = null,
    appareil = null,
}) => {
    try {
        await query(
            `INSERT INTO audit_logs
         (utilisateur_id, table_cible, enregistrement_id, action,
          ancienne_valeur, nouvelle_valeur, adresse_ip, appareil)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                utilisateur_id,
                table_cible,
                enregistrement_id,
                action,
                ancienne_valeur ? JSON.stringify(ancienne_valeur) : null,
                nouvelle_valeur ? JSON.stringify(nouvelle_valeur) : null,
                adresse_ip,
                appareil,
            ]
        );
    } catch (err) {
        // L'audit ne doit jamais faire planter l'opération principale
        console.error('⚠️ Erreur écriture audit_log :', err.message);
    }
};

module.exports = { logAudit };