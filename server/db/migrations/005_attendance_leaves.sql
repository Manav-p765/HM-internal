-- 005_attendance_leaves: daily attendance (automatic punch-in on login), presence (employees.last_seen_at)
-- and leave requests. "Today" is always the Asia/Kolkata date, computed by the server.
-- Availability (on_leave / online / available / not_in_today) is derived, never stored
-- (server/src/services/availability.ts).

-- ---------------------------------------------------------------------------
-- attendance_records: at most one row per employee per IST work date.
-- source 'login' = created by the automatic punch-in, 'manual' = created by an admin/manager correction.
-- updated_by is only set by a manual correction (the employee's own punch-out leaves it NULL),
-- so "corrected" = updated_by IS NOT NULL.
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date    date NOT NULL,
  punch_in     timestamptz NOT NULL,
  punch_out    timestamptz,
  source       text NOT NULL DEFAULT 'login' CHECK (source IN ('login', 'manual')),
  note         text,
  created_by   uuid REFERENCES users(id),
  updated_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_records_employee_date_key UNIQUE (employee_id, work_date),
  CONSTRAINT attendance_records_punch_order_check CHECK (punch_out IS NULL OR punch_out > punch_in)
);

CREATE INDEX attendance_records_work_date_idx  ON attendance_records (work_date);
CREATE INDEX attendance_records_created_by_idx ON attendance_records (created_by);
CREATE INDEX attendance_records_updated_by_idx ON attendance_records (updated_by);
-- employee_id is covered by the (employee_id, work_date) unique index.

CREATE TRIGGER attendance_records_set_updated_at BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Presence: the last heartbeat from the employee's browser (written at most every 30 s).
-- A heartbeat must not bump employees.updated_at, so the trigger now ignores updates that only touch
-- last_seen_at.
-- ---------------------------------------------------------------------------
ALTER TABLE employees ADD COLUMN last_seen_at timestamptz;

DROP TRIGGER employees_set_updated_at ON employees;
CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON employees FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'last_seen_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'last_seen_at' - 'updated_at'))
  EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- leave_requests. total_days counts weekdays only (a half day is 0.5) and is computed by the server.
-- ---------------------------------------------------------------------------
CREATE TABLE leave_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  leave_type        text NOT NULL CHECK (leave_type IN ('casual', 'sick', 'earned', 'unpaid', 'other')),
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  day_type          text NOT NULL DEFAULT 'full' CHECK (day_type IN ('full', 'half')),
  half_day_period   text CHECK (half_day_period IN ('first', 'second')),
  total_days        numeric(4,1) NOT NULL CHECK (total_days > 0),
  reason            text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by       uuid REFERENCES users(id),
  reviewed_at       timestamptz,
  reviewer_comment  text,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_requests_dates_check CHECK (end_date >= start_date),
  CONSTRAINT leave_requests_half_day_check CHECK (
    (day_type = 'full' AND half_day_period IS NULL) OR
    (day_type = 'half' AND half_day_period IS NOT NULL AND start_date = end_date)
  ),
  CONSTRAINT leave_requests_review_check CHECK (
    (status IN ('approved', 'rejected')) = (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CONSTRAINT leave_requests_rejection_check CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
);

CREATE INDEX leave_requests_employee_dates_idx ON leave_requests (employee_id, start_date, end_date);
CREATE INDEX leave_requests_status_idx         ON leave_requests (status);
CREATE INDEX leave_requests_reviewed_by_idx    ON leave_requests (reviewed_by);

CREATE TRIGGER leave_requests_set_updated_at BEFORE UPDATE ON leave_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
