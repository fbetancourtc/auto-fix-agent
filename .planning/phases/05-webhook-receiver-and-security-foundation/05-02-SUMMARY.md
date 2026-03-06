---
phase: 05-webhook-receiver-and-security-foundation
plan: 02
subsystem: infra
tags: [vercel, typescript, webhook, routing, sentry, filtering, onboarding]

# Dependency graph
requires:
  - phase: 05-01
    provides: Vercel serverless function, types (ProcessEventResult, WebhookHeaders), Sentry module, signature verification
provides:
  - Event type routing via routeEvent() with switch on workflow_run, pull_request, pull_request_review
  - Event filters (isAutoFixLabeledPR, isReviewOnAutoFixPR) gating handler dispatch
  - Handler stubs for workflow_run, pull_request, and pull_request_review with Sentry breadcrumbs
  - Webhook registration documentation in ONBOARDING.md for all 3 orgs
affects: [phase-06, phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns: ["switch-based event routing with Sentry breadcrumb filtering", "label-based PR filtering at gateway boundary", "handler stubs with breadcrumb-only observability"]

key-files:
  created: ["api/lib/router.ts", "api/lib/filters.ts", "api/lib/handlers/workflow-run.ts", "api/lib/handlers/pull-request.ts", "api/lib/handlers/review.ts"]
  modified: ["api/webhook.ts", "ONBOARDING.md"]

key-decisions:
  - "Loose typing (any) at filter boundary -- full @octokit/webhooks-types deferred to Phase 6"
  - "Unrecognized events return 200 with breadcrumb only, no Sentry error (prevents quota waste)"
  - "Handler stubs emit Sentry breadcrumbs only -- metric emission deferred to Phase 6"

patterns-established:
  - "Event routing: routeEvent() switch dispatches to handler functions after filter checks"
  - "Filter-before-dispatch: isAutoFixLabeledPR/isReviewOnAutoFixPR gate handler calls in router"
  - "Handler pattern: async function accepting payload, adding Sentry breadcrumb with structured data"

requirements-completed: [HOOK-03, HOOK-06, INFRA-02]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 5 Plan 02: Event Routing, Filtering, and Handler Stubs Summary

**Switch-based event router with auto-fix label filtering, 3 handler stubs with Sentry breadcrumbs, and webhook registration docs for all 3 GitHub orgs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-04T09:12:00Z
- **Completed:** 2026-03-06T17:33:03Z
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files created/modified:** 7

## Accomplishments
- Event router dispatches workflow_run, pull_request, and pull_request_review to dedicated handlers with Sentry breadcrumb filtering
- Auto-fix label filter gates PR and review processing -- only PRs with the `auto-fix` label proceed
- Webhook registration documented in ONBOARDING.md with step-by-step instructions, org URLs, and troubleshooting table
- Deployment verified: Vercel returns 405 on GET, 401 on unsigned POST, live at auto-fix-agent.vercel.app

## Task Commits

Each task was committed atomically:

1. **Task 1: Create router, filters, handler stubs, and wire into processEvent** - `4a09fcc` (feat)
2. **Task 2: Update ONBOARDING.md with webhook registration instructions** - `7a66151` (docs)
3. **Task 3: Verify deployment, webhook registration, and Sentry integration** - checkpoint:human-verify (approved)

## Files Created/Modified
- `api/lib/router.ts` - Event type routing via X-GitHub-Event header with filter-before-dispatch
- `api/lib/filters.ts` - Auto-fix label detection for PRs and reviews
- `api/lib/handlers/workflow-run.ts` - Handler stub for workflow_run.completed events
- `api/lib/handlers/pull-request.ts` - Handler stub for auto-fix labeled PR events
- `api/lib/handlers/review.ts` - Handler stub for reviews on auto-fix PRs
- `api/webhook.ts` - Wired routeEvent into processEvent (replaced TODO stub)
- `ONBOARDING.md` - Added webhook registration section with 3 org URLs and troubleshooting

## Decisions Made
- Used `any` typing at filter boundary for payload params -- full `@octokit/webhooks-types` deferred to Phase 6 when payloads are deeply processed
- Unrecognized event types return 200 and log Sentry breadcrumb only (no error capture) to prevent quota waste per user decision
- Handler stubs log Sentry breadcrumbs with structured data (repo, IDs, state) -- metric emission deferred to Phase 6

## Deviations from Plan

None - plan executed exactly as written. Code from Tasks 1-2 was committed in a prior session; this session verified completion and handled the human-verify checkpoint.

## Issues Encountered
None

## User Setup Required

Webhook registration for 3 GitHub organizations is pending manual action:
- `fbetancourtc` (personal account): https://github.com/settings/hooks
- `Liftitapp` (org): https://github.com/organizations/Liftitapp/settings/hooks
- `LiftitFinOps` (org): https://github.com/organizations/LiftitFinOps/settings/hooks

Steps documented in ONBOARDING.md "Webhook Registration" section. Deployment itself is live and verified.

## Next Phase Readiness
- All Phase 5 code is deployed and verified on Vercel
- Handler stubs have Phase 6 comment markers for metric emission integration points
- Router and filter patterns established for Phase 6 to extend with deeper payload processing
- Sentry error capture operational -- Phase 6 will add structured metrics on top

## Self-Check: PASSED

All 7 created/modified files verified on disk. Both task commits (4a09fcc, 7a66151) verified in git log. Summary file exists.

---
*Phase: 05-webhook-receiver-and-security-foundation*
*Completed: 2026-03-06*
