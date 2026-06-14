const service = require('./dashboard.service');

// GET /api/v1/dashboard
const getKPIsPrincipaux = async (req, res, next) => {
    try {
        const data = await service.getKPIsPrincipaux();
        res.json(data);
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/dashboard/maintenance
const getKPIsMaintenance = async (req, res, next) => {
    try {
        const data = await service.getKPIsMaintenance(req.query);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/dashboard/production
const getKPIsProduction = async (req, res, next) => {
    try {
        const data = await service.getKPIsProduction(req.query);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/dashboard/adoption
const getTauxAdoption = async (req, res, next) => {
    try {
        const data = await service.getTauxAdoption();
        res.json(data);
    } catch (err) {
        next(err);
    }
};

// GET /api/v1/dashboard/operateurs
const getActiviteOperateurs = async (req, res, next) => {
    try {
        const data = await service.getActiviteOperateurs(req.query);
        res.json(data);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getKPIsPrincipaux,
    getKPIsMaintenance,
    getKPIsProduction,
    getTauxAdoption,
    getActiviteOperateurs,
};
// Stub for retard endpoint (formulaires en retard)
const getKPIsRetard = async (req, res, next) => {
    try {
        const { query } = require('../../config/db');
        // Soumissions en BROUILLON depuis plus de 24h
        const { rows } = await query(`
            SELECT ft.titre AS formulaire_titre, ft.frequence, COUNT(*) AS nb_en_retard
            FROM soumissions s
            JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
            WHERE s.statut = 'BROUILLON' AND s.date_soumission < NOW() - INTERVAL '24 hours'
            GROUP BY ft.titre, ft.frequence
            ORDER BY nb_en_retard DESC
            LIMIT 10
        `);
        res.json({ formulaires_en_retard: rows });
    } catch (err) { next(err); }
};
module.exports.getKPIsRetard = getKPIsRetard;
