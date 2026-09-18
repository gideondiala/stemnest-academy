-- ═══════════════════════════════════════════════════════════════
-- StemNest Academy — PostgreSQL Database Schema
-- Run once on a fresh database: psql $DATABASE_URL -f schema.sql
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  staff_id          VARCHAR(20) UNIQUE,          -- e.g. CT001, SP001, S-0001
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
-- REFRESH TOKENS (for persistent sessions)
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
-- TUTOR PROFILES (extends users for tutors)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tutor_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject       VARCHAR(50),
  courses       TEXT[],                -- array of course names
  grade_groups  TEXT[],
  availability  VARCHAR(100),
  dbs_checked   VARCHAR(20) DEFAULT 'pending',
  color         VARCHAR(100),
  earnings      NUMERIC(10,2) DEFAULT 0,
  points        INTEGER DEFAULT 0,
  classes_done  INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- STUDENT PROFILES (extends users for students)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  grade         VARCHAR(30),
  age           VARCHAR(10),
  parent_name   VARCHAR(120),
  parent_email  VARCHAR(255),
  credits       INTEGER DEFAULT 0,
  enrolled_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- COURSES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id          VARCHAR(20) PRIMARY KEY,           -- e.g. CRS001
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
-- ENROLMENTS (student enrolled in a course)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrolments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id    UUID NOT NULL REFERENCES users(id),
  course_id     VARCHAR(20) NOT NULL REFERENCES courses(id),
  tutor_id      UUID NOT NULL REFERENCES users(id),
  schedule      JSONB NOT NULL,               -- [{weekday:1, time:"18:00"}, ...]
  start_date    DATE NOT NULL,
  class_link    TEXT,
  total_lessons INTEGER NOT NULL,
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrolments_student ON enrolments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrolments_tutor   ON enrolments(tutor_id);

-- ─────────────────────────────────────────────
-- BOOKINGS (individual class slots)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrolment_id     UUID REFERENCES enrolments(id),
  student_id       UUID REFERENCES users(id),
  tutor_id         UUID REFERENCES users(id),
  sales_id         UUID REFERENCES users(id),
  course_id        VARCHAR(20) REFERENCES courses(id),
  lesson_id        UUID REFERENCES lessons(id),
  lesson_number    INTEGER,
  lesson_name      VARCHAR(200),
  subject          VARCHAR(50),
  grade            VARCHAR(30),
  date             DATE NOT NULL,
  time             TIME NOT NULL,
  duration_mins    INTEGER DEFAULT 60,
  class_link       TEXT,
  activity_link    TEXT,
  slides_link      TEXT,
  status           VARCHAR(30) DEFAULT 'pending'
                     CHECK (status IN ('pending','scheduled','completed','incomplete',
                                       'partially_completed','cancelled','teacher_absent')),
  is_demo          BOOLEAN DEFAULT FALSE,
  is_recurring     BOOLEAN DEFAULT FALSE,
  payment_amount   NUMERIC(8,2),
  notes            TEXT,
  booked_at        TIMESTAMPTZ DEFAULT NOW(),
  scheduled_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  rescheduled_from DATE,
  rescheduled_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bookings_student  ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_tutor    ON bookings(tutor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);

-- ─────────────────────────────────────────────
-- CLASS REPORTS (teacher end-of-class report)
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

-- ─────────────────────────────────────────────
-- TUTOR AVAILABILITY (calendar slots)
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
-- CREDITS LOG (append-only audit trail)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id  UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(30) NOT NULL,   -- 'topup', 'class_deduction', 'refund', 'bonus'
  amount      INTEGER NOT NULL,       -- positive = add, negative = deduct
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
-- NOTIFICATIONS (in-app + email log)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       VARCHAR(200),
  body        TEXT,
  channel     VARCHAR(20) DEFAULT 'in_app',  -- 'in_app','email','whatsapp','sms'
  is_read     BOOLEAN DEFAULT FALSE,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);

