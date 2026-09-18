-- Fix existing demo bookings: extract studentName from JSON notes into lesson_name
UPDATE bookings
SET lesson_name = notes::json->>'studentName'
WHERE is_demo = TRUE
  AND (lesson_name IS NULL OR lesson_name = '')
  AND notes IS NOT NULL
  AND notes != ''
  AND notes LIKE '{%';
