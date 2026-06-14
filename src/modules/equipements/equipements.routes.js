const express = require('express');
const router = express.Router();
const ctrl = require('./equipements.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi = require('joi');

const createSchema = Joi.object({
    code_ref:              Joi.string().max(50).required(),
    nom:                   Joi.string().max(200).required(),
    ligne_production:      Joi.string().max(100).optional().allow(null, ''),
    localisation:          Joi.string().max(200).optional().allow(null, ''),
    type_equipement:       Joi.string().max(100).optional().allow(null, ''),
    etat:                  Joi.string().valid('OPERATIONNEL','EN_PANNE','EN_MAINTENANCE').default('OPERATIONNEL'),
    date_installation:     Joi.string().isoDate().optional().allow(null, ''),
    prochaine_maintenance: Joi.string().isoDate().optional().allow(null, ''),
});

// Schema séparé pour PUT — toutes les colonnes optionnelles
const updateSchema = Joi.object({
    code_ref:              Joi.string().max(50).optional(),
    nom:                   Joi.string().max(200).optional(),
    ligne_production:      Joi.string().max(100).optional().allow(null, ''),
    localisation:          Joi.string().max(200).optional().allow(null, ''),
    type_equipement:       Joi.string().max(100).optional().allow(null, ''),
    etat:                  Joi.string().valid('OPERATIONNEL','EN_PANNE','EN_MAINTENANCE').optional(),
    date_installation:     Joi.string().isoDate().optional().allow(null, ''),
    prochaine_maintenance: Joi.string().isoDate().optional().allow(null, ''),
});

router.use(auth);

router.get('/',                  ctrl.getAll);
router.get('/:id',               ctrl.getById);
router.get('/:id/historique',    ctrl.getHistorique);
router.post('/',                 roles('ADMIN','RESP_MAINT'), validate(createSchema), ctrl.create);
router.put('/:id',               roles('ADMIN','RESP_MAINT'), validate(updateSchema), ctrl.update);
router.patch('/:id/etat',        roles('ADMIN','RESP_MAINT','TECHNICIEN'), ctrl.updateEtat);

module.exports = router;