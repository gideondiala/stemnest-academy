const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Creating tutor_profiles table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tutor_profiles (
        user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        subject       VARCHAR(50),
        courses       TEXT[],
        grade_groups  TEXT[],
        availability  VARCHAR(100),
        dbs_checked   VARCHAR(20) DEFAULT 'pending',
        color         VARCHAR(100),
        earnings      NUMERIC(10,2) DEFAULT 0,
        points        INTEGER DEFAULT 0,
        classes_done  INTEGER DEFAULT 0,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✅ tutor_profiles table created successfully!');
  } catch (err) {
    console.error('❌ Error creating table:', err.message);
  } finally {
    pool.end();
  }
}

run();
