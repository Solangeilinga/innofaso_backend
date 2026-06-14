const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const roles = require('../../middleware/roles');
const { query } = require('../../config/db');

router.get('/', auth, async (req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM ligne_production WHERE actif=TRUE ORDER BY code');
        res.json(rows);
    } catch (e) { next(e); }
});

router.post('/', auth, roles('ADMIN','RESP_MAINT'), async (req, res, next) => {
    try {
        const { code, nom, description } = req.body;
        if (!code || !nom) return res.status(400).json({ message: 'Code et nom requis' });
        const { rows } = await query(
            `INSERT INTO ligne_production (code, nom, description) VALUES ($1,$2,$3) RETURNING *`,
            [code.toUpperCase(), nom, description || null]
        );
        res.status(201).json(rows[0]);
    } catch (e) { next(e); }
});

router.put('/:id', auth, roles('ADMIN','RESP_MAINT'), async (req, res, next) => {
    try {
        const { nom, description } = req.body;
        const { rows } = await query(
            `UPDATE ligne_production SET nom=$1, description=$2 WHERE id=$3 RETURNING *`,
            [nom, description || null, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ message: 'Ligne non trouvée' });
        res.json(rows[0]);
    } catch (e) { next(e); }
});

router.delete('/:id', auth, roles('ADMIN','RESP_MAINT'), async (req, res, next) => {
    try {
        await query('UPDATE ligne_production SET actif=FALSE WHERE id=$1', [req.params.id]);
        res.json({ message: 'Ligne désactivée.' });
    } catch (e) { next(e); }
});

module.exports = router;
