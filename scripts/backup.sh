#!/usr/bin/env bash
# Database backup: pg_dump in custom format, gzipped, timestamped, permissions 600, keeps the newest N.
#
#   DATABASE_URL=postgres://... scripts/backup.sh
#   # or through the compose stack (no local pg_dump needed):
#   PG_DUMP="docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_dump -U hm -d hm_internal" scripts/backup.sh
#
# Settings (environment):
#   BACKUP_DIR   where to write (default ./backups; created with mode 700)
#   BACKUP_KEEP  how many backups to keep, newest first (default 14); older ones are deleted
#   PG_DUMP      the pg_dump command including its connection options (default: pg_dump "$DATABASE_URL")
#
# Backups contain every record, including password hashes and salaries. Copy them OFF this host and keep
# them encrypted (see docs/DEPLOY.md); this script only writes local files.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
case "$BACKUP_KEEP" in '' | *[!0-9]* | 0) echo "BACKUP_KEEP must be a positive number" >&2; exit 2 ;; esac

if [ -n "${PG_DUMP:-}" ]; then
  dump=($PG_DUMP)
else
  : "${DATABASE_URL:?Set DATABASE_URL (or PG_DUMP)}"
  dump=(pg_dump "$DATABASE_URL")
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/hm-internal-$stamp.dump.gz"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

# Custom format without its own compression (gzip does that), no ownership/ACL statements so it restores
# into any database owned by any role.
"${dump[@]}" --format=custom --compress=0 --no-owner --no-acl | gzip -9 > "$partial"

# A dump that is empty or not valid gzip is a failed backup, not a backup.
if [ ! -s "$partial" ] || ! gzip -t "$partial"; then
  echo "Backup failed: the dump is empty or corrupt" >&2
  exit 1
fi
chmod 600 "$partial"
mv "$partial" "$final"
trap - EXIT
echo "Backup written: $final ($(wc -c < "$final") bytes)"

# Keep the newest BACKUP_KEEP backups.
mapfile -t all < <(ls -1 "$BACKUP_DIR"/hm-internal-*.dump.gz 2>/dev/null | sort -r)
if [ "${#all[@]}" -gt "$BACKUP_KEEP" ]; then
  for old in "${all[@]:$BACKUP_KEEP}"; do
    rm -f -- "$old"
    echo "Removed old backup: $old"
  done
fi
