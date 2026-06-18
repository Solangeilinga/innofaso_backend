require('dotenv').config();
require('./src/config/env');

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');
const fs         = require('fs');

const logger       = require('./src/utils/logger');
const errorHandler = require('./src/middleware/errorHandler');

const authRoutes        = require('./src/modules/auth/auth.routes');
const usersRoutes       = require('./src/modules/users/users.routes');
const formulairesRoutes = require('./src/modules/formulaires/formulaires.routes');
const soumissionsRoutes = require('./src/modules/soumissions/soumissions.routes');
const equipementsRoutes = require('./src/modules/equipements/equipements.routes');
const alertesRoutes     = require('./src/modules/alertes/alertes.routes');
const planningRoutes    = require('./src/modules/planning/planning.routes');
const lignesRoutes      = require('./src/modules/lignes/lignes.routes');
const rapportsRoutes    = require('./src/modules/rapports/rapports.routes');
const dashboardRoutes   = require('./src/modules/dashboard/dashboard.routes');

const app = express();

// ── Sécurité ────────────────────────────────────────────────────
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // géré par le reverse proxy en prod
}));
app.set('trust proxy', 1);

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 300 : 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Trop de requêtes, réessayez dans 15 minutes.' },
}));

// ── CORS — supporte plusieurs origines ──────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim());

app.use(cors({
    origin: (origin, cb) => {
        // Autoriser les appels sans origin (mobile, Postman, curl)
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))
            return cb(null, true);
        cb(new Error(`CORS bloqué pour l'origine : ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 86400, // cache preflight 24h
}));

// Répondre aux preflight OPTIONS
app.options('/{*path}', cors());

// ── Body / Logs ─────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(
    process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
    { stream: logger.httpStream || { write: msg => logger.info(msg.trim()) } }
));

// ── Uploads statiques ───────────────────────────────────────────
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ── Routes API v1 ───────────────────────────────────────────────
const v1 = '/api/v1';
app.use(`${v1}/auth`,         authRoutes);
app.use(`${v1}/utilisateurs`, usersRoutes);
app.use(`${v1}/formulaires`,  formulairesRoutes);
app.use(`${v1}/soumissions`,  soumissionsRoutes);
app.use(`${v1}/equipements`,  equipementsRoutes);
app.use(`${v1}/alertes`,      alertesRoutes);
app.use(`${v1}/planning`,     planningRoutes);
app.use(`${v1}/lignes`,       lignesRoutes);
app.use(`${v1}/rapports`,     rapportsRoutes);
app.use(`${v1}/dashboard`,    dashboardRoutes);

// ── En production : servir le frontend buildé ───────────────────
if (process.env.NODE_ENV === 'production' && process.env.SERVE_FRONTEND === 'true') {
    const frontendDist = path.join(__dirname, '../frontend/dist');
    if (fs.existsSync(frontendDist)) {
        app.use(express.static(frontendDist));
        // SPA fallback — toutes les routes non-API → index.html

app.get(/^(?!\/api\/v1).*/, (req, res) => {
            res.sendFile(path.join(frontendDist, 'index.html'));
        });
        logger.info('🖥  Frontend servi depuis dist/');
    }
}

// ── Health check ────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
    status: 'ok',
    env:    process.env.NODE_ENV,
    ts:     new Date().toISOString(),
}));

// ── 404 & erreurs ────────────────────────────────────────────────
app.use((req, res) =>
    res.status(404).json({ message: `Route ${req.originalUrl} non trouvée` }));
app.use(errorHandler);

// ── Démarrage ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 InnoFaso backend démarré sur le port ${PORT} (${process.env.NODE_ENV})`);
    logger.info(`   CORS autorisé : ${allowedOrigins.join(', ')}`);
    try { require('./src/jobs/alertes.cron'); }
    catch (e) { logger.warn('Cron alertes non démarré : ' + e.message); }
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM reçu — arrêt propre');
    server.close(() => {
        require('./src/config/db').pool.end(() => process.exit(0));
    });
});
process.on('unhandledRejection', r =>
    logger.error('Unhandled Rejection', { reason: String(r) }));

module.exports = app;
