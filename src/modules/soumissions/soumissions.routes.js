const express = require('express');
const router = express.Router();
const ctrl = require('./soumissions.controller');
const auth = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const roles = require('../../middleware/roles');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
        cb(allowed.includes(file.mimetype) ? null : new Error('Type de fichier non autorisé.'), allowed.includes(file.mimetype));
    },
});

const valeurSchema = Joi.object({
    champ_def_id: Joi.string().uuid().required(),
    valeur_texte: Joi.string().allow(null,'').optional(),
    valeur_nombre: Joi.number().allow(null).optional(),
    valeur_date: Joi.string().isoDate().allow(null).optional(),
    valeur_booleen: Joi.boolean().allow(null).optional(),
    valeur_json: Joi.alternatives().try(Joi.array(), Joi.object()).allow(null).optional(),
    est_conforme: Joi.boolean().allow(null).optional(),
});

const enteteSchema = Joi.object({
    emetteur_nom: Joi.string().allow(null,'').optional(),
    emetteur_fonction: Joi.string().allow(null,'').optional(),
    emetteur_date: Joi.string().isoDate().allow(null).optional(),
    emetteur_signature: Joi.string().allow(null,'').optional(),
    verificateur_nom: Joi.string().allow(null,'').optional(),
    verificateur_fonction: Joi.string().allow(null,'').optional(),
    verificateur_date: Joi.string().isoDate().allow(null).optional(),
    verificateur_signature: Joi.string().allow(null,'').optional(),
    approbateur_nom: Joi.string().allow(null,'').optional(),
    approbateur_fonction: Joi.string().allow(null,'').optional(),
    approbateur_date: Joi.string().isoDate().allow(null).optional(),
    approbateur_signature: Joi.string().allow(null,'').optional(),
});

const createSchema = Joi.object({
    formulaire_type_id: Joi.string().uuid().required(),
    equipement_id: Joi.string().uuid().allow(null).optional(),
    statut: Joi.string().valid('BROUILLON','SOUMIS').default('SOUMIS'),
    source: Joi.string().valid('EN_LIGNE','HORS_LIGNE').default('EN_LIGNE'),
    id_local: Joi.string().uuid().allow(null).optional(),
    cree_localement_le: Joi.string().isoDate().allow(null).optional(),
    entete: enteteSchema.optional(),
    valeurs: Joi.array().items(valeurSchema).min(0).required(),
});

// Statut étendu avec VALIDE et REJETE
const updateStatutSchema = Joi.object({
    statut: Joi.string().valid('BROUILLON','SOUMIS','VALIDE','REJETE').required(),
    commentaire: Joi.string().allow(null,'').optional(),
});

const syncSchema = Joi.object({
    soumissions: Joi.array().items(createSchema).min(1).required(),
});

router.use(auth);

// Routes statiques AVANT les routes paramétrées
router.post('/sync', validate(syncSchema), ctrl.sync);

router.get('/',        ctrl.getAll);
router.get('/:id',     ctrl.getById);
router.post('/',       validate(createSchema), ctrl.create);
router.patch('/:id/statut', validate(updateStatutSchema), ctrl.updateStatut);
router.post('/:id/pieces-jointes', upload.single('fichier'), ctrl.uploadPieceJointe);
router.delete('/:id/pieces-jointes/:pjId', ctrl.deletePieceJointe);

// Export Excel
router.get('/export/excel', ctrl.exportExcel);

module.exports = router;
