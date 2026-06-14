require('dotenv').config();

// Si DATABASE_URL est présent (Render/Railway), les variables DB_* ne sont pas requises
const hasDbUrl = !!process.env.DATABASE_URL;

const required = [
    ...( hasDbUrl ? [] : ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'] ),
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
];

required.forEach(key => {
    if (!process.env[key]) {
        console.error(`❌ Variable d'environnement manquante : ${key}`);
        process.exit(1);
    }
});

module.exports = {
    port:    parseInt(process.env.PORT) || 5000,
    nodeEnv: process.env.NODE_ENV || 'development',
    db: {
        url:      process.env.DATABASE_URL,
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT) || 5432,
        name:     process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    },
    jwt: {
        secret:         process.env.JWT_SECRET,
        expiresIn:      process.env.JWT_EXPIRES_IN || '1h',
        refreshSecret:  process.env.JWT_REFRESH_SECRET,
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    smtp: {
        host:   process.env.SMTP_HOST,
        port:   parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        user:   process.env.SMTP_USER,
        pass:   process.env.SMTP_PASS,
        from:   process.env.SMTP_FROM || 'noreply@innofaso.com',
    },
    upload: {
        dir:     process.env.UPLOAD_DIR || './uploads',
        maxSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
    },
    ia: {
        url: process.env.IA_SERVICE_URL || 'http://localhost:5001',
    },
};
