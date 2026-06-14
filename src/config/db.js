const { Pool } = require('pg');

// Supporte DATABASE_URL (Render, Railway, Heroku, Supabase)
// OU les variables séparées DB_HOST/PORT/NAME/USER/PASSWORD
const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      }
    : {
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl:      process.env.DB_SSL === 'true'
                    ? { rejectUnauthorized: false }
                    : false,
      };

const pool = new Pool({
    ...poolConfig,
    max:                    20,
    idleTimeoutMillis:      60000,
    connectionTimeoutMillis: 10000,
});

pool.on('error', err => {
    console.error('❌ Erreur pool PostgreSQL :', err.message);
});

// Test connexion au démarrage
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Connexion PostgreSQL impossible :', err.message);
        process.exit(1);
    }
    const dbName = process.env.DATABASE_URL
        ? process.env.DATABASE_URL.split('/').pop().split('?')[0]
        : process.env.DB_NAME;
    console.log(`✅ PostgreSQL connecté : ${dbName}`);
    release();
});

const query       = (text, params) => pool.query(text, params);
const transaction = async (cb) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await cb(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

module.exports = { pool, query, transaction };
