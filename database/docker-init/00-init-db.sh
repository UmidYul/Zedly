#!/usr/bin/env sh
set -eu

DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DUMP_OWNER_ROLE="${DUMP_OWNER_ROLE:-zedlyuz}"

echo "[docker-init] Initializing local database '${DB_NAME}'"

case "${DUMP_OWNER_ROLE}" in
  *[!a-zA-Z0-9_]*|'')
    echo "[docker-init] ERROR: DUMP_OWNER_ROLE must contain only [A-Za-z0-9_]." >&2
    exit 1
    ;;
esac

echo "[docker-init] Ensuring role '${DUMP_OWNER_ROLE}' exists for ownership statements in dump..."
psql -v ON_ERROR_STOP=1 --username "${DB_USER}" --dbname "${DB_NAME}" \
  -c "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${DUMP_OWNER_ROLE}') THEN CREATE ROLE \"${DUMP_OWNER_ROLE}\" LOGIN; END IF; END\$\$;"

if [ -f /docker-seed/dump.sql ]; then
  echo "[docker-init] Found /docker-seed/dump.sql, restoring local copy of prod backup..."
  # Drop ACL statements that often reference prod-only roles.
  sed -E '/^GRANT /d; /^REVOKE /d; /^ALTER DEFAULT PRIVILEGES /d' /docker-seed/dump.sql \
    | psql -v ON_ERROR_STOP=1 --username "${DB_USER}" --dbname "${DB_NAME}"
  echo "[docker-init] dump.sql restored successfully."
elif [ -f /docker-seed/dump.dump ]; then
  echo "[docker-init] Found /docker-seed/dump.dump, restoring via pg_restore..."
  pg_restore --no-owner --clean --if-exists --username "${DB_USER}" --dbname "${DB_NAME}" /docker-seed/dump.dump
  echo "[docker-init] dump.dump restored successfully."
elif [ -f /docker-seed/schema.sql ]; then
  echo "[docker-init] No dump found, applying /docker-seed/schema.sql..."
  psql -v ON_ERROR_STOP=1 --username "${DB_USER}" --dbname "${DB_NAME}" -f /docker-seed/schema.sql
  echo "[docker-init] schema.sql applied successfully."
else
  echo "[docker-init] ERROR: neither dump.sql/dump.dump nor schema.sql was found in /docker-seed." >&2
  exit 1
fi
