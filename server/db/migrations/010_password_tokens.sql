-- One mechanism for every emailed password link: an invite (set the first password, 72 h) or a reset
-- (choose a new one, 1 h). Both open /set-password?token=...; only the SHA-256 hash of the token is stored.
-- Single use: used_at is set by the same UPDATE that checks it (WHERE used_at IS NULL AND expires_at > now()).
-- Rows are never edited after that, so there is no updated_at.
CREATE TABLE password_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose     text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX password_tokens_user_id_idx ON password_tokens (user_id);

-- Links already emailed keep working until they expire (only unused, unexpired ones are worth keeping).
INSERT INTO password_tokens (user_id, token_hash, purpose, expires_at, created_at)
SELECT user_id, token_hash, purpose, expires_at, created_at
  FROM auth_tokens
 WHERE used_at IS NULL AND expires_at > now() AND expires_at > created_at;

-- auth_tokens is replaced by password_tokens.
DROP TABLE auth_tokens;
