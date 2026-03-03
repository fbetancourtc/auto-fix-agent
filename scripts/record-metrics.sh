#!/usr/bin/env bash
set -euo pipefail

# record-metrics.sh — Extract cost data from Claude Code Action execution,
# append run entry to metrics/runs.json, and write GitHub Actions summary.
#
# Required env vars:
#   EXECUTION_FILE  — path to claude-code-action execution file output
#   TARGET_REPO     — full repo name (owner/repo)
#   RUN_ID          — the failed CI run ID
#   FIX_PR_CREATED  — "true" or "false"
#   GH_TOKEN        — for git push
#   CENTRAL_REPO    — "fbetancourtc/auto-fix-agent"

# --- Cost extraction (two-strategy approach) ---

COST=""
INPUT_TOKENS=0
OUTPUT_TOKENS=0
CACHE_READ=0
CACHE_WRITE=0
MODEL="${DEFAULT_MODEL:-claude-sonnet-4-6}"

# Strategy 1: Try parsing execution_file for total_cost_usd
if [ -n "${EXECUTION_FILE:-}" ] && [ -f "${EXECUTION_FILE:-}" ]; then
  COST=$(tail -1 "$EXECUTION_FILE" | jq -r '.total_cost_usd // empty' 2>/dev/null || true)
  if [ -n "$COST" ] && [ "$COST" != "null" ]; then
    INPUT_TOKENS=$(tail -1 "$EXECUTION_FILE" | jq -r '.usage.input_tokens // 0' 2>/dev/null || echo 0)
    OUTPUT_TOKENS=$(tail -1 "$EXECUTION_FILE" | jq -r '.usage.output_tokens // 0' 2>/dev/null || echo 0)
    CACHE_READ=$(tail -1 "$EXECUTION_FILE" | jq -r '.usage.cache_read_input_tokens // 0' 2>/dev/null || echo 0)
    CACHE_WRITE=$(tail -1 "$EXECUTION_FILE" | jq -r '.usage.cache_creation_input_tokens // 0' 2>/dev/null || echo 0)
  fi
fi

# Strategy 2: Fallback to rate table estimate
if [ -z "$COST" ] || [ "$COST" = "null" ] || [ "$COST" = "" ]; then
  PRICING_FILE="_auto-fix-scripts/config/pricing.json"
  INPUT_RATE=$(jq -r ".models[\"$MODEL\"].input_per_mtok" "$PRICING_FILE")
  OUTPUT_RATE=$(jq -r ".models[\"$MODEL\"].output_per_mtok" "$PRICING_FILE")
  EST_INPUT=$(jq -r '.estimated_tokens_per_run.input' "$PRICING_FILE")
  EST_OUTPUT=$(jq -r '.estimated_tokens_per_run.output' "$PRICING_FILE")
  INPUT_TOKENS=$EST_INPUT
  OUTPUT_TOKENS=$EST_OUTPUT
  COST=$(echo "$EST_INPUT $INPUT_RATE $EST_OUTPUT $OUTPUT_RATE" | awk '{printf "%.4f", ($1/1000000)*$2 + ($3/1000000)*$4}')
fi

# --- Build run entry ---

ENTRY_ID="run_$(date -u +%Y%m%d_%H%M%S)"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MONTH=$(date -u +%Y-%m)

if [ "${FIX_PR_CREATED:-false}" = "true" ]; then
  OUTCOME="fix_pr_created"
else
  OUTCOME="no_fix"
fi

NEW_ENTRY=$(jq -n \
  --arg id "$ENTRY_ID" \
  --arg ts "$TIMESTAMP" \
  --arg month "$MONTH" \
  --arg repo "$TARGET_REPO" \
  --arg run_id "$RUN_ID" \
  --arg outcome "$OUTCOME" \
  --argjson cost "$COST" \
  --argjson input "$INPUT_TOKENS" \
  --argjson output "$OUTPUT_TOKENS" \
  --argjson cache_read "$CACHE_READ" \
  --argjson cache_write "$CACHE_WRITE" \
  --arg model "$MODEL" \
  '{
    id: $id,
    timestamp: $ts,
    month: $month,
    repository: $repo,
    failed_run_id: $run_id,
    outcome: $outcome,
    cost_usd: $cost,
    tokens: { input: $input, output: $output, cache_read: $cache_read, cache_write: $cache_write },
    model: $model
  }')

# --- Append to metrics/runs.json ---

METRICS_FILE="_auto-fix-scripts/metrics/runs.json"
jq --argjson entry "$NEW_ENTRY" '.runs += [$entry]' "$METRICS_FILE" > /tmp/runs-updated.json \
  && mv /tmp/runs-updated.json "$METRICS_FILE"

# --- Commit and push metrics update (with retry for concurrent writes) ---

cd _auto-fix-scripts
git config user.name "auto-fix-agent[bot]"
git config user.email "auto-fix-agent[bot]@users.noreply.github.com"
git add metrics/runs.json
git commit -m "metrics: record run for $TARGET_REPO ($OUTCOME)"
for i in 1 2 3; do
  git push && break
  git pull --rebase
done
cd -

# --- Write GitHub Actions summary ---

PRICING_FILE="${PRICING_FILE:-_auto-fix-scripts/config/pricing.json}"
MONTHLY_BUDGET=$(jq -r '.budget.monthly_limit_usd' "$PRICING_FILE")
MONTHLY_TOTAL=$(jq "[.runs[] | select(.month == \"$MONTH\") | .cost_usd] | add // 0" "$METRICS_FILE")
BUDGET_PCT=$(echo "$MONTHLY_TOTAL $MONTHLY_BUDGET" | awk '{printf "%.0f", ($1/$2)*100}')

cat >> "$GITHUB_STEP_SUMMARY" << SUMMARY_EOF
## Auto-Fix Run Metrics
| Metric | Value |
|--------|-------|
| Repository | $TARGET_REPO |
| Outcome | $OUTCOME |
| Cost | \$$COST |
| Input Tokens | $INPUT_TOKENS |
| Output Tokens | $OUTPUT_TOKENS |
| Monthly Spend | \$$MONTHLY_TOTAL / \$$MONTHLY_BUDGET |
| Budget Used | ${BUDGET_PCT}% |
SUMMARY_EOF
