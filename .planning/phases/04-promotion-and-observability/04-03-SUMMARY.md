---
phase: 04-promotion-and-observability
plan: 03
subsystem: infra
tags: [github-actions, promotion, observability, budget]

# Dependency graph
requires:
  - phase: 04-promotion-and-observability
    provides: "promote.yml reusable workflow and promote-caller.example.yml template (04-01), record-metrics.sh cost tracking (04-02)"
provides:
  - "Reviewer decline handling for qa->main promotion PRs (needs-human label + close)"
  - "Dynamic budget display in GitHub Actions summary from pricing.json"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Event-gated GitHub Actions jobs: separate jobs for different event types in same workflow"
    - "Config-driven values: read from pricing.json instead of hardcoding in scripts"

key-files:
  created: []
  modified:
    - ".github/workflows/promote-caller.example.yml"
    - "scripts/record-metrics.sh"

key-decisions:
  - "handle-decline job uses github.token (not App token) since it runs in the target repo"
  - "PRICING_FILE uses bash default substitution to handle both Strategy 1 and Strategy 2 scopes"

patterns-established:
  - "Triple-gate condition: event state + label check + base ref to scope workflow jobs precisely"

requirements-completed: []

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 04 Plan 03: Gap Closure Summary

**Reviewer decline handler for qa->main PRs with needs-human label, plus dynamic budget display from pricing.json**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T04:43:07Z
- **Completed:** 2026-03-03T04:45:16Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added reviewer decline handling to promote-caller template: when a reviewer requests changes on a qa->main PR labeled `auto-fix-promote`, the PR is automatically closed with a `needs-human` label
- Fixed hardcoded budget value ($200) in record-metrics.sh GitHub Actions summary to read from `config/pricing.json` dynamically
- Closed the single verification gap from phase 4 (truth 4 about reviewer decline handling)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reviewer decline handler to promote-caller.example.yml** - `08f1360` (feat)
2. **Task 2: Fix hardcoded budget value in record-metrics.sh summary** - `79e7293` (fix)

## Files Created/Modified
- `.github/workflows/promote-caller.example.yml` - Added `pull_request_review` trigger and `handle-decline` job that closes qa->main PRs when reviewer requests changes
- `scripts/record-metrics.sh` - Replaced hardcoded `200` with `MONTHLY_BUDGET` read from `pricing.json` in summary section

## Decisions Made
- `handle-decline` job uses `github.token` (not App token) since the workflow runs in the target repo where the PR lives -- no cross-org auth needed
- `PRICING_FILE` defined with bash default substitution (`${PRICING_FILE:-...}`) so it works regardless of whether Strategy 1 or Strategy 2 was used for cost extraction
- Triple-gate condition on decline handler: `changes_requested` + `auto-fix-promote` label + `base.ref == main` ensures only qa->main promotion PRs are affected

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 gap is fully closed: all 4 truths from 04-VERIFICATION.md now have complete implementations
- v1.1 milestone at 5/5 plans complete (pending 03-02 checkpoint for secrets verification)

---
*Phase: 04-promotion-and-observability*
*Completed: 2026-03-03*
