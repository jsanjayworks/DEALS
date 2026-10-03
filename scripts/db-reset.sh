#!/usr/bin/env bash
# Rebuilds the local test database from scratch and applies every migration in
# order, stopping at the first error.
#
#   docker run -d --name yolo-pg -e POSTGRES_PASSWORD=yolo -e POSTGRES_DB=yolo \
#     -p 55432:5432 postgis/postgis:16-3.4
#   bash scripts/db-reset.sh
#
# The stub in supabase/local is local-only; it fakes the auth schema and the
# anon / authenticated roles that Supabase provides for real.
set -uo pipefail

CONTAINER="${YOLO_PG_CONTAINER:-yolo-pg}"
DB="${YOLO_PG_DB:-yolo}"
USER_="${YOLO_PG_USER:-postgres}"

psql_file() {
  docker exec -i "$CONTAINER" psql -U "$USER_" -d "$DB" -v ON_ERROR_STOP=1 -q < "$1"
}

echo "Dropping and recreating schemas..."
docker exec -i "$CONTAINER" psql -U "$USER_" -d "$DB" -q <<'SQL'
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
SQL

# The stub stands in for what Supabase provides, then every migration in order.
FILES=(supabase/local/00_supabase_stub.sql)
for m in supabase/migrations/*.sql; do
  FILES+=("$m")
done

# The seed is not a migration: Supabase never runs seed.sql against production,
# only locally and on preview branches. Applied last, when present.
for extra in supabase/seed.sql; do
  [ -f "$extra" ] && FILES+=("$extra")
done

for f in "${FILES[@]}"; do
  printf '%-52s' "$f"
  out="$(psql_file "$f" 2>&1)"
  code=$?
  if [ $code -eq 0 ]; then
    echo "ok"
  else
    echo "FAILED"
    echo "$out" | grep -E '^(ERROR|DETAIL|HINT|LINE|CONTEXT)' | head -12
    exit $code
  fi
done

echo
docker exec -i "$CONTAINER" psql -U "$USER_" -d "$DB" -tA <<'SQL'
select 'tables     ' || count(*) from pg_tables where schemaname='public';
select 'functions  ' || count(*) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';
select 'policies   ' || count(*) from pg_policies where schemaname='public';
select 'indexes    ' || count(*) from pg_indexes where schemaname='public';
select 'rls tables ' || count(*) from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relrowsecurity;
SQL
