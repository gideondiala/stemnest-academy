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

  /* (Removed 5 Oct 2026: a statement here cancelled every old-style batch
     class — no batch_id, no student — on each server start. It cancelled
     the future classes of BATCH-001…005 while those batches were still being
     taught. Schema setup must never change class data.) */

  /* ── Pause / resume ── */
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_at            TIMESTAMPTZ`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_reason        TEXT`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS paused_by            UUID REFERENCES users(id)`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS last_lesson_at_pause INTEGER`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS resumed_at           TIMESTAMPTZ`,
  `ALTER TABLE enrolments ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW()`,
  /* Onboarding records the pathway enrolment before a teacher and start
     date are chosen; scheduling fills them in. */
  `ALTER TABLE enrolments ALTER COLUMN tutor_id   DROP NOT NULL`,
  `ALTER TABLE enrolments ALTER COLUMN start_date DROP NOT NULL`,
  /* Most paid students have no enrolment row, so the pause is also recorded on the profile */
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_at     TIMESTAMPTZ`,
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_reason TEXT`,
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS paused_by     UUID REFERENCES users(id)`,
  /* 'manual' (Post-Sales) or 'credits' (automatic hold at -2) */
  `ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS pause_kind    VARCHAR(20)`,
  `UPDATE student_profiles SET pause_kind = 'manual' WHERE class_paused = TRUE AND pause_kind IS NULL`,

  /* ── Pathway progress: lessons per grade (used for progress + certificates) ── */
  `ALTER TABLE pathway_grades ADD COLUMN IF NOT EXISTS total_lessons INTEGER`,
  `UPDATE pathway_grades pg SET total_lessons = (
     SELECT COUNT(*) FROM pathway_lessons pl WHERE pl.grade_id = pg.id AND pl.is_active = TRUE)
   WHERE pg.total_lessons IS NULL`,

  /* ── Enrollment requests (website Enrol Now + Pre-Sales handover) ──
     Columns the routes write that the Supabase table was created without. */
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS course_id      VARCHAR(100)`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS course_name    VARCHAR(200)`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS course_price   NUMERIC(10,2)`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) DEFAULT 'pending'`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS payment_link   TEXT`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS processed_by   UUID REFERENCES users(id)`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS processed_at   TIMESTAMPTZ`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS booking_id     UUID REFERENCES bookings(id) ON DELETE SET NULL`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS student_id     UUID REFERENCES users(id) ON DELETE SET NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_requests_booking ON enrollment_requests(booking_id) WHERE booking_id IS NOT NULL`,

  /* ── Family logins: a parent account sees all their children ── */
  `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`,
  `ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN
     ('student','tutor','admin','super_admin','sales','presales','postsales','operations','hr','parent'))`,
  `CREATE TABLE IF NOT EXISTS parent_children (
     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     parent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     linked_by   UUID REFERENCES users(id),
     linked_via  VARCHAR(20),
     created_at  TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (parent_id, student_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_parent_children_student ON parent_children(student_id)`,
  /* Suggested families Post-Sales marked as 'not a family' */
  `CREATE TABLE IF NOT EXISTS family_suggestions_dismissed (
     group_key    VARCHAR(40) PRIMARY KEY,
     dismissed_by UUID REFERENCES users(id),
     created_at   TIMESTAMPTZ DEFAULT NOW()
   )`,

  /* ── Reschedule tool: who asked, why, and what changed ── */
  `CREATE TABLE IF NOT EXISTS reschedule_log (
     id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     student_id     UUID REFERENCES users(id) ON DELETE CASCADE,
     enrolment_id   UUID REFERENCES enrolments(id) ON DELETE SET NULL,
     requested_by   VARCHAR(20),
     reason         TEXT,
     old_schedule   JSONB,
     new_schedule   JSONB,
     old_tutor_id   UUID REFERENCES users(id),
     new_tutor_id   UUID REFERENCES users(id),
     start_date     DATE,
     classes_moved  INTEGER,
     classes_added  INTEGER,
     performed_by   UUID REFERENCES users(id),
     created_at     TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_reschedule_log_student ON reschedule_log(student_id)`,

  /* ── Lesson assignments (projects): one per student per class, due 7 days later ── */
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS lesson_id        UUID REFERENCES pathway_lessons(id) ON DELETE SET NULL`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS kind             VARCHAR(20) DEFAULT 'manual'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS due_at           TIMESTAMPTZ`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS submission_note  TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_late          BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_student_booking ON projects(student_id, booking_id) WHERE booking_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_projects_tutor_status ON projects(tutor_id, status)`,

  /* ── Unit quizzes assigned to a student when a unit is finished: 3 attempts, best counts ── */
  `CREATE TABLE IF NOT EXISTS quiz_assignments (
     id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     quiz_id          UUID NOT NULL REFERENCES unit_quizzes(id) ON DELETE CASCADE,
     booking_id       UUID REFERENCES bookings(id) ON DELETE SET NULL,
     assigned_at      TIMESTAMPTZ DEFAULT NOW(),
     due_at           TIMESTAMPTZ,
     attempts_used    INTEGER DEFAULT 0,
     best_score       INTEGER,
     best_percentage  NUMERIC(5,2),
     points           NUMERIC(6,2) DEFAULT 0,
     passed           BOOLEAN DEFAULT FALSE,
     last_attempt_at  TIMESTAMPTZ,
     reminder_sent_at TIMESTAMPTZ,
     UNIQUE (student_id, quiz_id)
   )`,

  /* ── Work students submit during class (links only) ── */
  `CREATE TABLE IF NOT EXISTS class_submissions (
     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
     lesson_id   UUID REFERENCES pathway_lessons(id) ON DELETE SET NULL,
     student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     task_no     INTEGER NOT NULL,
     link        TEXT NOT NULL,
     note        TEXT,
     created_at  TIMESTAMPTZ DEFAULT NOW(),
     updated_at  TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (booking_id, student_id, task_no)
   )`,

  /* Lesson plans: where students save their work each session */
  `ALTER TABLE pathway_lessons ADD COLUMN IF NOT EXISTS portfolio_save TEXT`,

  /* ── Chat between a student (or their parent) and their tutor ── */
  `CREATE TABLE IF NOT EXISTS chat_messages (
     id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     student_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     tutor_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     sender_id           UUID REFERENCES users(id) ON DELETE SET NULL,
     sender_role         VARCHAR(20) NOT NULL,
     body                TEXT,
     link                TEXT,
     created_at          TIMESTAMPTZ DEFAULT NOW(),
     read_by_tutor_at    TIMESTAMPTZ,
     read_by_student_at  TIMESTAMPTZ,
     reminder_sent_at    TIMESTAMPTZ
   )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(student_id, tutor_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_tutor_unread ON chat_messages(tutor_id) WHERE read_by_tutor_at IS NULL`,

  /* ── Promoters: referral links for demo bookings, paid a % of the student's first payment ── */
  `CREATE TABLE IF NOT EXISTS promoters (
     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     code          VARCHAR(40) UNIQUE NOT NULL,
     name          VARCHAR(160) NOT NULL,
     email         VARCHAR(255),
     phone         VARCHAR(40),
     reward_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
     notes         TEXT,
     is_active     BOOLEAN DEFAULT TRUE,
     created_by    UUID REFERENCES users(id),
     created_at    TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS promoter_clicks (
     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     promoter_id  UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
     page         VARCHAR(200),
     visitor      VARCHAR(64),
     created_at   TIMESTAMPTZ DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_promoter_clicks ON promoter_clicks(promoter_id, created_at)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES promoters(id) ON DELETE SET NULL`,
  `ALTER TABLE enrollment_requests ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES promoters(id) ON DELETE SET NULL`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS promoter_id UUID REFERENCES promoters(id) ON DELETE SET NULL`,
  `CREATE TABLE IF NOT EXISTS promoter_rewards (
     id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     promoter_id   UUID NOT NULL REFERENCES promoters(id) ON DELETE CASCADE,
     student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     payment_id    UUID REFERENCES payments(id) ON DELETE SET NULL,
     amount_paid   NUMERIC(12,2) NOT NULL,
     currency      VARCHAR(10) NOT NULL,
     reward_pct    NUMERIC(5,2) NOT NULL,
     reward_amount NUMERIC(12,2) NOT NULL,
     status        VARCHAR(20) DEFAULT 'owed',
     paid_at       TIMESTAMPTZ,
     paid_note     TEXT,
     created_at    TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE (student_id)
   )`,

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
  /* Pay details per class, for the tutor's monthly pay sheet */
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS outcome        VARCHAR(30)`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS students_count INTEGER`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS student_names  TEXT`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS class_date     DATE`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS class_time     TIME`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS subject        TEXT`,
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS currency       VARCHAR(5)`,   /* NULL = before Naira pay (placeholder rates) */
  `ALTER TABLE tutor_earnings_log ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_earnings_log_tutor ON tutor_earnings_log(tutor_id, created_at)`,

  /* ── Class follow-up: first tutor join, and the 2-hour "please end the class" email ── */
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tutor_joined_at   TIMESTAMPTZ`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unended_warned_at TIMESTAMPTZ`,

  /* ── Late joins (one per class) ── */
  `ALTER TABLE late_joins ADD COLUMN IF NOT EXISTS class_start TIMESTAMPTZ`,
  `ALTER TABLE late_joins ADD COLUMN IF NOT EXISTS nth_in_month INTEGER`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_late_joins_booking_one ON late_joins(booking_id)`,
  `CREATE INDEX IF NOT EXISTS idx_late_joins_tutor ON late_joins(tutor_id, created_at)`,

  /* ── Credit activity log: payment details on each line ── */
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_id    UUID`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS amount_paid   NUMERIC(12,2)`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS currency      VARCHAR(5)`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS method        VARCHAR(30)`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS reference     TEXT`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS paid_at       DATE`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS balance_after INTEGER`,
  `ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS created_by    UUID`,
  `CREATE INDEX IF NOT EXISTS idx_credit_tx_booking ON credit_transactions(booking_id)`,

  /* ── Payments: provider (fincra / flutterwave / manual) and how it was paid ── */
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider  VARCHAR(20)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference VARCHAR(80)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS method    VARCHAR(30)`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at   DATE`,
  `ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind      VARCHAR(20)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference)`,
  `CREATE INDEX IF NOT EXISTS idx_payments_student   ON payments(student_id, created_at)`,
];

async function ensureSchema() {
  for (const sql of STATEMENTS) {
    try { await pool.query(sql); }
    catch (e) { logger.warn('[SCHEMA] ' + e.message + ' — ' + sql.replace(/\s+/g, ' ').slice(0, 80)); }
  }
}

module.exports = { ensureSchema };
