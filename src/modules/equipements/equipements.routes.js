const express  = require('express');
const router   = express.Router();
const ctrl     = require('./equipements.controller');
const auth     = require('../../middleware/auth');
const roles    = require('../../middleware/roles');
const validate = require('../../middleware/validate');
const Joi      = require('joi');

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

// ── Routes fixes en PREMIER (avant /:id) ─────────────────────────
router.get('/ia/predictions', async (req, res, next) => {
    try {
        const iaService = require('../../services/ia.service');
        const { query }  = require('../../config/db');
        const now   = new Date();
        const mois  = parseInt(req.query.mois)  || now.getMonth() + 1;
        const annee = parseInt(req.query.annee) || now.getFullYear();

        const data = await iaService.getPredictionsPannes(annee, mois);
        if (!data) return res.json({ disponible: false, predictions: [] });

        // Charger tous les équipements de la BDD pour enrichir le matching
        const { rows: equips } = await query(
            'SELECT id, nom, code_ref FROM equipements WHERE actif = TRUE ORDER BY nom'
        );

        // Normaliser un nom : retire accents, apostrophes, tirets
        const norm = (s) => (s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u2018\u2019'`]/g, '')
            .replace(/[-_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Pour chaque prédiction Flask, trouver l'équipement BDD correspondant
        const predictions = (data.predictions || []).map(pred => {
            const pNorm = norm(pred.equipement);
            const match = equips.find(e => {
                const eNorm = norm(e.nom);
                return eNorm === pNorm
                    || eNorm.includes(pNorm)
                    || pNorm.includes(eNorm)
                    || norm(e.code_ref) === pNorm;
            });
            return {
                ...pred,
                equipement_id:  match?.id   || null,
                equipement_nom_bdd: match?.nom || pred.equipement,
            };
        });

        res.json({ disponible: true, ...data, predictions });
    } catch (err) { next(err); }
});

router.post('/ia/classify', async (req, res, next) => {
    try {
        const iaService = require('../../services/ia.service');
        const { text, use_llm } = req.body;
        if (!text) return res.status(400).json({ error: 'Champ "text" requis' });
        const data = await iaService.classifyPanne(text, use_llm);
        if (!data) return res.status(503).json({ error: 'Service IA indisponible' });
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/ia/bot-chat', async (req, res, next) => {
    try {
        const iaService = require('../../services/ia.service');
        const { message, history } = req.body;
        if (!message) return res.status(400).json({ error: 'Champ "message" requis' });
        const data = await iaService.botChat(message, history || []);
        if (!data) return res.status(503).json({ error: 'Service IA indisponible' });
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/ia/bot-chat-stream', (req, res) => {
    const IA_URL = process.env.IA_SERVICE_URL || 'http://localhost:5001';
    const isHttps = IA_URL.startsWith('https://');
    const httpMod = require(isHttps ? 'https' : 'http');
    const urlObj = new URL(IA_URL);
    const { message, history } = req.body;
    if (!message) return res.status(400).json({ error: 'Champ "message" requis' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
    });

    const body = JSON.stringify({ message, history: history || [] });
    const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: '/api/bot/chat/stream',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    const writeSse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const flaskReq = httpMod.request(options, (flaskRes) => {
        if (flaskRes.statusCode !== 200) {
            let body = '';
            flaskRes.on('data', c => body += c);
            flaskRes.on('end', () => {
                writeSse({ token: `Erreur IA: ${flaskRes.statusCode}` });
                writeSse({ done: true, mode: 'error' });
                res.end();
            });
            return;
        }
        flaskRes.pipe(res);
    });

    flaskReq.on('error', () => {
        writeSse({ token: 'Service IA indisponible' });
        writeSse({ done: true, mode: 'error' });
        res.end();
    });

    flaskReq.write(body);
    flaskReq.end();

    req.on('close', () => flaskReq.destroy());
});

// ── Routes dynamiques /:id en DERNIER ────────────────────────────
router.get('/',               ctrl.getAll);
router.get('/:id',            ctrl.getById);
router.get('/:id/historique', ctrl.getHistorique);
router.post('/',              roles('ADMIN','RESP_MAINT'), validate(createSchema), ctrl.create);
router.put('/:id',            roles('ADMIN','RESP_MAINT'), validate(updateSchema), ctrl.update);
router.patch('/:id/etat',     roles('ADMIN','RESP_MAINT','TECHNICIEN'), ctrl.updateEtat);
router.delete('/:id',         roles('ADMIN','RESP_MAINT'), ctrl.remove);

module.exports = router;