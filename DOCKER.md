# Docker setup (local isolated DB)

This Docker configuration is for local development only:
- `backend` (Node.js API + static frontend)
- `db` (PostgreSQL 16, isolated local container/volume)

## Why this is safe for prod

- Local Docker DB has separate defaults (`zedly_local`, port `5433`).
- Local config lives in `.env.docker.local` (gitignored).
- Pushing these files to GitHub does not modify production DB by itself.

## Local env file

Copy `.env.docker.example` to `.env.docker.local` and edit values if needed.

```bash
cp .env.docker.example .env.docker.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.docker.example .env.docker.local
```

On Windows `cmd.exe`:

```bat
copy .env.docker.example .env.docker.local
```

## Start

```bash
docker compose --env-file .env.docker.local up --build -d
```

Open:
- `http://localhost:5000`

## DB initialization logic (first start only)

When DB volume is empty, container runs init script:
1. If `database/dump.sql` exists, restores from it.
2. Else if `database/dump.dump` exists, restores via `pg_restore`.
3. Else applies `database/schema.sql`.

If dump contains `OWNER TO ...` statements, role is auto-created from `ZEDLY_DUMP_OWNER_ROLE` (default: `zedlyuz`).

## Re-import dump.sql again

Because init runs only on empty volume, to re-import:

```bash
docker compose --env-file .env.docker.local down -v
docker compose --env-file .env.docker.local up --build -d
```

## Useful commands

```bash
docker compose --env-file .env.docker.local logs -f backend
docker compose --env-file .env.docker.local logs -f db
docker compose --env-file .env.docker.local down
```
