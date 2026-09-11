const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  password: 'postgres',
  host: 'bi0a100-postgres',
  port: 5432,
  database: 'bi0a100',
});

async function seedUsers() {
  const users = [
    { email: 'free@bi0a100.test', plan: 'freemium' },
    { email: 'pro@bi0a100.test', plan: 'pro' },
    { email: 'business@bi0a100.test', plan: 'business' },
  ];

  for (const user of users) {
    const password = 'Test123!';
    const hash = await bcrypt.hash(password, 12);

    try {
      await pool.query(
        `INSERT INTO usuarios (email, password_hash, nombre, plan, role, account_role, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE
         SET password_hash = $2, activo = true
        `,
        [user.email, hash, user.email.split('@')[0], user.plan, 'user', 'owner', true]
      );
      console.log(`✅ Usuario ${user.email} (${user.plan}) plantado/actualizado`);
    } catch (err) {
      console.error(`❌ Error con ${user.email}:`, err.message);
    }
  }

  await pool.end();
  console.log('✅ Plantación completada');
}

seedUsers().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});