-- 004_projects_tasks: projects (optionally for a client company), their team, tasks and task comments.
-- Names (project, assignee, client) are never copied onto tasks: always join.
-- "Overdue" is derived, never stored: status <> 'completed' AND deadline < today in Asia/Kolkata.

CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  client_id    uuid REFERENCES clients(id) ON DELETE RESTRICT,   -- NULL = internal project
  start_date   date,
  deadline     date,
  status       text NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'active', 'on_hold', 'completed', 'archived')),
  created_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_dates_check CHECK (deadline IS NULL OR start_date IS NULL OR deadline >= start_date)
);

-- Team membership. No timestamps beyond created_at: rows are only inserted and deleted.
CREATE TABLE project_members (
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, employee_id)
);

CREATE TABLE tasks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code             text NOT NULL UNIQUE,                       -- TSK-001, assigned by the server
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  title                 text NOT NULL,
  description           text,
  assignee_employee_id  uuid REFERENCES employees(id) ON DELETE RESTRICT,
  start_date            date,
  deadline              date,
  priority              text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status                text NOT NULL DEFAULT 'todo'
                          CHECK (status IN ('todo', 'in_progress', 'in_review', 'completed', 'blocked')),
  client_visible        boolean NOT NULL DEFAULT false,
  completed_at          timestamptz,
  completion_comment    text,                                       -- internal; never sent to clients
  created_by            uuid NOT NULL REFERENCES users(id),
  updated_by            uuid REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_dates_check CHECK (deadline IS NULL OR start_date IS NULL OR deadline >= start_date),
  CONSTRAINT tasks_completed_at_check CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

-- Append-only thread on a task (no updated_at; comments are created and deleted, never edited).
CREATE TABLE task_comments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES users(id),
  comment_type    text NOT NULL DEFAULT 'internal_note' CHECK (comment_type IN ('internal_note', 'client_feedback')),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_client_id_idx          ON projects (client_id);
CREATE INDEX projects_status_idx             ON projects (status);
CREATE INDEX projects_created_by_idx         ON projects (created_by);
CREATE INDEX project_members_employee_id_idx ON project_members (employee_id);
CREATE INDEX tasks_project_id_idx            ON tasks (project_id);
CREATE INDEX tasks_assignee_employee_id_idx  ON tasks (assignee_employee_id);
CREATE INDEX tasks_status_idx                ON tasks (status);
CREATE INDEX tasks_deadline_idx              ON tasks (deadline);
CREATE INDEX tasks_created_by_idx            ON tasks (created_by);
CREATE INDEX tasks_updated_by_idx            ON tasks (updated_by);
CREATE INDEX task_comments_task_id_idx       ON task_comments (task_id, created_at);
CREATE INDEX task_comments_author_idx        ON task_comments (author_user_id);

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tasks_set_updated_at    BEFORE UPDATE ON tasks    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
