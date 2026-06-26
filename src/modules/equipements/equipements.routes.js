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
        const now   = new Date();
        const mois  = parseInt(req.query.mois)  || now.getMonth() + 1;
        const annee = parseInt(req.query.annee) || now.getFullYear();

        const data = await iaService.getPredictionsPannes(annee, mois);
        if (!data) return res.json({ disponible: false, predictions: [] });
        res.json({ disponible: true, ...data });
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
    const http = require('http');
    const parts = (process.env.IA_SERVICE_URL || 'http://localhost:5001').replace(/^https?:\/\//, '').split(':');
    const hostname = parts[0];
    const port = parseInt(parts[1]) || 80;
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
        hostname,
        port,
        path: '/api/bot/chat/stream',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
        },
    };

    const writeSse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

    const flaskReq = http.request(options, (flaskRes) => {
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