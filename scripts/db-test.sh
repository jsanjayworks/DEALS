#!/usr/bin/env bash
# Runs the backend test suites against the local container.
# NOTE: both suites mutate state; use scripts/db-verify.sh for a clean run.
set -uo pipefail
CONTAINER="${YOLO_PG_CONTAINER:-yolo-pg}"
status=0
for f in supabase/local/01_smoke_test.sql supabase/local/02_rls_test.sql; do
  echo "### $f"
  docker exec -i "$CONTAINER" psql -U postgres -d yolo -v ON_ERROR_STOP=1 < "$f" 2>&1 \
    | sed -E 's/^(NOTICE|ERROR):[[:space:]]+//' \
    | grep -E '^(PASS|FAIL|NOTE|DETAIL|HINT|---)'
  rc="${PIPESTATUS[0]}"
  [ "$rc" -ne 0 ] && status="$rc"
done
exit "$status"
