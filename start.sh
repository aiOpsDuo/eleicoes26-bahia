#!/usr/bin/env bash
# Sobe o site em modo "produção" numa porta só: build do front (web/dist) + API servindo o estático e /api.
#   start.sh               -> http://localhost:3333
#   PORT=8080 start.sh     -> outra porta
#   start.sh --sem-build   -> reaproveita o dist/ existente
# Requer Node 20+ e o Postgres com o banco ba2026 (ver README: coleta/run_all.sh ou restore do db/ba2026.dump).
set -euo pipefail
cd "$(dirname "$0")"
[ -d api/node_modules ] || npm --prefix api ci --no-audit --no-fund
if [ "${1:-}" != "--sem-build" ]; then
  [ -d web/node_modules ] || npm --prefix web ci --no-audit --no-fund
  npm --prefix web run build
fi
export NODE_ENV=production
exec node api/server.js
