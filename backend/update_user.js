const bcrypt = require('bcrypt');
const { Client } = require('pg');

(async () => {
  const client = new Client({
    user: 'postgres',
    password: 'postgres',
    host: 'postgres',
    port: 5432,
    database: 'bi0a100'
  });
  
  try {
    await client.connect();
    const hash = await bcrypt.hash('Test123!', 12);
    await client.query(
      'UPDATE usuarios SET password_hash = $1, intentos_login = 0, bloqueado_hasta = NULL WHERE email = $2',
      [hash, 'free@bi0a100.test']
    );
    console.log('✅ Actualizado con hash:', hash);
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
    process.exit(0);
  }
})();