---
phase: 07-dashboard-cron-monitors-and-alert-rules
plan: 02
subsystem: infra
tags: [sentry, dashboard, alerts, monitoring, metrics]

requires:
  - phase: 07-01
    provides: Cron monitor heartbeat integration and custom metric emission
  - phase: 06-01
    provides: Metrics module with counter/distribution/gauge helpers
provides:
  - Sentry Custom Dashboard setup script with 12 widgets across 3 panel groups
  - Sentry Alert Rules setup script for 4 threshold-based alerts
  - Manual setup documentation as API fallback
affects: []

tech-stack:
  added: [sentry-api, curl]
  patterns: [infrastructure-as-code-scripts, manual-fallback-docs]

key-files:
  created:
    - scripts/setup-dashboard.sh
    - scripts/setup-alerts.sh
    - docs/sentry-setup.md
  modified: []

key-decisions:
  - "LOW confidence on MRI format noted in scripts -- user should verify first widget and adjust"
  - "generic_metrics dataset used for all alert rules per RESEARCH.md Pitfall 4"

patterns-established:
  - "IaC scripts with manual fallback: API scripts + docs for manual UI setup"

requirements-completed: [SENT-02, SENT-04]

duration: 3min
completed: 2026-03-10
---

# Phase 7 Plan 2: Dashboard and Alert Rules Summary

**Sentry dashboard setup scripts (12 widgets, 4 alert rules) with manual fallback documentation for ops visibility**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T04:12:00Z
- **Completed:** 2026-03-10T04:15:36Z
- **Tasks:** 2 (1 auto + 1 checkpoint approved)
- **Files created:** 3

## Accomplishments
- Created setup-dashboard.sh that provisions a 12-widget "Auto-Fix Operations" dashboard via Sentry API with Operations Health, Value Metrics, and Safety Signals panels
- Created setup-alerts.sh that provisions 4 metric alert rules: low success rate, cost spike, budget warning (80%), budget critical (100%)
- Created comprehensive manual setup guide (docs/sentry-setup.md) as fallback when API scripts need MRI format adjustments

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Sentry setup scripts and documentation** - `62fead9` (feat)
2. **Task 2: Deploy and verify Sentry configuration** - checkpoint approved (user will validate Sentry deployment later)

## Files Created/Modified
- `scripts/setup-dashboard.sh` - Bash script creating 12-widget Sentry dashboard via API (Operations Health, Value Metrics, Safety Signals)
- `scripts/setup-alerts.sh` - Bash script creating 4 metric alert rules via Sentry API
- `docs/sentry-setup.md` - Manual setup guide covering dashboard, alerts, cron monitors, and troubleshooting

## Decisions Made
- LOW confidence on MRI format noted in scripts -- scripts include comments advising user to verify first widget works then adjust remaining
- Used generic_metrics dataset for all alert rules per RESEARCH.md Pitfall 4
- Email notification action targeting authenticated user for all alerts

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**External services require manual configuration.** User needs to:
- Set SENTRY_AUTH_TOKEN, SENTRY_ORG_SLUG, SENTRY_PROJECT_SLUG environment variables
- Run setup scripts or follow manual setup in docs/sentry-setup.md
- Deploy updated webhook function to trigger cron monitor auto-creation
- Verify dashboard widgets, alert rules, and cron monitors in Sentry UI

## Issues Encountered
None

## Next Phase Readiness
- v1.2 milestone complete: full pipeline from webhook receiver to actionable Sentry visibility
- All 7 phases across 4 milestones delivered
- Remaining work is user-side: deploying function, running setup scripts, validating Sentry configuration

## Self-Check: PASSED

- FOUND: scripts/setup-dashboard.sh
- FOUND: scripts/setup-alerts.sh
- FOUND: docs/sentry-setup.md
- FOUND: commit 62fead9

---
*Phase: 07-dashboard-cron-monitors-and-alert-rules*
*Completed: 2026-03-10*
