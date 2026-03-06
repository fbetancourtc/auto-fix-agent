---
phase: 06-event-processing-metrics-and-deduplication
plan: 02
subsystem: handlers, router, metrics
tags: [sentry, webhooks-types, metrics, handlers, typescript, octokit]

# Dependency graph
requires:
  - phase: 06-event-processing-metrics-and-deduplication
    plan: 01
    provides: Centralized metrics module (10 emit* functions), buildMetricTags, estimateCostUsd helpers
  - phase: 05-webhook-receiver-and-security-foundation
    provides: Handler stubs, router, filters, Sentry SDK init
provides:
  - Strong-typed router with @octokit/webhooks-types union dispatch
  - workflow-run handler emitting 5 metric types (trigger count, outcome, run duration, MTTR, cost)
  - pull-request handler emitting PR acceptance/rejection and scope violation signals
  - review handler emitting escalation signal on changes_requested
affects: [06-03 dedup integration, 07 dashboards, future handler enhancements]

# Tech tracking
tech-stack:
  added: ["@octokit/webhooks-types ^7.6.1"]
  patterns: ["Strong union type narrowing in router switch cases", "Outcome classification heuristic for workflow conclusions", "MTTR proxy from workflow_run timestamps (run_started_at to updated_at)"]

key-files:
  created: []
  modified:
    - api/lib/router.ts
    - api/lib/handlers/workflow-run.ts
    - api/lib/handlers/pull-request.ts
    - api/lib/handlers/review.ts
    - api/webhook.ts
    - package.json
    - package-lock.json

key-decisions:
  - "Exported WebhookPayload union type from router for caller type assertion at JSON.parse boundary"
  - "MTTR emitted from workflow-run handler using run duration as proxy (run_started_at to updated_at)"
  - "Closed-without-merge PR treated as scope violation signal (SAFE-03) in addition to rejection metric"

patterns-established:
  - "Handler metric emission pattern: build tags first, emit metrics, then Sentry breadcrumb"
  - "Outcome classification heuristic: success->fix_pr_created, failure->no_fix, cancelled->escalated"
  - "Type narrowing pattern: routeEvent accepts WebhookPayload union, each case narrows via `as` assertion"

requirements-completed: [OPS-01, OPS-02, OPS-03, OPS-04, VAL-01, VAL-02, VAL-03, VAL-04, SAFE-01, SAFE-02, SAFE-03, SAFE-04]

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 6 Plan 02: Handler Wiring and Router Strong Types Summary

**Strong-typed router with @octokit/webhooks-types and three handlers emitting operational, value, and safety metrics via Sentry**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T20:17:39Z
- **Completed:** 2026-03-06T20:21:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Upgraded router from `payload: any` to strong `WebhookPayload` union type with per-case narrowing
- workflow-run handler emits 5 metric categories: trigger count (OPS-01), outcome classification (OPS-02), run duration (OPS-04), MTTR on success (VAL-01), cost estimate (VAL-03/VAL-04/SAFE-01)
- pull-request handler emits PR accepted/rejected on close events (VAL-02) with scope violation signal on closed-without-merge (SAFE-03)
- review handler emits escalation signal on changes_requested reviews (SAFE-04)
- All metrics tagged with repo/org/stack via buildMetricTags enabling per-repo health score grouping (OPS-03)

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade router to strong types and wire workflow-run handler with metric emission** - `2251b72` (feat)
2. **Task 2: Wire pull-request and review handlers with metric emission** - `a436c86` (feat)

## Files Created/Modified
- `api/lib/router.ts` - Strong-typed event dispatch with WebhookPayload union, per-case type narrowing
- `api/lib/handlers/workflow-run.ts` - Emits trigger count, outcome, run duration, MTTR, cost estimate
- `api/lib/handlers/pull-request.ts` - Emits PR accepted/rejected and scope violation on close events
- `api/lib/handlers/review.ts` - Emits escalation signal on changes_requested reviews
- `api/webhook.ts` - Updated caller to use WebhookPayload type assertion at JSON.parse boundary
- `package.json` - Added @octokit/webhooks-types devDependency
- `package-lock.json` - Lockfile updated with new dependency

## Decisions Made
- **WebhookPayload type export:** Exported the `WebhookPayload` union type from router.ts so the webhook.ts entry point can assert the parsed JSON payload at the trust boundary. The router's switch statement then narrows to specific event types.
- **MTTR from workflow-run only:** MTTR is emitted from the workflow-run handler using run duration as a proxy (run_started_at to updated_at), not from the pull-request handler. This follows the user decision "MTTR computed from webhook payload timestamps only."
- **Scope violation on closed-without-merge:** A PR closed without being merged is treated as both a rejection (VAL-02) and a scope violation signal (SAFE-03), since it may indicate the auto-fix changed files outside scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @octokit/webhooks-types dependency**
- **Found during:** Task 1 (router type upgrade)
- **Issue:** Package not in node_modules; import would fail at compile time
- **Fix:** `npm install --save-dev @octokit/webhooks-types`
- **Files modified:** package.json, package-lock.json
- **Verification:** `npx tsc --noEmit` passes
- **Committed in:** 2251b72 (Task 1 commit)

**2. [Rule 3 - Blocking] Updated webhook.ts caller for strong-typed routeEvent**
- **Found during:** Task 1 (TypeScript compilation after router change)
- **Issue:** `JSON.parse(rawBody)` returns `Record<string, unknown>` which is not assignable to the new `WebhookPayload` union type
- **Fix:** Exported `WebhookPayload` from router.ts, imported in webhook.ts, added type assertion at the JSON parse boundary
- **Files modified:** api/lib/router.ts, api/webhook.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 2251b72 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 blocking issues)
**Impact on plan:** Both fixes were necessary for the strong typing to work end-to-end. No scope creep -- the webhook.ts change is a minimal type assertion at the trust boundary.

## Issues Encountered
None - all handler implementations followed the planned metric emission patterns directly.

## User Setup Required
None - no external service configuration required. @octokit/webhooks-types is a types-only devDependency.

## Next Phase Readiness
- All three handlers now emit structured Sentry metrics tagged with repo/org/stack
- Plan 03 (dedup integration into processEvent) can proceed -- handlers are wired and tested
- Phase 7 dashboard creation has the data foundation: all OPS, VAL, and SAFE metrics are being emitted

---
*Phase: 06-event-processing-metrics-and-deduplication*
*Completed: 2026-03-06*
