const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function inspect() {
  try {
    const leg = await pool.query("SELECT * FROM analisis_legal WHERE id = 'c9263569-a736-4d89-a32f-0d74959a7566'");
    console.log('--- ANALISIS LEGAL KEYS ---', Object.keys(leg.rows[0]));
    console.log(JSON.stringify(leg.rows[0], null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

inspect();
