const express = require('express');
const router = express.Router();
const ctrl = require('./alertes.controller');
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');

router.use(auth);

// Statiques AVANT les paramétrées
router.get('/non-lues/count',                ctrl.countNonLues);
router.patch('/toutes/lues',                 ctrl.marquerToutesLues);  // aligné frontend

router.get('/',         ctrl.getAll);
router.get('/:id',      ctrl.getById);
router.patch('/:id/lue',    ctrl.marquerLue);
router.patch('/:id/traitee', roles('ADMIN','RESP_MAINT','RESP_PROD'), ctrl.marquerTraitee);
router.delete('/:id',   roles('ADMIN'), ctrl.supprimer);

module.exports = router;

// ── SSE — flux temps réel des alertes ────────────────────────────
// Les clients s'abonnent ici et reçoivent les nouvelles alertes en push
const clients = new Map(); // userId → res

router.get('/stream', (req, res) => {
    const userId = req.user.id;
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Envoyer un ping initial
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    clients.set(userId, res);

    // Heartbeat toutes les 25s pour garder la connexion vivante
    const hb = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25000);

    req.on('close', () => {
        clearInterval(hb);
        clients.delete(userId);
    });
});

// Fonction utilitaire exportée pour pousser une alerte depuis le contrôleur
router.pushAlerte = (userId, alerte) => {
    const res = clients.get(userId);
    if (res) {
        res.write(`data: ${JSON.stringify({ type: 'alerte', alerte })}\n\n`);
    }
};

// Broadcast vers tous les connectés (ex: alerte globale)
router.broadcast = (alerte) => {
    for (const [, res] of clients) {
        res.write(`data: ${JSON.stringify({ type: 'alerte', alerte })}\n\n`);
    }
};