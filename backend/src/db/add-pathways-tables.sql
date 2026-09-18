-- ═══════════════════════════════════════════════════════════════
-- StemNest Academy — Career Pathways Migration
-- Run once: psql $DATABASE_URL -f add-pathways-tables.sql
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- PATHWAYS (top-level career pathway)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathways (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug            VARCHAR(100) UNIQUE NOT NULL,   -- e.g. 'data-science-analytics'
  name            VARCHAR(200) NOT NULL,           -- e.g. 'Data Science & Analytics'
  tagline         VARCHAR(300),                    -- e.g. 'Become a Data Scientist'
  intro           TEXT,                            -- short intro sentence
  description     TEXT,                            -- full description paragraph
  what_you_learn  TEXT[],                          -- array of bullet points
  career_outcomes TEXT[],                          -- array of career titles
  graduation_outcome TEXT,
  emoji           VARCHAR(10) DEFAULT '🚀',
  color           VARCHAR(30) DEFAULT 'blue',
  price           NUMERIC(8,2) NOT NULL DEFAULT 80.00,
  is_active       BOOLEAN DEFAULT TRUE,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PATHWAY GRADES (grade 1–12 under each pathway)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_grades (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pathway_id   UUID NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  grade_number INTEGER NOT NULL CHECK (grade_number BETWEEN 1 AND 12),
  name         VARCHAR(200),   -- e.g. 'Grade 5 — Data Foundations'
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pathway_id, grade_number)
);

CREATE INDEX IF NOT EXISTS idx_pathway_grades_pathway ON pathway_grades(pathway_id);

-- ─────────────────────────────────────────────
-- PATHWAY UNITS (8 units per grade)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_units (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grade_id     UUID NOT NULL REFERENCES pathway_grades(id) ON DELETE CASCADE,
  unit_number  INTEGER NOT NULL CHECK (unit_number BETWEEN 1 AND 8),
  name         VARCHAR(200),   -- e.g. 'Unit 1 — Introduction to Data'
  description  TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grade_id, unit_number)
);

CREATE INDEX IF NOT EXISTS idx_pathway_units_grade ON pathway_units(grade_id);

-- ─────────────────────────────────────────────
-- PATHWAY LESSONS (lessons per unit + special sessions)
-- session_type: 'lesson' | 'flex' | 'review' | 'capstone'
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pathway_lessons (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id               UUID REFERENCES pathway_units(id) ON DELETE CASCADE,
  grade_id              UUID NOT NULL REFERENCES pathway_grades(id) ON DELETE CASCADE,
  lesson_number         INTEGER NOT NULL,   -- sequential within grade (1–72)
  lesson_number_in_unit INTEGER,            -- 1–8 within unit (null for special sessions)
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

-- ─────────────────────────────────────────────
-- PATHWAY QUIZZES (one optional quiz per unit)
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
-- PATHWAY QUIZ QUESTIONS (20 per quiz)
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
-- ADD PATHWAY COLUMNS TO EXISTING TABLES
-- ─────────────────────────────────────────────

-- enrollment_requests: add pathway info + new form fields
ALTER TABLE enrollment_requests
  ADD COLUMN IF NOT EXISTS pathway_id       UUID REFERENCES pathways(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pathway_name     TEXT,
  ADD COLUMN IF NOT EXISTS grade_number     INTEGER,
  ADD COLUMN IF NOT EXISTS has_device       BOOLEAN,
  ADD COLUMN IF NOT EXISTS expected_start   DATE;

-- enrolments: track which pathway/grade/unit student is on
ALTER TABLE enrolments
  ADD COLUMN IF NOT EXISTS pathway_id         UUID REFERENCES pathways(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_grade      INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS current_unit       INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lessons_completed  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frequency_per_week INTEGER DEFAULT 2;

-- bookings: link to pathway lesson
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pathway_lesson_id      UUID REFERENCES pathway_lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lesson_number_in_grade INTEGER,
  ADD COLUMN IF NOT EXISTS content_released       BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger for new tables
-- ─────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_pathways_updated_at
  BEFORE UPDATE ON pathways
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_pathway_lessons_updated_at
  BEFORE UPDATE ON pathway_lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
