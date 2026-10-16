#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into a database, then prints its row counts.
#
#   scripts/restore.sh backups/hm-internal-20261016T030000Z.dump.gz "postgres://hm:...@host/hm_restore_check"
#   # or through the compose stack (target is a database name inside the db container):
#   PG_RESTORE="docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_restore -U hm" \
#   PSQL="docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db psql -U hm" \
#     scripts/restore.sh backups/hm-internal-....dump.gz hm_restore_check
#
# The target database must already exist (createdb). Restoring is destructive for the target: objects that
# exist in the backup are dropped and recreated (--clean --if-exists). Rehearse into a scratch database
# first; restore over production only as part of a planned rollback (docs/DEPLOY.md).
set -euo pipefail

file="${1:?Usage: scripts/restore.sh BACKUP_FILE TARGET_DATABASE}"
target="${2:?Usage: scripts/restore.sh BACKUP_FILE TARGET_DATABASE}"
[ -f "$file" ] || { echo "No such backup: $file" >&2; exit 2; }
gzip -t "$file" || { echo "Not a valid gzip file: $file" >&2; exit 2; }

if [ -n "${PG_RESTORE:-}" ]; then restore=($PG_RESTORE); else restore=(pg_restore); fi

echo "Restoring $file into $target ..."
gunzip -c "$file" | "${restore[@]}" --clean --if-exists --no-owner --no-acl --exit-on-error -d "$target"
echo "Restore finished."

"$(dirname "$0")/db-counts.sh" "$target"
