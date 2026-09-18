-- Add applications table (run once)
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
