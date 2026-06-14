const express = require('express');
const router = express.Router();
const ctrl = require('./formulaires.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi = require('joi');

const champSchema = Joi.object({
    nom_champ: Joi.string().max(300).required(),
    type_champ: Joi.string().valid('TEXTE','NOMBRE','DATE','HEURE','BOOLEEN','LISTE','SIGNATURE','CALCULE','PHOTO').required(),
    section: Joi.string().max(200).optional().allow(null,''),
    obligatoire: Joi.boolean().default(false),
    ordre: Joi.number().integer().default(0),
    unite: Joi.string().max(50).optional().allow(null,''),
    placeholder: Joi.string().max(200).optional().allow(null,''),
    aide: Joi.string().optional().allow(null,''),
    options_liste: Joi.alternatives().try(
        Joi.array().items(Joi.alternatives().try(
            Joi.string(),
            Joi.object({ value: Joi.string(), label: Joi.string() })
        )),
        Joi.object()
    ).optional().allow(null),
    formule: Joi.string().optional().allow(null,''),
    champ_source_id: Joi.string().uuid().optional().allow(null,''),
    valeur_min: Joi.number().optional().allow(null),
    valeur_max: Joi.number().optional().allow(null),
    auto_date: Joi.boolean().optional(),
    auto_heure: Joi.boolean().optional(),
});

const formulaireCreateSchema = Joi.object({
    code: Joi.string().max(60).required(),
    titre: Joi.string().max(300).required(),
    module: Joi.string().valid('MAINTENANCE','PRODUCTION').required(),
    frequence: Joi.string().valid('JOURNALIER','HEBDO','MENSUEL','TRIMESTRIEL','SEMESTRIEL','ANNUEL','AU_BESOIN').required(),
    description: Joi.string().optional().allow(null,''),
});

const formulaireUpdateSchema = Joi.object({
    titre: Joi.string().max(300),
    frequence: Joi.string().valid('JOURNALIER','HEBDO','MENSUEL','TRIMESTRIEL','SEMESTRIEL','ANNUEL','AU_BESOIN'),
    description: Joi.string().optional().allow(null,''),
    actif: Joi.boolean(),
});

router.use(auth);

// Formulaires CRUD
router.get('/',             ctrl.getAll);
router.get('/:id',          ctrl.getById);
router.post('/',            roles('ADMIN','RESP_MAINT','RESP_PROD'), validate(formulaireCreateSchema), ctrl.creer);
router.put('/:id',          roles('ADMIN','RESP_MAINT','RESP_PROD'), validate(formulaireUpdateSchema), ctrl.modifier);
router.delete('/:id',       roles('ADMIN'), ctrl.softDelete);         // soft delete (archivage)
router.put('/:id/restore',  roles('ADMIN'), ctrl.restore);            // ✅ RESTAURATION (désarchivage)

// Champs
router.get('/:id/champs',               ctrl.getChamps);
router.post('/:id/champs',              roles('ADMIN','RESP_MAINT','RESP_PROD'), validate(champSchema), ctrl.addChamp);
router.put('/:id/champs/:champId',      roles('ADMIN','RESP_MAINT','RESP_PROD'), validate(champSchema.fork(Object.keys(champSchema.describe().keys), f => f.optional())), ctrl.updateChamp);
router.delete('/:id/champs/:champId',   roles('ADMIN','RESP_MAINT','RESP_PROD'), ctrl.softDeleteChamp);  // soft delete (archivage)
router.put('/:id/champs/:champId/restore', roles('ADMIN'), ctrl.restoreChamp);   // ✅ RESTAURATION champ
router.put('/:id/champs/reordonner',    roles('ADMIN','RESP_MAINT','RESP_PROD'), ctrl.reordonner);

// Types de champs disponibles
router.get('/meta/types-champs', ctrl.typesChamps);

module.exports = router;
// ── IA / Schema JSON (depuis Alfred) ──────────────────────────────
const { requestGroqDelta, applyDelta } = require('../../services/formAi.service');
const { normalizeSchema, schemaFromChamps, saveSchemaToChamps } = require('../../services/formSchema.service');

router.get('/:id/schema', async (req, res, next) => {
    try {
        const champs = await service.getChamps(req.params.id);
        res.json(normalizeSchema({ fields: champs.map ? [] : [] }));
    } catch(e) { next(e); }
});

router.post('/:id/prompt-ia', async (req, res, next) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt requis' });
        const champs = await service.getChamps(req.params.id);
        const schema = schemaFromChamps ? schemaFromChamps(champs) : { fields: champs };
        const delta = await requestGroqDelta(schema, prompt);
        const updated = applyDelta(schema, delta);
        res.json({ schema: updated, delta });
    } catch(e) { next(e); }
});
