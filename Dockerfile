# One image for the web app and the job worker. scripts/start.sh runs both; scripts/migrate.sh applies the schema.

FROM node:24-bookworm-slim AS web
WORKDIR /app/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build && npm prune --omit=dev

FROM python:3.12-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client libstdc++6 \
 && rm -rf /var/lib/apt/lists/*
# shortcut: uv and node are unpinned patch versions; pin digests if a build ever breaks on an upgrade
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=web /usr/local/bin/node /usr/local/bin/node

WORKDIR /app/worker
COPY worker/pyproject.toml worker/uv.lock ./
RUN UV_PYTHON_DOWNLOADS=never uv sync --frozen --no-dev --python /usr/local/bin/python3.12
COPY worker/*.py worker/statsbomb_ids.json ./

COPY --from=web /app/apps/web /app/apps/web
COPY docs/standards /app/docs/standards
COPY docs/import-csv.md /app/docs/import-csv.md
COPY supabase /app/supabase
COPY scripts /app/scripts

ENV NODE_ENV=production \
    STORAGE_DIR=/var/data \
    DOCS_DIR=/app/docs \
    PYTHONUNBUFFERED=1
WORKDIR /app
CMD ["/app/scripts/start.sh"]
