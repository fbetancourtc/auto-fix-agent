---
phase: 06-event-processing-metrics-and-deduplication
plan: 01
subsystem: metrics, dedup, testing
tags: [sentry, upstash-redis, vitest, metrics, dedup, typescript]

# Dependency graph
requires:
  - phase: 05-webhook-receiver-and-security-foundation
    provides: Sentry SDK init, handler stubs, types.ts, webhook entry point
provides:
  - Centralized metrics module with 10 emit* functions and 3 helper functions
  - Redis-backed dedup guard with fail-open semantics
  - Vitest test infrastructure with 32 passing tests
  - FixOutcome type and MetricTags interface in types.ts
affects: [06-02 handler wiring, 06-03 dedup integration, 07 dashboards]

# Tech tracking
tech-stack:
  added: ["@upstash/redis ^1.36.3", "vitest ^4.0.18"]
  patterns: ["Sentry v10 metrics.count()/distribution()/gauge() with attributes", "Fail-open Redis dedup with SET NX + 24h TTL", "Lazy singleton Redis client for serverless", "fs.readFileSync for JSON config to avoid ESM import assertion issues"]

key-files:
  created:
    - api/lib/metrics.ts
    - api/lib/dedup.ts
    - tests/metrics.test.ts
    - tests/dedup.test.ts
    - vitest.config.ts
  modified:
    - package.json
    - package-lock.json
    - api/lib/types.ts

key-decisions:
  - "Sentry v10 uses metrics.count() not increment(), and attributes not tags -- corrected from RESEARCH.md patterns"
  - "MetricTags interface needs index signature [key: string]: string for Sentry attributes compatibility"
  - "Used class-based mock for @upstash/redis Redis constructor to avoid vitest mock warnings"

patterns-established:
  - "Sentry metric emission pattern: Sentry.metrics.count(name, value, { attributes }) for counters"
  - "Sentry distribution pattern: Sentry.metrics.distribution(name, value, { attributes, unit }) for timing"
  - "Sentry gauge pattern: Sentry.metrics.gauge(name, value, { attributes }) for spend tracking"
  - "Dedup pattern: Redis SET NX with fail-open catch returning false on errors"

requirements-completed: [INFRA-03, OPS-01, OPS-02, OPS-04, VAL-01, VAL-02, VAL-03, VAL-04, SAFE-01, SAFE-02, SAFE-03, SAFE-04]

# Metrics
duration: 6min
completed: 2026-03-06
---

# Phase 6 Plan 01: Metrics Module, Dedup Module, and Test Infrastructure Summary

**Centralized Sentry metrics emission (10 functions) and Upstash Redis dedup guard with vitest test suite (32 tests)**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-06T20:08:33Z
- **Completed:** 2026-03-06T20:14:44Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Centralized metrics module exporting 10 emit* functions covering all OPS, VAL, and SAFE requirements
- Redis-backed dedup guard with fail-open semantics, lazy singleton client, 24-hour TTL
- Vitest test infrastructure from scratch: config, 24 metric tests + 8 dedup tests (32 total)
- FixOutcome type (5 categories per OPS-02) and MetricTags interface added to types.ts
- Helper functions: buildMetricTags (repo-stack-map lookup), computeMttrMs (with validation), estimateCostUsd (duration-based formula)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, create vitest config, and build metrics module with tests** - `5006c82` (feat)
2. **Task 2: Build dedup module with tests** - `caeafcf` (feat)

## Files Created/Modified
- `api/lib/metrics.ts` - Centralized metric emission: 10 emit* functions, buildMetricTags, computeMttrMs, estimateCostUsd
- `api/lib/dedup.ts` - Redis-backed dedup guard: isDuplicate() with fail-open semantics
- `api/lib/types.ts` - Added FixOutcome type (5 outcome categories) and MetricTags interface
- `tests/metrics.test.ts` - 24 unit tests for all metric functions against Sentry.metrics spy calls
- `tests/dedup.test.ts` - 8 unit tests for dedup (new/duplicate/error/no-config scenarios)
- `vitest.config.ts` - Minimal ESM config with tests/**/*.test.ts include
- `package.json` - Added @upstash/redis dependency, vitest devDependency, test script
- `package-lock.json` - Lockfile updated with new dependencies

## Decisions Made
- **Sentry v10 API correction:** RESEARCH.md documented `Sentry.metrics.increment()` with `tags`, but actual v10 types use `Sentry.metrics.count()` with `attributes`. Updated all emit* functions and tests to match the real API.
- **MetricTags index signature:** Added `[key: string]: string` index signature to MetricTags interface for compatibility with Sentry's `Record<string, unknown>` attributes type.
- **Class-based Redis mock:** Used ES class syntax for @upstash/redis mock instead of vi.fn().mockImplementation() to avoid vitest "did not use function or class" warnings and ensure proper singleton behavior in tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Sentry v10 metrics API: count() not increment(), attributes not tags**
- **Found during:** Task 1 (metrics module implementation)
- **Issue:** RESEARCH.md Pattern 1 used `Sentry.metrics.increment()` with `{ tags }` which does not exist in @sentry/node v10. The actual API uses `Sentry.metrics.count()` with `{ attributes }`.
- **Fix:** Updated all emit* functions from `.increment()` to `.count()` and from `{ tags }` to `{ attributes }`. Updated all 24 test assertions accordingly.
- **Files modified:** api/lib/metrics.ts, tests/metrics.test.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors, all 24 tests pass
- **Committed in:** 5006c82 (Task 1 commit)

**2. [Rule 1 - Bug] Added index signature to MetricTags for Sentry attributes compatibility**
- **Found during:** Task 1 (TypeScript type check)
- **Issue:** MetricTags interface without index signature is not assignable to `Record<string, unknown>` required by Sentry's MetricOptions.attributes
- **Fix:** Added `[key: string]: string` index signature to MetricTags interface in types.ts
- **Files modified:** api/lib/types.ts
- **Verification:** `npx tsc --noEmit` passes cleanly
- **Committed in:** 5006c82 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs from outdated research patterns)
**Impact on plan:** Both fixes necessary for type correctness. No scope creep. The Sentry v10 API surface differs from the research documentation, which was based on older SDK examples.

## Issues Encountered
- Vitest mock for @upstash/redis `Redis` constructor required class-based mock syntax instead of `vi.fn().mockImplementation()` to properly handle the singleton caching pattern in dedup.ts. Resolved by using ES class in the mock factory.

## User Setup Required

Plan frontmatter specifies Upstash Redis setup needed for production:
- **UPSTASH_REDIS_REST_URL**: From Upstash Console -> Create Database (free tier) -> REST URL
- **UPSTASH_REDIS_REST_TOKEN**: From Upstash Console -> Create Database (free tier) -> REST Token
- The dedup module works without these vars (fail-open returns false), so setup is only needed for deduplication functionality.

## Next Phase Readiness
- Metrics module ready for Plan 02 handler wiring: all 10 emit* functions exported and tested
- Dedup module ready for Plan 03 processEvent integration: isDuplicate() exported and tested
- buildMetricTags, computeMttrMs, estimateCostUsd helper functions ready for handler use
- Vitest config established for ongoing test development

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 06-event-processing-metrics-and-deduplication*
*Completed: 2026-03-06*
