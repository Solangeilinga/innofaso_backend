const service = require('./dashboard.service');
const { query } = require('../../config/db');

// GET /api/v1/dashboard (et /stats et /kpi)
const getKPIsPrincipaux = async (req, res, next) => {
    try { res.json(await service.getKPIsPrincipaux()); }
    catch (err) { next(err); }
};

// GET /api/v1/dashboard/maintenance
const getKPIsMaintenance = async (req, res, next) => {
    try { res.json(await service.getKPIsMaintenance(req.query)); }
    catch (err) { next(err); }
};

// GET /api/v1/dashboard/production
const getKPIsProduction = async (req, res, next) => {
    try { res.json(await service.getKPIsProduction(req.query)); }
    catch (err) { next(err); }
};

// GET /api/v1/dashboard/adoption
const getTauxAdoption = async (req, res, next) => {
    try { res.json(await service.getTauxAdoption()); }
    catch (err) { next(err); }
};

// GET /api/v1/dashboard/operateurs  (alias activite)
const getActiviteOperateurs = async (req, res, next) => {
    try { res.json(await service.getActiviteOperateurs(req.query)); }
    catch (err) { next(err); }
};

// GET /api/v1/dashboard/retard
const getKPIsRetard = async (req, res, next) => {
    try {
        const { rows } = await query(`
            SELECT
                ft.titre     AS formulaire_titre,
                ft.frequence,
                COUNT(*)     AS nb_en_retard
            FROM soumissions s
            JOIN formulaires_types ft ON ft.id = s.formulaire_type_id
            WHERE s.statut = 'BROUILLON'
              AND s.date_soumission < NOW() - INTERVAL '24 hours'
            GROUP BY ft.titre, ft.frequence
            ORDER BY nb_en_retard DESC
            LIMIT 10
        `);
        res.json({ formulaires_en_retard: rows });
    } catch (err) { next(err); }
};

module.exports = {
    getKPIsPrincipaux,
    getKPIsMaintenance,
    getKPIsProduction,
    getTauxAdoption,
    getActiviteOperateurs,
    getKPIsRetard,
};