-- ─────────────────────────────────────────────
-- EMAIL LOG (audit trail of all sent emails)
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

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger function
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_blog_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TABLE IF NOT EXISTS interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID REFERENCES applications(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subjects TEXT[] DEFAULT '{}',
  date DATE NOT NULL,
  time VARCHAR(50) NOT NULL,
  status VARCHAR(50) DEFAULT 'scheduled',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trainings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainee VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  duration VARCHAR(100),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_adverts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  pay VARCHAR(100),
  description TEXT,
  deadline DATE,
  status VARCHAR(50) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
- -   A d d   a p p l i c a t i o n s   t a b l e   ( r u n   o n c e )  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   a p p l i c a t i o n s   (  
     i d                                 U U I D   P R I M A R Y   K E Y   D E F A U L T   u u i d _ g e n e r a t e _ v 4 ( ) ,  
     n a m e                             V A R C H A R ( 1 2 0 )   N O T   N U L L ,  
     e m a i l                           V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     p h o n e                           V A R C H A R ( 3 0 ) ,  
     c o u n t r y                       V A R C H A R ( 8 0 ) ,  
     q u a l i f i c a t i o n           V A R C H A R ( 1 0 0 ) ,  
     e x p e r i e n c e _ y e a r s     V A R C H A R ( 1 0 ) ,  
     s u b j e c t s                     T E X T [ ] ,  
     t o p i c s                         T E X T ,  
     a g e _ g r o u p s                 T E X T [ ] ,  
     h o u r s _ p e r _ w e e k         V A R C H A R ( 2 0 ) ,  
     p r e f e r r e d _ t i m e s       V A R C H A R ( 1 0 0 ) ,  
     d e v i c e                         V A R C H A R ( 2 0 ) ,  
     b i o                               T E X T ,  
     l i n k e d i n                     T E X T ,  
     s o u r c e                         V A R C H A R ( 1 0 0 ) ,  
     s t a t u s                         V A R C H A R ( 3 0 )   D E F A U L T   ' p e n d i n g ' ,  
     n o t e s                           T E X T ,  
     a p p l i e d _ a t                 T I M E S T A M P T Z   D E F A U L T   N O W ( ) ,  
     u p d a t e d _ a t                 T I M E S T A M P T Z   D E F A U L T   N O W ( )  
 ) ;  
  
 C R E A T E   I N D E X   I F   N O T   E X I S T S   i d x _ a p p l i c a t i o n s _ e m a i l     O N   a p p l i c a t i o n s ( e m a i l ) ;  
 C R E A T E   I N D E X   I F   N O T   E X I S T S   i d x _ a p p l i c a t i o n s _ s t a t u s   O N   a p p l i c a t i o n s ( s t a t u s ) ;  
 C R E A T E   I N D E X   I F   N O T   E X I S T S   i d x _ a p p l i c a t i o n s _ d a t e       O N   a p p l i c a t i o n s ( a p p l i e d _ a t ) ;  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   i n t e r v i e w s   (  
     i d   U U I D   P R I M A R Y   K E Y   D E F A U L T   g e n _ r a n d o m _ u u i d ( ) ,  
     a p p l i c a n t _ i d   U U I D   R E F E R E N C E S   a p p l i c a t i o n s ( i d )   O N   D E L E T E   C A S C A D E ,  
     n a m e   V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     e m a i l   V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     s u b j e c t s   T E X T [ ]   D E F A U L T   ' { } ' ,  
     d a t e   D A T E   N O T   N U L L ,  
     t i m e   V A R C H A R ( 5 0 )   N O T   N U L L ,  
     s t a t u s   V A R C H A R ( 5 0 )   D E F A U L T   ' s c h e d u l e d ' ,  
     c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
     u p d a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P  
 ) ;  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   t r a i n i n g s   (  
     i d   U U I D   P R I M A R Y   K E Y   D E F A U L T   g e n _ r a n d o m _ u u i d ( ) ,  
     t r a i n e e   V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     t i t l e   V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     d a t e   D A T E   N O T   N U L L ,  
     d u r a t i o n   V A R C H A R ( 1 0 0 ) ,  
     n o t e s   T E X T ,  
     s t a t u s   V A R C H A R ( 5 0 )   D E F A U L T   ' a c t i v e ' ,  
     c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
     u p d a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P  
 ) ;  
  
 C R E A T E   T A B L E   I F   N O T   E X I S T S   j o b _ a d v e r t s   (  
     i d   U U I D   P R I M A R Y   K E Y   D E F A U L T   g e n _ r a n d o m _ u u i d ( ) ,  
     t i t l e   V A R C H A R ( 2 5 5 )   N O T   N U L L ,  
     s u b j e c t   V A R C H A R ( 2 5 5 ) ,  
     p a y   V A R C H A R ( 1 0 0 ) ,  
     d e s c r i p t i o n   T E X T ,  
     d e a d l i n e   D A T E ,  
     s t a t u s   V A R C H A R ( 5 0 )   D E F A U L T   ' o p e n ' ,  
     c r e a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P ,  
     u p d a t e d _ a t   T I M E S T A M P   D E F A U L T   C U R R E N T _ T I M E S T A M P  
 ) ;  
 