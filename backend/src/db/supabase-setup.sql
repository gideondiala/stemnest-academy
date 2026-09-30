-- ═══════════════════════════════════════════════════════════════
-- StemNest Academy — Supabase Complete Database Setup
-- Paste this entire file into Supabase SQL Editor and click RUN
-- Safe to run multiple times (all statements use IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════

-- Extensions (already available in Supabase but safe to re-declare)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger function (needed by triggers below)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- USERS (all roles in one table)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(255) UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  role              VARCHAR(30) NOT NULL CHECK (role IN (
                      'student','tutor','admin','super_admin',
                      'sales','presales','postsales','operations','hr'
                    )),
  staff_id          VARCHAR(20) UNIQUE,
  phone             VARCHAR(30),
  whatsapp          VARCHAR(30),
  date_of_birth     DATE,
  photo_url         TEXT,
  bio               TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  email_verified    BOOLEAN DEFAULT FALSE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- PASSWORD RESET TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

-- ─────────────────────────────────────────────
-- EMAIL VERIFICATION TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

-- ─────────────────────────────────────────────
-- TUTOR PROFILES
-- ─────────────────────────────────────────────
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
  region        VARCHAR(100),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- STUDENT PROFILES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade             VARCHAR(30),
  age               VARCHAR(10),
  parent_name       VARCHAR(120),
  parent_email      VARCHAR(255),
  credits           INTEGER DEFAULT 0,
  credits_suspended BOOLEAN DEFAULT FALSE,
  class_paused      BOOLEAN DEFAULT FALSE,
  enrolled_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          VARCHAR(20) PRIMARY KEY,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  subject     VARCHAR(50) NOT NULL,
  level       VARCHAR(30),
  age_range   VARCHAR(50),
  price       NUMERIC(8,2) NOT NULL,
  num_classes INTEGER NOT NULL,
  duration    VARCHAR(50),
  rating      NUMERIC(3,1) DEFAULT 5.0,
  students    INTEGER DEFAULT 0,
  emoji       VARCHAR(10),
  color       VARCHAR(30),
  badge       VARCHAR(20),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_courses_updated_at ON courses;
CREATE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- LESSONS (per course)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id      VARCHAR(20) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_number  INTEGER NOT NULL,
  name           VARCHAR(200) NOT NULL,
  activity_link  TEXT,
  slides_link    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, lesson_number)
);
CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);

-- ─────────────────────────────────────────────
-- PATHWAYS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathways (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug               VARCHAR(100) UNIQUE NOT NULL,
  name               VARCHAR(200) NOT NULL,
  tagline            VARCHAR(300),
  intro              TEXT,
  description        TEXT,
  what_you_learn     TEXT[],
  career_outcomes    TEXT[],
  graduation_outcome TEXT,
  emoji              VARCHAR(10) DEFAULT '🚀',
  color              VARCHAR(30) DEFAULT 'blue',
  price              NUMERIC(8,2) NOT NULL DEFAULT 80.00,
  is_active          BOOLEAN DEFAULT TRUE,
  sort_order         INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_pathways_updated_at ON pathways;
CREATE TRIGGER trg_pathways_updated_at
  BEFORE UPDATE ON pathways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- PATHWAY GRADES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_grades (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pathway_id   UUID NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  grade_number INTEGER NOT NULL CHECK (grade_number BETWEEN 1 AND 12),
  name         VARCHAR(200),
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pathway_id, grade_number)
);
CREATE INDEX IF NOT EXISTS idx_pathway_grades_pathway ON pathway_grades(pathway_id);

-- ─────────────────────────────────────────────
-- PATHWAY UNITS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_units (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id     UUID NOT NULL REFERENCES pathway_grades(id) ON DELETE CASCADE,
  unit_number  INTEGER NOT NULL CHECK (unit_number BETWEEN 1 AND 8),
  name         VARCHAR(200),
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grade_id, unit_number)
);
CREATE INDEX IF NOT EXISTS idx_pathway_units_grade ON pathway_units(grade_id);

