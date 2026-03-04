---
phase: 05-webhook-receiver-and-security-foundation
plan: 01
subsystem: infra
tags: [vercel, typescript, webhook, hmac, sentry, serverless]

# Dependency graph
requires:
  - phase: 04-promotion-and-observability
    provides: v1.1 complete (multi-repo rollout with promotion and observability)
provides:
  - Vercel-deployable serverless function at /api/webhook
  - HMAC-SHA256 signature verification via @octokit/webhooks-methods
  - Sentry error capture with module-scope init and flush helper
  - TypeScript project scaffolding (package.json, tsconfig.json, vercel.json)
  - Shared types (WebhookHeaders, extractHeaders, ProcessEventResult)
affects: [05-02-PLAN, phase-06, phase-07]

# Tech tracking
tech-stack:
  added: ["@vercel/functions", "@octokit/webhooks-methods", "@sentry/node", "@octokit/webhooks-types", "typescript"]
  patterns: ["Web API handler format (export default { fetch })", "module-scope Sentry.init", "response-first with waitUntil", "HMAC-SHA256 signature verification wrapper"]

key-files:
  created: ["package.json", "tsconfig.json", "vercel.json", "api/webhook.ts", "api/lib/types.ts", "api/lib/sentry.ts", "api/lib/verify.ts"]
  modified: []

key-decisions:
  - "Used .js extensions in imports (e.g. ./lib/sentry.js) for ESM module resolution compatibility with Vercel bundler"
  - "Sentry imported via side-effect import first (import './lib/sentry.js') then separately for API usage (import * as Sentry)"
  - "processEvent casts payload fields with type narrowing rather than using full webhook-types (deferred to Plan 02)"

patterns-established:
  - "Web API handler: export default { async fetch(request: Request): Promise<Response> }"
  - "Response-first: verify -> respond 200 -> waitUntil(processEvent) for deferred work"
  - "Module-scope Sentry: init at import time, flush in finally block inside waitUntil"
  - "Guard clause pattern: return false for empty signature/secret before delegating to library"

requirements-completed: [HOOK-01, HOOK-02, HOOK-05, SENT-01, INFRA-01]

# Metrics
duration: 2.4min
completed: 2026-03-04
---

# Phase 5 Plan 01: Project Scaffolding and Webhook Handler Foundation Summary

**Vercel serverless webhook receiver with HMAC-SHA256 signature verification, environment gating, and Sentry error capture via waitUntil pattern**

## Performance

- **Duration:** 2.4 min
- **Started:** 2026-03-04T14:06:15Z
- **Completed:** 2026-03-04T14:08:44Z
- **Tasks:** 2
- **Files created:** 8 (including package-lock.json)

## Accomplishments
- Full TypeScript project scaffolding deployable to Vercel with zero build config
- Secure webhook handler with env gate (404), method gate (405), HMAC-SHA256 verification (401), and valid response (200)
- Sentry error monitoring with module-scope initialization and serverless-safe flush in waitUntil
- Clean separation of concerns: types, verification, Sentry, and handler in separate modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Create project scaffolding, types, Sentry module, and verify helper** - `12809e0` (feat)
2. **Task 2: Create main webhook handler with env gate, signature verify, and waitUntil shell** - `d1095be` (feat)

## Files Created/Modified
- `package.json` - Node.js project with 4 runtime dependencies and 2 dev dependencies
- `package-lock.json` - Locked dependency versions (74 packages)
- `tsconfig.json` - TypeScript strict configuration targeting ES2022
- `vercel.json` - Vercel deployment config with trailingSlash: false and maxDuration: 30
- `api/webhook.ts` - Main webhook handler entry point (84 lines)
- `api/lib/types.ts` - Shared TypeScript types and header extraction helper
- `api/lib/sentry.ts` - Sentry init at module scope with flush helper
- `api/lib/verify.ts` - HMAC-SHA256 signature verification wrapper

## Decisions Made
- Used .js extensions in TypeScript imports for ESM compatibility with Vercel's bundler (e.g., `import './lib/sentry.js'`)
- Sentry imported twice: first as side-effect to ensure init runs before other imports, then as namespace for API usage
- processEvent uses generic Record<string, unknown> typing for payload -- full webhook-types integration deferred to Plan 02

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**External services require manual configuration before deployment.** The plan's `user_setup` section specifies:

1. **Vercel project**: Create Vercel project linked to auto-fix-agent GitHub repo (Dashboard -> New Project -> Import)
2. **Environment variables**: Set `GITHUB_WEBHOOK_SECRET` and `SENTRY_DSN` in Vercel Dashboard -> Project -> Settings -> Environment Variables (Production scope only)
3. **Sentry project**: Create new Sentry project named `auto-fix-monitor` (platform: Node.js) to obtain DSN
4. **Webhook secret**: Generate with `openssl rand -hex 32`, save for webhook registration in Plan 02

## Next Phase Readiness
- Handler foundation complete, ready for Plan 02 (event routing, filtering, handler stubs)
- processEvent has TODO marker for Plan 02 router integration
- All imports and module structure support adding router.ts and handlers/ in Plan 02
- Deployment requires user to complete Vercel project setup and environment variable configuration

## Self-Check: PASSED

All 8 created files verified on disk. Both task commits (12809e0, d1095be) verified in git log. Summary file exists.

---
*Phase: 05-webhook-receiver-and-security-foundation*
*Completed: 2026-03-04*
