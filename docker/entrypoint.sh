#!/bin/sh
# Container entrypoint: one image, a few explicit commands. Configuration comes from the environment.
#   start                         run the server (default)
#   migrate                       apply pending migrations and exit (release step; never automatic)
#   create-admin --email ADDRESS  create the first admin (hidden prompt with -it, or password on stdin)
#   mail-test --to ADDRESS        send one test email through the configured SMTP
set -e
cd /app/server

cmd="${1:-start}"
[ $# -gt 0 ] && shift

case "$cmd" in
  start)        exec node dist/index.js "$@" ;;
  migrate)      exec node dist/scripts/migrate.js "$@" ;;
  create-admin) exec node dist/scripts/create-admin.js "$@" ;;
  mail-test)    exec node dist/scripts/mail-test.js "$@" ;;
  *)
    echo "Unknown command: $cmd (use start, migrate, create-admin or mail-test)" >&2
    exit 64
    ;;
esac
