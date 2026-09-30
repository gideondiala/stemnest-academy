/**
 * StemNest Academy — Neon → Supabase Migration Script
 * Reads every table from Neon and writes it to Supabase.
 * Run: node migrate-to-supabase.js
 */

const { Pool } = require('pg');

const NEON = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_bWj0RxM5JQCr@ep-old-heart-ayeooqds.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
});

const SUPA = new Pool({
  connectionString: 'postgresql://postgres.foentsgwrcazaehkbdqv:Diala199400g$@aws-1-eu-west-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
});

// Tables in dependency order (parents before children)
const TABLES = [
  'users',
  'tutor_profiles',
  'student_profiles',
  'pathways',
  'pathway_grades',
  'pathway_units',
  'pathway_lessons',
  'courses',
  'applications',
  'enrollment_requests',
  'batches',
  'enrolments',
  'bookings',
  'class_reports',
  'pipeline',
  'payments',
  'credit_transactions',
  'tutor_availability',
  'notifications',
  'batch_members',
  'tutor_earnings_log',
  'grey_payment_references',
  'referrals',
  'renewal_followups',
  'reminders_sent',
];

// Tables that exist in Neon but may have different columns in Supabase
// We only copy columns that exist in BOTH databases
async function getColumns(pool, table) {
  const res = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return res.rows.map(r => r.column_name);
}

async function tableExists(pool, table) {
  const res = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = $1
    )
  `, [table]);
  return res.rows[0].exists;
}

async function migrateTable(table, neonClient, supaClient) {
  // Check table exists in both
  const inNeon = await tableExists(neonClient, table);
  const inSupa = await tableExists(supaClient, table);

  if (!inNeon) {
    console.log(`  ⏭  ${table} — not in Neon, skipping`);
    return 0;
  }
  if (!inSupa) {
    console.log(`  ⏭  ${table} — not in Supabase yet, skipping`);
    return 0;
  }

  // Get columns from both, use intersection
  const neonCols = await getColumns(neonClient, table);
  const supaCols = await getColumns(supaClient, table);
  const cols = neonCols.filter(c => supaCols.includes(c));

  if (cols.length === 0) {
    console.log(`  ⚠️  ${table} — no matching columns, skipping`);
    return 0;
  }

  // Count rows in Neon
  const countRes = await neonClient.query(`SELECT COUNT(*) FROM "${table}"`);
  const total = parseInt(countRes.rows[0].count);

  if (total === 0) {
    console.log(`  ✅ ${table} — empty, nothing to migrate`);
    return 0;
  }

  console.log(`  📦 ${table} — migrating ${total} rows (columns: ${cols.join(', ')})`);

  // Fetch all rows from Neon
  const colList = cols.map(c => `"${c}"`).join(', ');
  const rows = await neonClient.query(`SELECT ${colList} FROM "${table}"`);

  // Insert into Supabase in batches of 100
  const BATCH = 100;
  let inserted = 0;

  for (let i = 0; i < rows.rows.length; i += BATCH) {
    const batch = rows.rows.slice(i, i + BATCH);

    for (const row of batch) {
      const values = cols.map(c => row[c]);
      const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
      const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

      try {
        await supaClient.query(sql, values);
        inserted++;
      } catch (err) {
        // Log but continue — don't let one bad row stop the whole table
        console.log(`    ⚠️  Row error in ${table}: ${err.message.substring(0, 100)}`);
      }
    }

    process.stdout.write(`\r    Progress: ${Math.min(i + BATCH, rows.rows.length)}/${total}`);
  }

  console.log(`\r    ✅ ${table} — ${inserted}/${total} rows inserted`);
  return inserted;
}

async function run() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  StemNest Academy — Neon → Supabase Migration');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  // Test connections first
  console.log('🔌 Testing connections...');
  try {
    const neonTest = await NEON.query('SELECT 1 as neon_ok');
    console.log('  ✅ Neon connected');
  } catch (err) {
    console.error('  ❌ Neon connection failed:', err.message);
    process.exit(1);
  }

  try {
    const supaTest = await SUPA.query('SELECT 1 as supa_ok');
    console.log('  ✅ Supabase connected');
  } catch (err) {
    console.error('  ❌ Supabase connection failed:', err.message);
    process.exit(1);
  }

  console.log('');
  console.log('📤 Starting migration...');
  console.log('');

  const neonClient = NEON;
  const supaClient = SUPA;

  let totalInserted = 0;
  const results = [];

  for (const table of TABLES) {
    try {
      const count = await migrateTable(table, neonClient, supaClient);
      totalInserted += count;
      results.push({ table, count, status: 'ok' });
    } catch (err) {
      console.log(`  ❌ ${table} — ERROR: ${err.message}`);
      results.push({ table, count: 0, status: 'error', error: err.message });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`  ✅ Migration complete — ${totalInserted} total rows inserted`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('Summary:');
  results.forEach(r => {
    const icon = r.status === 'ok' ? '✅' : '❌';
    console.log(`  ${icon} ${r.table.padEnd(30)} ${r.count} rows`);
  });

  await NEON.end();
  await SUPA.end();
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
