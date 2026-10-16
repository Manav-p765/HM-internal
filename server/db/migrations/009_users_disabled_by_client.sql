-- Which client logins were disabled by their company's deactivation (not individually by an admin/manager).
-- Reactivating the company with restoreLogins re-enables only these; every reactivation clears the flag, and
-- an explicit status change through PATCH /api/users/:id clears it too.
ALTER TABLE users
  ADD COLUMN disabled_by_client_deactivation boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT users_disabled_by_client_check CHECK (
    NOT disabled_by_client_deactivation OR (status = 'disabled' AND client_id IS NOT NULL)
  );
