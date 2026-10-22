-- 014_client_task_requests: client users may request tasks on their own company's projects and assign them
-- to someone on that project's team (POST /api/portal/projects/:id/tasks). Such a task is always shared with
-- the client (client_visible) and flagged here, so staff can tell it apart and admins/managers are notified
-- (the bell lists requests nobody has started). Existing tasks were all created by staff.
ALTER TABLE tasks ADD COLUMN requested_by_client boolean NOT NULL DEFAULT false;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_client_request_visible_check CHECK (NOT requested_by_client OR client_visible);

-- The notification query: open client requests, newest first.
CREATE INDEX tasks_client_requests_idx ON tasks (created_at DESC) WHERE requested_by_client AND status = 'todo';
