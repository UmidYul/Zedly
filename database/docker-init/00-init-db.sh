#!/bin/sh
set -eu

DB_NAME="${POSTGRES_DB:-postgres}"
DB_USER="${POSTGRES_USER:-postgres}"
DUMP_OWNER_ROLE="${DUMP_OWNER_ROLE:-zedlyuz}"

echo "[docker-init] Initializing local database '${DB_NAME}'"

ensure_role_exists() {
  role_name="$1"

  case "${role_name}" in
    *[!a-zA-Z0-9_]*|'')
      echo "[docker-init] ERROR: role '${role_name}' must contain only [A-Za-z0-9_]." >&2
      exit 1
      ;;
  esac

  echo "[docker-init] Ensuring role '${role_name}' exists..."
  psql -v ON_ERROR_STOP=1 --username "${DB_USER}" --dbname "${DB_NAME}" \
    -c "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role_name}') THEN CREATE ROLE \"${role_name}\" LOGIN; END IF; END\$\$;"
}

ensure_role_exists "${DUMP_OWNER_ROLE}"
# Some prod dumps contain OWNER TO postgres statements.
ensure_role_exists "postgres"

if [ -f /docker-seed/dump.sql ]; then
  echo "[docker-init] Found /docker-seed/dump.sql, restoring local copy of prod backup..."
  # Drop statements that commonly fail on local restore from prod dump.
  sed -E '/^GRANT /d; /^REVOKE /d; /^ALTER DEFAULT PRIVILEGES /d; /^CREATE SCHEMA public;/d' /docker-seed/dump.sql \
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
