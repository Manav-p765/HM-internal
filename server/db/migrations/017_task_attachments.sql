-- 017_task_attachments: files and links on a task (a brief, a report, reference links), added when the task is
-- created or later. Files are kept in the database (bytea, at most 10 MB each, a fixed list of document and
-- image types; the API checks both), links are http(s) URLs. Staff only: the client portal never lists them.
-- Added and removed by the assignee, the person who assigned the task, or an admin/manager; any staff member
-- who can open the task can download them. Deleted with their task.
CREATE TABLE task_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('file', 'link')),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  url           text CHECK (url IS NULL OR (url ~ '^https?://' AND char_length(url) <= 2000)),
  content_type  text,
  size_bytes    integer CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 10485760),
  data          bytea,
  uploaded_by   uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_attachments_shape_check CHECK (
    (kind = 'file' AND data IS NOT NULL AND content_type IS NOT NULL AND size_bytes = octet_length(data) AND url IS NULL)
    OR (kind = 'link' AND url IS NOT NULL AND data IS NULL AND content_type IS NULL AND size_bytes IS NULL)
  )
);

CREATE INDEX task_attachments_task_idx     ON task_attachments (task_id, created_at);
CREATE INDEX task_attachments_uploader_idx ON task_attachments (uploaded_by);

CREATE TRIGGER task_attachments_set_updated_at BEFORE UPDATE ON task_attachments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
