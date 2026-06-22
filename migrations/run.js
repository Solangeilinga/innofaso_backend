require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

async function runMigrations({ closePool = true } = {}) {
    const sqlDir = path.join(__dirname, 'sql');

    // Table de suivi — créée si absente
    await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

    const files = fs.readdirSync(sqlDir)
        .filter(f => f.endsWith('.sql'))
        .sort();                        // Ordre numérique garanti par le nommage

    for (const file of files) {
        const { rows } = await pool.query(
            'SELECT id FROM _migrations WHERE filename = $1', [file]
        );
        if (rows.length > 0) { console.log(`⏩ Déjà exécuté : ${file}`); continue; }

        const sql = fs.readFileSync(path.join(sqlDir, file), 'utf8');
        try {
            await pool.query(sql);
            await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
            console.log(`✅ Migration : ${file}`);
        } catch (err) {
            // 23505 = unique_violation  |  42P07 = duplicate_table  |  42701 = duplicate_column
            // Ces codes indiquent que la migration a déjà été appliquée hors du tracker.
            const alreadyApplied = ['23505', '42P07', '42701'].includes(err.code);
            if (alreadyApplied) {
                console.warn(`⚠️  Migration ${file} : données déjà présentes (${err.code}), marquée comme exécutée.`);
                await pool.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
            } else {
                console.error(`❌ Échec ${file} :`, err.message);
                if (closePool) process.exit(1);
                throw err;
            }
        }
    }

    console.log('🎉 Base de données à jour.');
    if (closePool) await pool.end();
}

// Exécution directe via `npm run migrate`
if (require.main === module) {
    runMigrations({ closePool: true });
}

module.exports = { runMigrations };