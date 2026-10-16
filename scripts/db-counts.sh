#!/usr/bin/env bash
# Prints row counts of the main tables, to compare a restored database with its source.
#   scripts/db-counts.sh "postgres://..."            # or a database name with PSQL set (see restore.sh)
set -euo pipefail
target="${1:?Usage: scripts/db-counts.sh DATABASE}"
if [ -n "${PSQL:-}" ]; then psql_cmd=($PSQL); else psql_cmd=(psql); fi

"${psql_cmd[@]}" -d "$target" -X -A -t -F ' ' -v ON_ERROR_STOP=1 -c "
  SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'employees', count(*) FROM employees
  UNION ALL SELECT 'clients', count(*) FROM clients
  UNION ALL SELECT 'invoices', count(*) FROM invoices
  UNION ALL SELECT 'transactions', count(*) FROM transactions
  UNION ALL SELECT 'salaries', count(*) FROM salaries
  UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
  UNION ALL SELECT 'schema_migrations', count(*) FROM schema_migrations"
