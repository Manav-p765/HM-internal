-- 012_employee_working_hours: each employee's shift, in IST wall-clock time. Most shifts are at night
-- (overseas clients), so the end may be earlier than the start (21:00 -> 06:00 runs overnight). Both are
-- NULL for employees created before working hours existed: attendance then falls back to the default
-- working day (06:00-05:59 IST) and admins are reminded to set them. New employees always get both
-- (the API requires them). The buffers around a shift (sign in early, sign out late) are fixed in code
-- (services/attendance.ts), not stored per employee.
ALTER TABLE employees
  ADD COLUMN shift_start time,
  ADD COLUMN shift_end time,
  ADD CONSTRAINT employees_shift_check CHECK (
    (shift_start IS NULL AND shift_end IS NULL)
    OR (shift_start IS NOT NULL AND shift_end IS NOT NULL AND shift_start <> shift_end)
  );