-- ─────────────────────────────────────────────
-- PATHWAY LESSONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_lessons (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id               UUID REFERENCES pathway_units(id) ON DELETE CASCADE,
  grade_id              UUID NOT NULL REFERENCES pathway_grades(id) ON DELETE CASCADE,
  lesson_number         INTEGER NOT NULL,
  lesson_number_in_unit INTEGER,
  session_type          VARCHAR(20) DEFAULT 'lesson'
                          CHECK (session_type IN ('lesson','flex','review','capstone')),
  title                 VARCHAR(300) NOT NULL,
  learning_objectives   TEXT,
  warm_up               TEXT,
  project_briefing      TEXT,
  concept_discovery     TEXT,
  task1_description     TEXT,
  task1_link            TEXT,
  task2_description     TEXT,
  task2_link            TEXT,
  debrief               TEXT,
  homework1             TEXT,
  homework2             TEXT,
  what_comes_next       TEXT,
  teacher_notes         TEXT,
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grade_id, lesson_number)
);
CREATE INDEX IF NOT EXISTS idx_pathway_lessons_unit  ON pathway_lessons(unit_id);
CREATE INDEX IF NOT EXISTS idx_pathway_lessons_grade ON pathway_lessons(grade_id);

DROP TRIGGER IF EXISTS trg_pathway_lessons_updated_at ON pathway_lessons;
CREATE TRIGGER trg_pathway_lessons_updated_at
  BEFORE UPDATE ON pathway_lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- PATHWAY QUIZZES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_quizzes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id     UUID NOT NULL REFERENCES pathway_units(id) ON DELETE CASCADE,
  title       VARCHAR(300),
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(unit_id)
);

-- ─────────────────────────────────────────────
-- PATHWAY QUIZ QUESTIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_quiz_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id         UUID NOT NULL REFERENCES pathway_quizzes(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text   TEXT NOT NULL,
  option_a        TEXT NOT NULL,
  option_b        TEXT NOT NULL,
  option_c        TEXT NOT NULL,
  option_d        TEXT NOT NULL,
  correct_answer  CHAR(1) NOT NULL CHECK (correct_answer IN ('a','b','c','d')),
  explanation     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quiz_id, question_number)
);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON pathway_quiz_questions(quiz_id);

-- ─────────────────────────────────────────────
-- ENROLLMENT REQUESTS (public website form)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_requests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_name    VARCHAR(120) NOT NULL,
  parent_name     VARCHAR(120),
  email           VARCHAR(255),
  whatsapp        VARCHAR(30),
  phone           VARCHAR(30),
  age             VARCHAR(10),
  grade           VARCHAR(30),
  gender          VARCHAR(20),
  country         VARCHAR(80),
  subject         VARCHAR(50),
  device          VARCHAR(50),
  timezone        VARCHAR(80),
  date            DATE,
  time            TIME,
  notes           TEXT,
  source          VARCHAR(50) DEFAULT 'website',
  status          VARCHAR(30) DEFAULT 'pending',
  pathway_id      UUID REFERENCES pathways(id) ON DELETE SET NULL,
  pathway_name    TEXT,
  grade_number    INTEGER,
  has_device      BOOLEAN,
  expected_start  DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enroll_req_email  ON enrollment_requests(email);
CREATE INDEX IF NOT EXISTS idx_enroll_req_status ON enrollment_requests(status);

-- ─────────────────────────────────────────────
-- ENROLMENTS (student enrolled in a course)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrolments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID NOT NULL REFERENCES users(id),
  course_id           VARCHAR(20) REFERENCES courses(id),
  tutor_id            UUID NOT NULL REFERENCES users(id),
  schedule            JSONB NOT NULL DEFAULT '[]',
  start_date          DATE NOT NULL,
  class_link          TEXT,
  total_lessons       INTEGER NOT NULL DEFAULT 0,
  status              VARCHAR(20) DEFAULT 'active',
  pathway_id          UUID REFERENCES pathways(id) ON DELETE SET NULL,
  current_grade       INTEGER DEFAULT 1,
  current_unit        INTEGER DEFAULT 1,
  lessons_completed   INTEGER DEFAULT 0,
  frequency_per_week  INTEGER DEFAULT 2,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_enrolments_student ON enrolments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tutor   ON enrolments(tutor_id);

