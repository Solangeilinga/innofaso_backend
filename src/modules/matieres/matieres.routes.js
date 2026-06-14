const express = require('express');
const router = express.Router();
const ctrl = require('./matieres.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi = require('joi');

const createSchema = Joi.object({
    reference:      Joi.string().max(100).required(),
    designation:    Joi.string().max(300).required(),
    categorie:      Joi.string().max(100).optional().allow(null,''),
    fournisseur:    Joi.string().max(200).optional().allow(null,''),
    unite:          Joi.string().max(50).default('kg'),
    quantite_stock: Joi.number().min(0).default(0),
    seuil_alerte:   Joi.number().min(0).default(50),
    prix_unitaire:  Joi.number().min(0).optional().allow(null),
    emplacement:    Joi.string().max(200).optional().allow(null,''),
});

const updateSchema = Joi.object({
    designation:    Joi.string().max(300),
    categorie:      Joi.string().max(100).allow(null,''),
    fournisseur:    Joi.string().max(200).allow(null,''),
    unite:          Joi.string().max(50),
    seuil_alerte:   Joi.number().min(0),
    prix_unitaire:  Joi.number().min(0).allow(null),
    emplacement:    Joi.string().max(200).allow(null,''),
    actif:          Joi.boolean(),
});

const mouvementSchema = Joi.object({
    matiere_id:     Joi.string().uuid().required(),
    type_mouvement: Joi.string().valid('ENTREE','SORTIE','AJUSTEMENT').required(),
    quantite:       Joi.number().positive().required(),
    motif:          Joi.string().max(500).optional().allow(null,''),
    bon_livraison:  Joi.string().max(100).optional().allow(null,''),
    lot:            Joi.string().max(100).optional().allow(null,''),
});

router.use(auth);

// Routes statiques avant paramétrées
router.get('/categories',  ctrl.getCategories);
router.get('/stats',       ctrl.getStats);
router.post('/mouvement',  roles('ADMIN','RESP_PROD','RESP_MAINT','TECHNICIEN','OPERATEUR'), validate(mouvementSchema), ctrl.mouvement);

router.get('/',            ctrl.getAll);
router.get('/:id',         ctrl.getById);
router.get('/:id/mouvements', ctrl.getMouvements);
router.post('/',           roles('ADMIN','RESP_PROD','RESP_MAINT'), validate(createSchema), ctrl.creer);
router.put('/:id',         roles('ADMIN','RESP_PROD','RESP_MAINT'), validate(updateSchema), ctrl.modifier);
router.delete('/:id',      roles('ADMIN'), ctrl.softDelete);

module.exports = router;