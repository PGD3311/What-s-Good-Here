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

# Batch size of 8 keeps each invocation under Supabase's 150s edge-function
# timeout. Each restaurant takes ~3-15s (HTML fetch + optional Browserless
# render + Sonnet extraction + upsert). 8 × 15s worst case = 120s, leaving
# headroom under the 150s limit.
LIMIT=8
ENDPOINT="$SUPABASE_URL/functions/v1/menu-refresh?force_all=true&limit=$LIMIT"

# Safety cap so a buggy "processed > 0 forever" loop can't run unbounded.
# 30 iterations × 8 restaurants = 240 ceiling; well above the ~177 inventory.
MAX_ITERATIONS=30
# Bail after this many consecutive IDLE_TIMEOUTs — if we never see a normal
# response across several batches, rotation isn't recovering and there's a
# real upstream problem to investigate (network, runtime config, etc).
MAX_CONSECUTIVE_TIMEOUTS=5
TOTAL=0
CONSECUTIVE_TIMEOUTS=0

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo "→ Iteration $i: POST $ENDPOINT"
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")
  echo "  response: $RESPONSE"

  # IDLE_TIMEOUT used to abort the script — that was protective when the
  # function would loop on a stuck cluster. With PR #232 + #236 + this PR's
  # batch pre-stamp, a timeout safely rotates the whole batch, so we just
  # log + continue. The next iteration picks a different batch.
  if echo "$RESPONSE" | grep -qE '"code":"IDLE_TIMEOUT"'; then
    CONSECUTIVE_TIMEOUTS=$((CONSECUTIVE_TIMEOUTS + 1))
    echo "  ⚠ IDLE_TIMEOUT (consecutive: $CONSECUTIVE_TIMEOUTS/$MAX_CONSECUTIVE_TIMEOUTS) — batch rotated by pre-stamp, continuing."
    if [ "$CONSECUTIVE_TIMEOUTS" -ge "$MAX_CONSECUTIVE_TIMEOUTS" ]; then
      echo "✗ Hit $MAX_CONSECUTIVE_TIMEOUTS consecutive IDLE_TIMEOUTs — rotation isn't recovering. Aborting to surface real problem."
      echo "  Total restaurants successfully processed before abort: $TOTAL"
      exit 1
    fi
    sleep 5
    continue
  fi
  # Any non-timeout response resets the streak — we just made forward progress.
  CONSECUTIVE_TIMEOUTS=0

  # Other errors (auth, server) still abort — those indicate a config problem
  # the rotation logic can't fix.
  if echo "$RESPONSE" | grep -qE '"error":'; then
    echo "✗ Edge function returned an error response. Backfill aborted."
    echo "  Total restaurants successfully processed before error: $TOTAL"
    exit 1
  fi

  # Successful response must contain "processed". Strict check — if missing, error.
  if ! echo "$RESPONSE" | grep -qE '"processed":'; then
    echo "✗ Unexpected response shape (no 'processed' field). Aborting."
    echo "  Total restaurants successfully processed before error: $TOTAL"
    exit 1
  fi

  PROCESSED=$(echo "$RESPONSE" | grep -oE '"processed":[0-9]+' | grep -oE '[0-9]+')
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