-- ─────────────────────────────────────────────
-- BOOKINGS (individual class slots)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrolment_id            UUID REFERENCES enrolments(id),
  student_id              UUID REFERENCES users(id),
  tutor_id                UUID REFERENCES users(id),
  sales_id                UUID REFERENCES users(id),
  course_id               VARCHAR(20) REFERENCES courses(id),
  lesson_id               UUID REFERENCES lessons(id),
  lesson_number           INTEGER,
  lesson_name             VARCHAR(200),
  subject                 VARCHAR(50),
  grade                   VARCHAR(30),
  date                    DATE NOT NULL,
  time                    TIME NOT NULL,
  duration_mins           INTEGER DEFAULT 60,
  class_link              TEXT,
  activity_link           TEXT,
  slides_link             TEXT,
  status                  VARCHAR(30) DEFAULT 'pending'
                            CHECK (status IN ('pending','scheduled','completed','incomplete',
                                              'partially_completed','cancelled','teacher_absent')),
  is_demo                 BOOLEAN DEFAULT FALSE,
  is_recurring            BOOLEAN DEFAULT FALSE,
  payment_amount          NUMERIC(8,2),
  notes                   JSONB DEFAULT '{}',
  booked_at               TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at            TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  rescheduled_from        DATE,
  rescheduled_at          TIMESTAMPTZ,
  pathway_lesson_id       UUID REFERENCES pathway_lessons(id) ON DELETE SET NULL,
  lesson_number_in_grade  INTEGER,
  content_released        BOOLEAN DEFAULT FALSE,
  -- demo booking fields (no login required)
  student_name            VARCHAR(120),
  age                     VARCHAR(10),
  parent_name             VARCHAR(120),
  email                   VARCHAR(255),
  whatsapp                VARCHAR(30),
  country                 VARCHAR(80),
  timezone                VARCHAR(80),
  device                  VARCHAR(50),
  gender                  VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_bookings_student  ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tutor    ON bookings(tutor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_is_demo  ON bookings(is_demo);

-- ─────────────────────────────────────────────
-- CLASS REPORTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_reports (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID NOT NULL REFERENCES bookings(id),
  tutor_id          UUID NOT NULL REFERENCES users(id),
  outcome           VARCHAR(30) NOT NULL,
  class_quality     VARCHAR(30),
  student_interest  VARCHAR(30),
  purchasing_power  VARCHAR(20),
  incomplete_reason TEXT,
  notes             TEXT,
  recording_link    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint needed for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_reports_booking_id_key'
  ) THEN
    ALTER TABLE class_reports ADD CONSTRAINT class_reports_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- TUTOR AVAILABILITY
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_availability (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tutor_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  time_slot  TIME NOT NULL,
  is_booked  BOOLEAN DEFAULT FALSE,
  booking_id UUID REFERENCES bookings(id),
  UNIQUE(tutor_id, date, time_slot)
);
CREATE INDEX IF NOT EXISTS idx_avail_tutor ON tutor_availability(tutor_id);
CREATE INDEX IF NOT EXISTS idx_avail_date  ON tutor_availability(date);

-- ─────────────────────────────────────────────
-- CREDIT TRANSACTIONS (audit trail)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(30) NOT NULL,
  amount      INTEGER NOT NULL,
  description TEXT,
  booking_id  UUID REFERENCES bookings(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credits_student ON credit_transactions(student_id);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id          UUID REFERENCES users(id),
  sales_id            UUID REFERENCES users(id),
  amount              NUMERIC(10,2) NOT NULL,
  currency            VARCHAR(5) DEFAULT 'GBP',
  credits_purchased   INTEGER DEFAULT 0,
  course_id           VARCHAR(20) REFERENCES courses(id),
  stripe_payment_id   TEXT,
  stripe_session_id   TEXT,
  fincra_payment_id   TEXT,
  grey_reference      TEXT,
  status              VARCHAR(20) DEFAULT 'pending',
  payment_link        TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);

-- ─────────────────────────────────────────────
-- SALES PIPELINE
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pipeline (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id       UUID REFERENCES bookings(id),
  sales_id         UUID NOT NULL REFERENCES users(id),
  student_name     VARCHAR(120),
  subject          VARCHAR(50),
  course_pitched   VARCHAR(200),
  status           VARCHAR(30) DEFAULT 'pitched',
  interest_level   INTEGER CHECK (interest_level BETWEEN 1 AND 5),
  purchasing_power VARCHAR(20),
  payment_amount   NUMERIC(8,2),
  notes            TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_booking_id_key'
  ) THEN
    ALTER TABLE pipeline ADD CONSTRAINT pipeline_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- PROJECTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id   UUID NOT NULL REFERENCES users(id),
  tutor_id     UUID REFERENCES users(id),
  course_id    VARCHAR(20) REFERENCES courses(id),
  title        VARCHAR(200) NOT NULL,
  brief        TEXT,
  due_date     DATE,
  status       VARCHAR(20) DEFAULT 'pending'
                 CHECK (status IN ('pending','submitted','reviewed')),
  submission   TEXT,
  remarks      TEXT,
  score        INTEGER CHECK (score BETWEEN 0 AND 100),
  points       INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_student ON projects(student_id);
CREATE INDEX IF NOT EXISTS idx_projects_tutor   ON projects(tutor_id);

-- ─────────────────────────────────────────────
-- NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(200),
  body        TEXT,
  channel     VARCHAR(20) DEFAULT 'in_app',
  is_read     BOOLEAN DEFAULT FALSE,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);

