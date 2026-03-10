---
phase: 07-dashboard-cron-monitors-and-alert-rules
plan: 01
subsystem: monitoring
tags: [sentry, cron-monitors, captureCheckIn, heartbeat]

requires:
  - phase: 06-custom-metrics-dedup
    provides: Sentry SDK setup, metrics emission, webhook processEvent flow
provides:
  - emitRepoHeartbeat function for per-repo cron monitor check-ins
  - repoSlug function for sanitizing repo names into Sentry monitor slugs
  - Webhook integration emitting heartbeats after successful event processing
affects: [07-02 dashboard and alert rules setup]

tech-stack:
  added: []
  patterns: [Sentry captureCheckIn heartbeat pattern with interval schedule]

key-files:
  created: [api/lib/monitors.ts, tests/monitors.test.ts]
  modified: [api/webhook.ts]

key-decisions:
  - "Used interval schedule (7-day) instead of crontab for rolling-window silence detection"
  - "Heartbeat gated on result.processed to avoid false positives from filtered/skipped events"

patterns-established:
  - "Cron monitor heartbeat: captureCheckIn with monitorSlug + interval config auto-creates monitors on first check-in"
  - "Monitor slug convention: repo-{org}-{name} lowercase with hyphens only"

requirements-completed: [SENT-03]

duration: 2min
completed: 2026-03-10
---

# Phase 7 Plan 01: Cron Monitor Heartbeats Summary

**Per-repo Sentry Cron Monitor heartbeats via captureCheckIn with 7-day interval schedule and slug sanitization**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T04:09:27Z
- **Completed:** 2026-03-10T04:11:35Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created monitors module with repoSlug() and emitRepoHeartbeat() functions
- 10 unit tests covering slug generation edge cases and captureCheckIn call verification
- Integrated heartbeat into webhook processEvent flow, gated on processed: true
- Full test suite (83 tests) passes, TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Create monitors module (TDD RED)** - `f333125` (test)
2. **Task 1: Create monitors module (TDD GREEN)** - `4b87777` (feat)
3. **Task 2: Integrate heartbeat into webhook** - `98acc32` (feat)

## Files Created/Modified
- `api/lib/monitors.ts` - Exports repoSlug() and emitRepoHeartbeat() for Sentry cron monitor check-ins
- `tests/monitors.test.ts` - 10 tests for slug sanitization and captureCheckIn calls
- `api/webhook.ts` - Added emitRepoHeartbeat call after successful routeEvent processing

## Decisions Made
- Used interval schedule (7-day rolling window) over crontab for silence detection -- matches the "any event within 7 days" requirement without fixed time expectations
- Gated heartbeat on result.processed to prevent false positives from filtered/skipped/duplicate events

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required. Cron monitors are auto-created by Sentry on first captureCheckIn call.

## Next Phase Readiness
- Cron monitor heartbeat code is complete and tested
- Ready for Plan 02 (dashboard creation and alert rules setup in Sentry platform)
- Monitors will auto-create in Sentry when the first webhook events are processed in production

## Self-Check: PASSED

- FOUND: api/lib/monitors.ts
- FOUND: tests/monitors.test.ts
- FOUND: f333125 (test commit)
- FOUND: 4b87777 (feat commit)
- FOUND: 98acc32 (integration commit)

---
*Phase: 07-dashboard-cron-monitors-and-alert-rules*
*Completed: 2026-03-10*
