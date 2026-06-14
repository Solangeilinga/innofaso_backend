const fs = require('fs');
const path = require('path');
const { pool } = require('../src/config/db');

async function runMigrations() {
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
            console.error(`❌ Échec ${file} :`, err.message);
            process.exit(1);
        }
    }

    console.log('🎉 Base de données à jour.');
    await pool.end();
}

runMigrations();