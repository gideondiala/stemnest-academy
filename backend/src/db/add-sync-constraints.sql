-- Add unique constraints needed for upsert operations
ALTER TABLE class_reports ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
ALTER TABLE class_reports DROP CONSTRAINT IF EXISTS class_reports_booking_id_key;
ALTER TABLE class_reports ADD CONSTRAINT IF NOT EXISTS class_reports_booking_id_key UNIQUE (booking_id);

ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS id UUID DEFAULT uuid_generate_v4();
ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_booking_id_key;
ALTER TABLE pipeline ADD CONSTRAINT IF NOT EXISTS pipeline_booking_id_key UNIQUE (booking_id);

-- Add index on late_joins for deduplication
CREATE INDEX IF NOT EXISTS idx_late_joins_booking ON late_joins(booking_id);
