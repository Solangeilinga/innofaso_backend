const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };

const currentLevel = process.env.NODE_ENV === 'production' ? LEVELS.INFO : LEVELS.DEBUG;

const COLORS = {
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    INFO: '\x1b[36m',
    DEBUG: '\x1b[90m',
    RESET: '\x1b[0m',
};

const format = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
};

// Écriture asynchrone non bloquante
const writeToFile = (line) => {
    const date = new Date().toISOString().split('T')[0];
    const filePath = path.join(logsDir, `${date}.log`);
    fs.appendFile(filePath, line + '\n', 'utf8', (err) => {
        if (err) console.error('⚠️ Erreur écriture log :', err.message);
    });
};

const log = (level, message, meta = {}) => {
    if (LEVELS[level] > currentLevel) return;

    const line = format(level, message, meta);
    const color = COLORS[level] || COLORS.RESET;
    console.log(`${color}${line}${COLORS.RESET}`);

    if (process.env.NODE_ENV !== 'test') {
        writeToFile(line);
    }
};

const logger = {
    error: (message, meta) => log('ERROR', message, meta),
    warn: (message, meta) => log('WARN', message, meta),
    info: (message, meta) => log('INFO', message, meta),
    debug: (message, meta) => log('DEBUG', message, meta),

    httpStream: {
        write: (message) => log('INFO', message.trim()),
    },

    logError: (err, req) => {
        log('ERROR', err.message, {
            stack: err.stack,
            method: req?.method,
            url: req?.originalUrl,
            ip: req?.ip,
            user: req?.user?.email || 'anonymous',
        });
    },
};

module.exports = logger;