-- ─────────────────────────────────────────────
-- EMAIL LOG
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_email    VARCHAR(255) NOT NULL,
  subject     VARCHAR(500),
  template    VARCHAR(100),
  status      VARCHAR(20) DEFAULT 'sent',
  provider    VARCHAR(30),
  message_id  TEXT,
  error       TEXT,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- LATE JOIN LOG
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS late_joins (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID NOT NULL REFERENCES bookings(id),
  tutor_id    UUID NOT NULL REFERENCES users(id),
  join_time   TIMESTAMPTZ NOT NULL,
  mins_late   INTEGER,
  penalty     NUMERIC(5,2) DEFAULT 0,
  pardoned    BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_late_joins_booking ON late_joins(booking_id);

-- ─────────────────────────────────────────────
-- APPLICATIONS (tutor job applications)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              VARCHAR(120) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  phone             VARCHAR(30),
  country           VARCHAR(80),
  qualification     VARCHAR(100),
  experience_years  VARCHAR(10),
  subjects          TEXT[],
  topics            TEXT,
  age_groups        TEXT[],
  hours_per_week    VARCHAR(20),
  preferred_times   VARCHAR(100),
  device            VARCHAR(20),
  bio               TEXT,
  linkedin          TEXT,
  source            VARCHAR(100),
  status            VARCHAR(30) DEFAULT 'pending',
  notes             TEXT,
  applied_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_email  ON applications(email);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_date   ON applications(applied_at);

-- ─────────────────────────────────────────────
-- INTERVIEWS (HR)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id  UUID REFERENCES applications(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  subjects      TEXT[] DEFAULT '{}',
  date          DATE NOT NULL,
  time          VARCHAR(50) NOT NULL,
  status        VARCHAR(50) DEFAULT 'scheduled',
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- TRAININGS (HR)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee    VARCHAR(255) NOT NULL,
  title      VARCHAR(255) NOT NULL,
  date       DATE NOT NULL,
  duration   VARCHAR(100),
  notes      TEXT,
  status     VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- JOB ADVERTS (HR)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_adverts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255) NOT NULL,
  subject     VARCHAR(255),
  pay         VARCHAR(100),
  description TEXT,
  deadline    DATE,
  status      VARCHAR(50) DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────
-- BLOG POSTS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blog_posts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         VARCHAR(300) UNIQUE NOT NULL,
  title        VARCHAR(500) NOT NULL,
  excerpt      TEXT,
  content      TEXT,
  author_id    UUID REFERENCES users(id),
  author_name  VARCHAR(120),
  category     VARCHAR(50),
  tags         TEXT[],
  cover_image  TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_blog_updated_at ON blog_posts;
CREATE TRIGGER trg_blog_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- GROUP BATCHES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batches (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(200) NOT NULL,
  course_id        VARCHAR(20) REFERENCES courses(id),
  tutor_id         UUID REFERENCES users(id),
  schedule         JSONB NOT NULL DEFAULT '[]',
  start_date       DATE,
  class_link       TEXT,
  max_students     INTEGER DEFAULT 4,
  status           VARCHAR(20) DEFAULT 'active',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS batch_students (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id   UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(batch_id, student_id)
);

-- ─────────────────────────────────────────────
-- QUIZZES (standalone, non-pathway)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id   VARCHAR(20) REFERENCES courses(id),
  title       VARCHAR(300) NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CERTIFICATES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES users(id),
  course_id       VARCHAR(20) REFERENCES courses(id),
  pathway_id      UUID REFERENCES pathways(id),
  title           VARCHAR(300),
  issued_at       TIMESTAMPTZ DEFAULT NOW(),
  certificate_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates(student_id);

-- ═══════════════════════════════════════════════════════════════
-- DONE — All tables created successfully
-- Next step: run the seed SQL below to create staff accounts
-- ═══════════════════════════════════════════════════════════════
