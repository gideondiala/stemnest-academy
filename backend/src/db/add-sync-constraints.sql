-- Add unique constraints for upsert operations (safe to run multiple times)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_reports_booking_id_key'
  ) THEN
    ALTER TABLE class_reports ADD CONSTRAINT class_reports_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pipeline_booking_id_key'
  ) THEN
    ALTER TABLE pipeline ADD CONSTRAINT pipeline_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_late_joins_booking ON late_joins(booking_id);
