#!/usr/bin/env bash
# scripts/backfill-menu-descriptions.sh
#
# One-time eager backfill for v1.3 dish descriptions + dietary tags.
# Loops POSTs to the menu-refresh Edge Function with force_all=true&limit=50
# until the response reports processed:0. Each invocation extracts up to 50
# restaurants in a single edge-function run (bounded by the limit param).
#
# Requirements:
#   SUPABASE_URL    https://<project-ref>.supabase.co (no trailing slash)
#   CRON_SECRET     the menu-refresh function's authorization secret
#
# Usage:
#   export SUPABASE_URL="https://vpioftosgdkyiwvhxewy.supabase.co"
#   export CRON_SECRET="<from Supabase function secrets dashboard>"
#   ./scripts/backfill-menu-descriptions.sh
#
# Expected wall time: ~30-60 min for ~177 restaurants (the function does most
# of the work serially per invocation; budget ~2-5s per restaurant for fetch
# + Sonnet extraction + upsert).
#
# Safe to re-run: hash-skip means previously-extracted restaurants are
# either re-processed (if their menu changed) or short-circuit with
# 'hash_unchanged' status.

set -euo pipefail

: "${SUPABASE_URL:?must set SUPABASE_URL}"
: "${CRON_SECRET:?must set CRON_SECRET}"

ENDPOINT="$SUPABASE_URL/functions/v1/menu-refresh?force_all=true&limit=50"

# Safety cap so a buggy "processed > 0 forever" loop can't run unbounded.
# 20 iterations × 50 restaurants = 1000 restaurants ceiling; well above the
# current ~177 inventory.
MAX_ITERATIONS=20
TOTAL=0

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo "→ Iteration $i: POST $ENDPOINT"
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
  echo "  response: $RESPONSE"

  PROCESSED=$(echo "$RESPONSE" | grep -oE '"processed":[0-9]+' | grep -oE '[0-9]+' || echo "0")
  TOTAL=$((TOTAL + PROCESSED))
  echo "  processed this iteration: $PROCESSED (running total: $TOTAL)"

  if [ "$PROCESSED" -eq 0 ]; then
    echo "✓ Done. Total restaurants backfilled: $TOTAL"
    exit 0
  fi

  echo "  sleeping 5s before next batch..."
  sleep 5
done

echo "⚠ Reached MAX_ITERATIONS ($MAX_ITERATIONS) without seeing processed:0."
echo "  Total restaurants processed so far: $TOTAL"
echo "  Re-run the script to continue if needed."
exit 1
