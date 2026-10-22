-- 016_manual_punch_in: employees punch in themselves (POST /api/attendance/me/punch-in) instead of being
-- punched in automatically at sign-in, which also fired when someone only opened the app outside their shift.
-- New source 'punch' = the employee's own Punch In button. Existing 'login' rows (the old automatic punch-in)
-- stay as they are; 'manual' is still an admin/manager correction.
-- Late (more than 30 min after the shift start) and outside-hours punches are derived from the employee's
-- working hours when read (services/attendance.ts, punchFlags), never stored.
ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_source_check;
ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_source_check CHECK (source IN ('login', 'manual', 'punch'));

-- Open records (forgot to punch out) are looked up for the bell and the review list.
CREATE INDEX attendance_records_open_idx ON attendance_records (work_date) WHERE punch_out IS NULL;
