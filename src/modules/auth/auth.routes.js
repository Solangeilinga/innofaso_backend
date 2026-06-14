const express = require('express');
const router = express.Router();
const ctrl = require('./auth.controller');
const validate = require('../../middleware/validate');
const auth = require('../../middleware/auth');
const Joi = require('joi');

// ── Schémas de validation ─────────────────────────────────────────────
const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        'string.email': 'Email invalide',
        'any.required': 'Email obligatoire',
    }),
    mot_de_passe: Joi.string().min(6).required().messages({
        'any.required': 'Mot de passe obligatoire',
    }),
});

const resetRequestSchema = Joi.object({
    email: Joi.string().email().required(),
});

const resetPasswordSchema = Joi.object({
    token: Joi.string().required(),
    nouveau_mdp: Joi.string().min(8).required(),
    confirmation_mdp: Joi.string().valid(Joi.ref('nouveau_mdp')).required()
        .messages({ 'any.only': 'Les mots de passe ne correspondent pas' }),
});

const changePasswordSchema = Joi.object({
    ancien_mdp: Joi.string().required(),
    nouveau_mdp: Joi.string().min(8).required(),
    confirmation_mdp: Joi.string().valid(Joi.ref('nouveau_mdp')).required(),
});

// ── Routes ────────────────────────────────────────────────────────────
router.post('/login', validate(loginSchema), ctrl.login);
router.post('/logout', auth, ctrl.logout);
router.post('/refresh', ctrl.refresh);
router.post('/reset-request', validate(resetRequestSchema), ctrl.resetRequest);
router.post('/reset-password', validate(resetPasswordSchema), ctrl.resetPassword);
router.put('/change-password', auth, validate(changePasswordSchema), ctrl.changePassword);
router.get('/me', auth, ctrl.me);

module.exports = router;