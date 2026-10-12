-- 002_audit_logs: append-only accountability log (no updated_at: rows are never changed).

CREATE TABLE audit_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,  -- null for anonymous/system actions
  action         text NOT NULL,                                 -- e.g. auth.login_success, user.created
  entity_type    text,
  entity_id      text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip             text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx      ON audit_logs (actor_user_id);
CREATE INDEX audit_logs_entity_idx     ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_action_idx     ON audit_logs (action);
