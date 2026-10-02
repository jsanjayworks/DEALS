#!/usr/bin/env bash
# Full backend verification: rebuild the database, then run the smoke test.
#
# The suite mutates state deliberately — it approves deals, claims capacity and
# expires windows — so it needs a fresh database every time. Always go through
# this script rather than calling db-test.sh twice.
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/db-reset.sh
echo
bash scripts/db-test.sh
