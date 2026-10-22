-- 015_notifications: in-app notifications for staff logins. For now one kind: "a task was assigned to you"
-- (by a manager, a colleague or a client request). Written when the assignee is set or changed, for every
-- staff login linked to the assignee's employee record, never for the person who made the change.
-- Due-soon and overdue reminders are derived from tasks when the bell is read, never stored here.
CREATE TABLE notifications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('task_assigned')),
  task_id        uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_idx   ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX notifications_task_idx   ON notifications (task_id);
CREATE INDEX notifications_actor_idx  ON notifications (actor_user_id);

CREATE TRIGGER notifications_set_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
