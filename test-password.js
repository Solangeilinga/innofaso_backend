const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const email = 'solangeilinga@gmail.com';
const testPassword = 'admin123';

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'innofaso_db2',
    password: 'kaoulatou',
    port: 5432,
});

(async () => {
    try {
        const result = await pool.query(
            'SELECT mot_de_passe FROM utilisateurs WHERE email = $1',
            [email]
        );
        
        if (result.rows.length > 0) {
            const hash = result.rows[0].mot_de_passe;
            const isValid = await bcrypt.compare(testPassword, hash);
            console.log('Email:', email);
            console.log('Hash stocké:', hash);
            console.log('Mot de passe testé:', testPassword);
            console.log('✅ Mot de passe valide:', isValid);
            
            if (!isValid) {
                const newHash = await bcrypt.hash(testPassword, 12);
                console.log('\n⚠️ Le mot de passe ne correspond pas!');
                console.log('Nouveau hash à utiliser:', newHash);
                console.log('\nExécutez cette commande pour mettre à jour:');
                console.log(`psql -U postgres -d innofaso_db2 -c "UPDATE utilisateurs SET mot_de_passe = '${newHash}' WHERE email = '${email}';"`);
            } else {
                console.log('\n✅ Succès! Le mot de passe admin123 fonctionne!');
                console.log('Vous pouvez maintenant vous connecter avec:');
                console.log('Email: solangeilinga@gmail.com');
                console.log('Mot de passe: admin123');
            }
        } else {
            console.log('❌ Utilisateur non trouvé');
        }
    } catch (err) {
        console.error('Erreur:', err.message);
    } finally {
        await pool.end();
    }
})();