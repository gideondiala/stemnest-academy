/**
 * Database migration runner.
 * Reads schema.sql and executes it against the configured database.
 * Run: npm run migrate
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — put it in backend/.env (never in the code).');
  process.exit(1);
}
const pool = require('../config/db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('🔄 Running database migrations...');
    await client.query(sql);
    console.log('✅ Migrations complete.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
