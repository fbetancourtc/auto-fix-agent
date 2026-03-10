#!/usr/bin/env bash
# scripts/setup-alerts.sh
#
# Creates 4 metric alert rules in Sentry for the Auto-Fix monitoring system:
#   1. Low Success Rate - warns when fewer fix PRs are created (24h window)
#   2. Cost Spike - warns when avg cost per fix exceeds $5.00 (1h window)
#   3. Budget Warning (80%) - warns when monthly spend exceeds $160 (24h window)
#   4. Budget Critical (100%) - critical when monthly spend exceeds $200 (24h window)
#
# Usage:
#   SENTRY_AUTH_TOKEN=xxx SENTRY_ORG_SLUG=xxx SENTRY_PROJECT_SLUG=xxx ./scripts/setup-alerts.sh
#
# If API creation fails, see docs/sentry-setup.md for manual UI setup.
#
# chmod +x scripts/setup-alerts.sh

set -euo pipefail

# --- Required environment variables ---
SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:?Error: Set SENTRY_AUTH_TOKEN (Internal Integration token with org:write, alerts:write scopes)}"
SENTRY_ORG_SLUG="${SENTRY_ORG_SLUG:?Error: Set SENTRY_ORG_SLUG (Settings -> General -> Organization Slug)}"
SENTRY_PROJECT_SLUG="${SENTRY_PROJECT_SLUG:?Error: Set SENTRY_PROJECT_SLUG (Settings -> Projects -> project name)}"

API_BASE="https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}"

# Helper function to create an alert rule
create_alert() {
  local name="$1"
  local payload="$2"

  echo "Creating alert rule: ${name}..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/alert-rules/" \
    -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${payload}")

  HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
  BODY=$(echo "${RESPONSE}" | sed '$d')

  if [[ "${HTTP_CODE}" -ge 200 && "${HTTP_CODE}" -lt 300 ]]; then
    RULE_ID=$(echo "${BODY}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Created (ID: ${RULE_ID})"
  else
    echo "  ERROR (HTTP ${HTTP_CODE}): $(echo "${BODY}" | head -5)"
    echo "  See docs/sentry-setup.md for manual setup"
    ERRORS=$((ERRORS + 1))
  fi
}

ERRORS=0

echo "Creating Auto-Fix alert rules in Sentry..."
echo "Org: ${SENTRY_ORG_SLUG}"
echo "Project: ${SENTRY_PROJECT_SLUG}"
echo ""

# --- Alert 1: Low Success Rate ---
# Fires when the count of successful outcomes (fix_pr_created) drops below
# a threshold in a 24h window. Using thresholdType 1 (below) to detect drops.
# NOTE: The threshold value (1) is intentionally low as a starting point.
# Adjust based on expected volume after initial deployment.
create_alert "Auto-Fix: Low Success Rate" "$(cat <<ALERT1
{
  "name": "Auto-Fix: Low Success Rate",
  "aggregate": "count(c:custom/auto_fix.outcome@none)",
  "dataset": "generic_metrics",
  "query": "outcome:fix_pr_created",
  "timeWindow": 1440,
  "thresholdType": 1,
  "resolveThreshold": null,
  "projects": ["${SENTRY_PROJECT_SLUG}"],
  "owner": null,
  "triggers": [
    {
      "label": "warning",
      "alertThreshold": 1,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "me"
        }
      ]
    }
  ]
}
ALERT1
)"

# --- Alert 2: Cost Spike ---
# Fires when the average cost per fix exceeds $5.00 in a 1-hour window.
# Uses thresholdType 0 (above) to detect spikes.
create_alert "Auto-Fix: Cost Spike" "$(cat <<ALERT2
{
  "name": "Auto-Fix: Cost Spike",
  "aggregate": "avg(d:custom/auto_fix.cost_per_fix_usd@none)",
  "dataset": "generic_metrics",
  "query": "",
  "timeWindow": 60,
  "thresholdType": 0,
  "resolveThreshold": null,
  "projects": ["${SENTRY_PROJECT_SLUG}"],
  "owner": null,
  "triggers": [
    {
      "label": "warning",
      "alertThreshold": 5.0,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "me"
        }
      ]
    }
  ]
}
ALERT2
)"

# --- Alert 3: Budget Warning (80%) ---
# Fires when monthly spend exceeds $160 (80% of $200 budget) in a 24h window.
create_alert "Auto-Fix: Budget Warning (80%)" "$(cat <<ALERT3
{
  "name": "Auto-Fix: Budget Warning (80%)",
  "aggregate": "sum(g:custom/auto_fix.monthly_spend_usd@none)",
  "dataset": "generic_metrics",
  "query": "",
  "timeWindow": 1440,
  "thresholdType": 0,
  "resolveThreshold": null,
  "projects": ["${SENTRY_PROJECT_SLUG}"],
  "owner": null,
  "triggers": [
    {
      "label": "warning",
      "alertThreshold": 160,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "me"
        }
      ]
    }
  ]
}
ALERT3
)"

# --- Alert 4: Budget Critical (100%) ---
# Fires when monthly spend exceeds $200 (100% of budget) in a 24h window.
# Critical severity -- immediate action required.
create_alert "Auto-Fix: Budget Critical (100%)" "$(cat <<ALERT4
{
  "name": "Auto-Fix: Budget Critical (100%)",
  "aggregate": "sum(g:custom/auto_fix.monthly_spend_usd@none)",
  "dataset": "generic_metrics",
  "query": "",
  "timeWindow": 1440,
  "thresholdType": 0,
  "resolveThreshold": null,
  "projects": ["${SENTRY_PROJECT_SLUG}"],
  "owner": null,
  "triggers": [
    {
      "label": "critical",
      "alertThreshold": 200,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "me"
        }
      ]
    }
  ]
}
ALERT4
)"

echo ""
if [[ "${ERRORS}" -eq 0 ]]; then
  echo "All 4 alert rules created successfully!"
  echo "View them at: https://${SENTRY_ORG_SLUG}.sentry.io/alerts/rules/"
else
  echo "WARNING: ${ERRORS} alert rule(s) failed to create."
  echo "See docs/sentry-setup.md for manual setup instructions."
  exit 1
fi
