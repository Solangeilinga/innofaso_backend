const express = require('express');
const router = express.Router();
const ctrl = require('./users.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi = require('joi');

const createSchema = Joi.object({
    nom: Joi.string().min(2).max(100).required(),
    prenom: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    mot_de_passe: Joi.string().min(8).required(),
    role_id: Joi.string().uuid().required(),
});

const updateSchema = Joi.object({
    nom: Joi.string().min(2).max(100),
    prenom: Joi.string().min(2).max(100),
    email: Joi.string().email(),
    role_id: Joi.string().uuid(),
    actif: Joi.boolean(),
});

// Route publique pour les listes déroulantes de formulaires
router.get('/liste-signataires', ctrl.getSignataires);

router.use(auth);

// Routes statiques AVANT /:id
router.get('/roles',      roles('ADMIN'), ctrl.getRoles);         // liste des rôles dispo

router.get('/',           roles('ADMIN'), ctrl.getAll);
router.get('/:id',        roles('ADMIN'), ctrl.getById);
router.post('/',          roles('ADMIN'), validate(createSchema), ctrl.create);
router.put('/:id',        roles('ADMIN'), validate(updateSchema), ctrl.update);
router.patch('/:id/actif', roles('ADMIN'), ctrl.toggleActif);     // soft delete toggle
router.patch('/:id/role', roles('ADMIN'), ctrl.modifierRole);
router.delete('/:id',     roles('ADMIN'), ctrl.deactivate);       // soft delete

module.exports = router;
