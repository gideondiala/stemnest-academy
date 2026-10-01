/**
 * Idempotent schema additions applied on server start.
 * Each statement must be safe to run repeatedly (IF NOT EXISTS etc.)
 * and must never delete data. Running these at startup means a deploy
 * can never run code ahead of the columns it depends on.
 *
 * Most of this restores tables/columns that existed on Neon but were
 * left out of supabase-setup.sql during the 30 Sep 2026 migration.
 */

const pool   = require('../config/db');
const logger = require('../utils/logger');

const STATEMENTS = [
  /* ── Users: IANA timezone, e.g. 'Africa/Lagos' ── */
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(80)`,
  /* All staff are currently in Nigeria */
  `UPDATE users SET timezone = 'Africa/Lagos'
     WHERE timezone IS NULL AND role <> 'student'`,

  /* ── Group batches ──
     supabase-setup.sql created an older batches shape (name, course_id,
     max_students); add the columns the code uses alongside it. */
  `ALTER TABLE batches ALTER COLUMN name DROP NOT NULL`,
  `ALTER TABLE batches ADD COLUMN IF NOT EXISTS batch_ref    VARCHAR(20)`,
  `ALTER TABLE batches ADD COLUMN IF NOT EXISTS pathway_id   UUID REFERENCES pathways(id) ON DELETE SET NULL`,
  `ALTER TABLE batches ADD COLUMN IF NOT EXISTS grade_number INTEGER`,
  `ALTER TABLE batches ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES users(id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_batch_ref ON batches(batch_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_batches_tutor  ON batches(tutor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status)`,

  `CREATE TABLE IF NOT EXISTS batch_members (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     batch_id         UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
     student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status           VARCHAR(20) DEFAULT 'active',
     joined_at        TIMESTAMPTZ DEFAULT NOW(),
     removed_at       TIMESTAMPTZ,
     removal_reason   TEXT,
     transferred_at   TIMESTAMPTZ,
     UNIQUE (batch_id, student_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_batch_members_batch   ON batch_members(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_members_student ON batch_members(student_id)`,

  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_bookings_batch ON bookings(batch_id)`,

  /* Batch classes from before the migration lost their batch link and
     members. Batches are being onboarded afresh, so free these slots
     on the tutors' calendars (cancelled, not deleted). */
  `UPDATE bookings SET status = 'cancelled'
     WHERE status = 'scheduled' AND batch_id IS NULL AND student_id IS NULL
       AND notes->>'isBatchClass' = 'true'`,

  /* ── Pause / resume ── */
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_at            TIMESTAMPTZ`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_reason        TEXT`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_by            UUID REFERENCES users(id)`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS last_lesson_at_pause INTEGER`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS resumed_at           TIMESTAMPTZ`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW()`,
  /* Most paid students have no enrolment row, so the pause is also recorded on the profile */
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_at     TIMESTAMPTZ`,
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_reason TEXT`,
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_by     UUID REFERENCES users(id)`,

  /* ── Pathway progress: lessons per grade (used for progress + certificates) ── */
  `ALTER TABLE pathway_grades ADD COLUMN IF NOT EXISTS total_lessons INTEGER`,
  `UPDATE pathway_grades pg SET total_lessons = (
     SELECT COUNT(*) FROM pathway_lessons pl WHERE pl.grade_id = pg.id AND pl.is_active = TRUE)
   WHERE pg.total_lessons IS NULL`,

  /* ── Referrals ── */
  `CREATE TABLE IF NOT EXISTS referrals (
     id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     referrer_id        UUID REFERENCES users(id),
     referrer_name      VARCHAR(120),
     referrer_staff_id  VARCHAR(20),
     student_name       VARCHAR(120) NOT NULL,
     grade              VARCHAR(30),
     age                VARCHAR(10),
     parent_email       VARCHAR(255),
     parent_phone       VARCHAR(30),
     relationship       VARCHAR(60),
     needs_demo         BOOLEAN DEFAULT TRUE,
     status             VARCHAR(30) DEFAULT 'pending',
     payment_link       TEXT,
     payment_status     VARCHAR(30),
     booking_id         UUID,
     created_at         TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status)`,

  /* ── Tutor pay ── */
  `CREATE TABLE IF NOT EXISTS settings (
     key        VARCHAR(80) PRIMARY KEY,
     value      TEXT,
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS tutor_earnings_log (
     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     tutor_id    UUID REFERENCES users(id),
     booking_id  UUID REFERENCES bookings(id) ON DELETE SET NULL,
     amount      NUMERIC(10,2) NOT NULL,
     type        VARCHAR(20),
     created_at  TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (tutor_id, booking_id)
   )`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    try { await pool.query(sql); }
    catch (e) { logger.warn('[SCHEMA] ' + e.message + ' — ' + sql.replace(/\s+/g, ' ').slice(0, 80)); }
  }
}

module.exports = { ensureSchema };
