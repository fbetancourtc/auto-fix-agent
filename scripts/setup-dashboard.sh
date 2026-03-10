#!/usr/bin/env bash
# scripts/setup-dashboard.sh
#
# Creates the "Auto-Fix Operations" Custom Dashboard in Sentry via API.
# The dashboard has 3 panel groups (12 widgets total):
#   - Operations Health (4 widgets)
#   - Value Metrics (4 widgets)
#   - Safety Signals (4 widgets)
#
# Usage:
#   SENTRY_AUTH_TOKEN=xxx SENTRY_ORG_SLUG=xxx ./scripts/setup-dashboard.sh
#
# If API creation fails, see docs/sentry-setup.md for manual UI setup.
#
# chmod +x scripts/setup-dashboard.sh

set -euo pipefail

# --- Required environment variables ---
SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:?Error: Set SENTRY_AUTH_TOKEN (Internal Integration token with org:write scope)}"
SENTRY_ORG_SLUG="${SENTRY_ORG_SLUG:?Error: Set SENTRY_ORG_SLUG (Settings -> General -> Organization Slug)}"

API_BASE="https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}"

# --- NOTE: LOW confidence on exact MRI format ---
# The MRI (Metric Resource Identifier) strings below follow the pattern:
#   counter:  c:custom/metric_name@none
#   distribution: d:custom/metric_name@unit
#   gauge: g:custom/metric_name@none
#
# If the first widget shows "No data" despite metrics being emitted,
# use GET /api/0/organizations/{org}/metrics/meta/ to discover the
# exact MRI strings, then update this script accordingly.
#
# Alternatively, create the dashboard via the Sentry web UI which has
# a metric picker dropdown. See docs/sentry-setup.md for instructions.

echo "Creating Auto-Fix Operations dashboard in Sentry..."
echo "Org: ${SENTRY_ORG_SLUG}"
echo ""

# Build the dashboard JSON payload
DASHBOARD_JSON=$(cat <<'PAYLOAD'
{
  "title": "Auto-Fix Operations",
  "widgets": [
    {
      "title": "Operations Health: Trigger Count by Repo",
      "displayType": "bar",
      "queries": [
        {
          "name": "Triggers",
          "aggregates": ["sum(c:custom/auto_fix.trigger_count@none)"],
          "columns": ["repo"],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 0, "y": 0, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Operations Health: Outcome Breakdown",
      "displayType": "bar",
      "queries": [
        {
          "name": "Outcomes",
          "aggregates": ["sum(c:custom/auto_fix.outcome@none)"],
          "columns": ["outcome"],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 3, "y": 0, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Operations Health: Run Duration (p50/p95)",
      "displayType": "line",
      "queries": [
        {
          "name": "p50",
          "aggregates": ["p50(d:custom/auto_fix.run_duration_ms@millisecond)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        },
        {
          "name": "p95",
          "aggregates": ["p95(d:custom/auto_fix.run_duration_ms@millisecond)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 0, "y": 2, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Operations Health: Per-Repo Health",
      "displayType": "table",
      "queries": [
        {
          "name": "Health",
          "aggregates": [
            "sum(c:custom/auto_fix.trigger_count@none)",
            "sum(c:custom/auto_fix.outcome@none)"
          ],
          "columns": ["repo"],
          "conditions": "",
          "orderby": "-sum(c:custom/auto_fix.trigger_count@none)"
        }
      ],
      "layout": { "x": 3, "y": 2, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Value Metrics: MTTR Trend",
      "displayType": "line",
      "queries": [
        {
          "name": "MTTR p50",
          "aggregates": ["p50(d:custom/auto_fix.mttr_ms@millisecond)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 0, "y": 4, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Value Metrics: Cost per Fix",
      "displayType": "line",
      "queries": [
        {
          "name": "Avg Cost",
          "aggregates": ["avg(d:custom/auto_fix.cost_per_fix_usd@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 3, "y": 4, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Value Metrics: Monthly Spend",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Spend",
          "aggregates": ["sum(g:custom/auto_fix.monthly_spend_usd@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 0, "y": 6, "w": 2, "h": 1, "min_h": 1 }
    },
    {
      "title": "Value Metrics: PR Acceptance Rate",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Accepted",
          "aggregates": ["sum(c:custom/auto_fix.pr_accepted@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 2, "y": 6, "w": 2, "h": 1, "min_h": 1 }
    },
    {
      "title": "Safety Signals: Budget Burn Rate",
      "displayType": "line",
      "queries": [
        {
          "name": "Spend",
          "aggregates": ["sum(g:custom/auto_fix.monthly_spend_usd@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 0, "y": 7, "w": 3, "h": 2, "min_h": 2 }
    },
    {
      "title": "Safety Signals: Circuit Breaker Trips",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Trips",
          "aggregates": ["sum(c:custom/auto_fix.safety.circuit_breaker_trip@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 3, "y": 7, "w": 1, "h": 1, "min_h": 1 }
    },
    {
      "title": "Safety Signals: Scope Violations",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Violations",
          "aggregates": ["sum(c:custom/auto_fix.safety.scope_violation@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 4, "y": 7, "w": 1, "h": 1, "min_h": 1 }
    },
    {
      "title": "Safety Signals: Escalations",
      "displayType": "big_number",
      "queries": [
        {
          "name": "Escalations",
          "aggregates": ["sum(c:custom/auto_fix.safety.escalation@none)"],
          "columns": [],
          "conditions": "",
          "orderby": ""
        }
      ],
      "layout": { "x": 5, "y": 7, "w": 1, "h": 1, "min_h": 1 }
    }
  ]
}
PAYLOAD
)

# Create the dashboard
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_BASE}/dashboards/" \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${DASHBOARD_JSON}")

HTTP_CODE=$(echo "${RESPONSE}" | tail -1)
BODY=$(echo "${RESPONSE}" | sed '$d')

if [[ "${HTTP_CODE}" -ge 200 && "${HTTP_CODE}" -lt 300 ]]; then
  DASHBOARD_ID=$(echo "${BODY}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Dashboard created successfully!"
  echo "  ID: ${DASHBOARD_ID}"
  echo "  URL: https://${SENTRY_ORG_SLUG}.sentry.io/dashboard/${DASHBOARD_ID}/"
  echo ""
  echo "Note: Widgets may show 'No data' until metric events flow through the system."
else
  echo "ERROR: Dashboard creation failed (HTTP ${HTTP_CODE})"
  echo "${BODY}" | head -20
  echo ""
  echo "Common causes:"
  echo "  - Auth token missing org:write scope"
  echo "  - MRI format mismatch (see docs/sentry-setup.md for manual setup)"
  echo "  - Sentry plan doesn't support custom dashboards"
  exit 1
fi
