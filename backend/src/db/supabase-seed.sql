-- Run with: psql "$DATABASE_URL" -v seed_password='<strong password>' -f supabase-seed.sql
-- (development only — never commit real passwords)
-- ═══════════════════════════════════════════════════════════════
-- StemNest Academy — Supabase Seed Data
-- Run this in Supabase SQL Editor AFTER supabase-setup.sql
-- Uses pgcrypto's crypt() to hash passwords directly in Postgres
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- STAFF USERS  (pgcrypto hashes passwords on the fly)
-- ─────────────────────────────────────────────

INSERT INTO users (name, email, password_hash, role, staff_id, email_verified, is_active)
VALUES

-- Founder / Super Admin  (password: set with -v seed_password=...)
('Founder',
 'founder@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'super_admin', 'FOUNDER001', TRUE, TRUE),

-- Admin  (password: set with -v seed_password=...)
('Admin',
 'admin@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'admin', 'ADMIN001', TRUE, TRUE),

-- Tutors  (password: set with -v seed_password=...)
('Sarah Rahman',
 'sarah.rahman@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'tutor', 'CT001', TRUE, TRUE),

('James Okafor',
 'james.okafor@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'tutor', 'MT001', TRUE, TRUE),

('Lisa Patel',
 'lisa.patel@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'tutor', 'ST001', TRUE, TRUE),

('Marcus King',
 'marcus.king@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'tutor', 'CT002', TRUE, TRUE),

-- Sales / Academic Counselor  (password: set with -v seed_password=...)
('Alex Johnson',
 'alex.johnson@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'sales', 'SP001', TRUE, TRUE),

-- Operations  (password: set with -v seed_password=...)
('Operations Team',
 'ops@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'operations', 'OPS001', TRUE, TRUE),

-- Pre-Sales  (password: set with -v seed_password=...)
('Pre-Sales Team',
 'presales@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'presales', 'PS001', TRUE, TRUE),

-- Post-Sales  (password: set with -v seed_password=...)
('Post-Sales Team',
 'postsales@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'postsales', 'POS001', TRUE, TRUE),

-- HR  (password: set with -v seed_password=...)
('HR Team',
 'hr@stemnestacademy.co.uk',
 crypt(:'seed_password', gen_salt('bf', 12)),
 'hr', 'HR001', TRUE, TRUE)

ON CONFLICT (email) DO UPDATE
  SET name           = EXCLUDED.name,
      password_hash  = EXCLUDED.password_hash,
      role           = EXCLUDED.role,
      staff_id       = EXCLUDED.staff_id,
      email_verified = TRUE,
      is_active      = TRUE;

-- ─────────────────────────────────────────────
-- TUTOR PROFILES
-- ─────────────────────────────────────────────
INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked)
SELECT id, 'Coding',
  ARRAY['Python for Beginners','Scratch & Game Design','Web Dev: HTML/CSS/JS'],
  ARRAY['Year 7–9','Year 10–11'], 'Mon–Fri, 9am–6pm', 'yes'
FROM users WHERE staff_id = 'CT001'
ON CONFLICT (user_id) DO UPDATE
  SET subject = EXCLUDED.subject, courses = EXCLUDED.courses;

INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked)
SELECT id, 'Maths',
  ARRAY['Primary Maths Boost','GCSE Maths Prep','A-Level Maths Mastery'],
  ARRAY['Year 7–9','Year 10–11'], 'Mon–Fri, 9am–6pm', 'yes'
FROM users WHERE staff_id = 'MT001'
ON CONFLICT (user_id) DO UPDATE
  SET subject = EXCLUDED.subject, courses = EXCLUDED.courses;

INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked)
SELECT id, 'Sciences',
  ARRAY['GCSE Biology','GCSE Chemistry','A-Level Physics'],
  ARRAY['Year 7–9','Year 10–11'], 'Mon–Fri, 9am–6pm', 'yes'
FROM users WHERE staff_id = 'ST001'
ON CONFLICT (user_id) DO UPDATE
  SET subject = EXCLUDED.subject, courses = EXCLUDED.courses;

INSERT INTO tutor_profiles (user_id, subject, courses, grade_groups, availability, dbs_checked)
SELECT id, 'Coding',
  ARRAY['Python for Beginners','AI Literacy','A-Level Computer Science'],
  ARRAY['Year 7–9','Year 10–11'], 'Mon–Fri, 9am–6pm', 'yes'
FROM users WHERE staff_id = 'CT002'
ON CONFLICT (user_id) DO UPDATE
  SET subject = EXCLUDED.subject, courses = EXCLUDED.courses;

-- ─────────────────────────────────────────────
-- VERIFY: should show 11 rows
-- ─────────────────────────────────────────────
SELECT staff_id, name, email, role, is_active
FROM users
ORDER BY created_at;

-- ═══════════════════════════════════════════════════════════════
-- SEED COMPLETE — 11 users expected in results above
-- Passwords:
--   founder@stemnestacademy.co.uk  →  the seed_password you pass to psql
--   admin@stemnestacademy.co.uk  →  the seed_password you pass to psql
--   everyone else  →  the seed_password you pass to psql
-- ═══════════════════════════════════════════════════════════════
