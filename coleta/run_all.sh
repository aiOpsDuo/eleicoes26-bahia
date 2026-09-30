#!/usr/bin/env bash
# Reconstrói o banco ba2026 do zero, só com fontes oficiais (ver coleta/COLETA.md).
#   1. baixar/   downloads com cache em $COLETA_CACHE (padrão .cache); o que já está no cache não é baixado de novo
#   2. montar/   monta as tabelas num DuckDB de trabalho ($COLETA_CACHE/trabalho.duckdb)
#   3. carregar/ recria o Postgres (dropdb --force derruba conexões abertas, ex.: a API), carrega, fotos, views, validação
#
# Uso: coleta/run_all.sh [--sem-baixar] [--so-baixar] [--forcar] [--dump]
#   --sem-baixar  usa só o que já está no cache (não acessa a rede)
#   --so-baixar   só a etapa 1
#   --forcar      rebaixa tudo (ignora o cache)
#   --dump        no fim, regrava db/ba2026.dump
set -euo pipefail
COLETA="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$COLETA/.." && pwd)"
export COLETA_CACHE="${COLETA_CACHE:-$RAIZ/.cache}"
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
[ -d "$PGBIN" ] && export PATH="$PGBIN:$PATH"
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-$USER}"
DB="${BA2026_DB:-ba2026}"
export BA2026_DSN="${BA2026_DSN:-host=$PGHOST port=$PGPORT dbname=$DB user=$PGUSER}"

if [ -z "${PYTHON:-}" ]; then
  if [ -x "$RAIZ/.venv/bin/python" ]; then PYTHON="$RAIZ/.venv/bin/python"; else PYTHON="python3"; fi
fi
SEM_BAIXAR=0; SO_BAIXAR=0; DUMP=0; FORCAR=""
for a in "$@"; do
  case "$a" in
    --sem-baixar) SEM_BAIXAR=1 ;; --so-baixar) SO_BAIXAR=1 ;; --dump) DUMP=1 ;; --forcar) FORCAR="--forcar" ;;
    *) echo "opção desconhecida: $a"; exit 2 ;;
  esac
done

for cmd in node unzip; do command -v "$cmd" >/dev/null || { echo "falta '$cmd' (ver COLETA.md, pré-requisitos)"; exit 1; }; done
"$PYTHON" -c "import duckdb, psycopg" 2>/dev/null || {
  echo "Python sem duckdb/psycopg. Crie o ambiente: python3 -m venv .venv && .venv/bin/pip install -r coleta/requirements.txt"; exit 1; }
echo "cache: $COLETA_CACHE | python: $PYTHON | banco: $DB"
t0=$(date +%s)

if [ "$SEM_BAIXAR" = 0 ]; then
  echo "== 1. download (fontes oficiais)"
  for s in tse camara senado portal transferegov ibge alba; do
    echo "-- $s"; node "$COLETA/baixar/$s.mjs" $FORCAR
  done
fi
[ "$SO_BAIXAR" = 1 ] && exit 0

echo "== 2. montagem (DuckDB de trabalho)"
rm -f "$COLETA_CACHE/trabalho.duckdb"
for s in 10_fontes 20_candidatos 30_tse 40_parlamentar; do
  echo "-- $s"; (cd "$COLETA/montar" && "$PYTHON" "$s.py")
done

echo "== 3. Postgres: recria $DB"
command -v psql >/dev/null || { echo "falta psql (Postgres 16+)"; exit 1; }
dropdb --if-exists --force "$DB"
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$RAIZ/db/schema.sql"
"$PYTHON" "$COLETA/carregar/90_carregar_pg.py"
"$PYTHON" "$COLETA/carregar/92_fotos_tse.py"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$RAIZ/db/views.sql"

echo "== 4. validação"
"$PYTHON" "$COLETA/carregar/95_validar.py"

if [ "$DUMP" = 1 ]; then
  pg_dump -d "$DB" -Fc --no-owner --no-privileges -f "$RAIZ/db/ba2026.dump"
  echo "dump: $RAIZ/db/ba2026.dump ($(du -h "$RAIZ/db/ba2026.dump" | cut -f1))"
fi
echo "fim ($(( $(date +%s) - t0 ))s)"
