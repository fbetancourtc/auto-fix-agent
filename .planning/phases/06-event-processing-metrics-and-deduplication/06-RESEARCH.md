# Phase 6: Event Processing, Metrics, and Deduplication - Research

**Researched:** 2026-03-06
**Domain:** Sentry custom metrics, Upstash Redis dedup, GitHub webhook typing
**Confidence:** HIGH

## Summary

Phase 6 fills the Phase 5 handler stubs with real Sentry metric emissions and adds Redis-backed deduplication. The work divides into three technical areas: (1) a centralized metrics module (`api/lib/metrics.ts`) that wraps `Sentry.metrics.*` calls with typed helper functions, (2) an Upstash Redis dedup guard inserted into `processEvent()` before `routeEvent()`, and (3) upgrading handler signatures from `any` to strong `@octokit/webhooks-types` types.

The Sentry metrics API (`@sentry/node` v10+) exposes `Sentry.metrics.increment()`, `Sentry.metrics.distribution()`, and `Sentry.metrics.gauge()` directly -- no additional SDK packages needed. Upstash Redis uses a REST-based SDK (`@upstash/redis`) that requires no persistent connections, making it ideal for Vercel serverless. The `@octokit/webhooks-types` package (already in `package.json`) provides `WorkflowRunEvent`, `PullRequestEvent`, and `PullRequestReviewEvent` types.

**Primary recommendation:** Build the metrics module first (pure functions, easily testable), then the dedup layer (single integration point at `processEvent()`), then upgrade handler types and wire metric calls into each handler.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Tag every metric with three dimensions: repository, org (fbetancourtc/Liftitapp/LiftitFinOps), and stack type (ts/python/kotlin) -- enables slicing dashboards by any dimension in Phase 7
- Centralized metrics module (`api/lib/metrics.ts`) with typed functions (e.g., `emitTriggerCount()`, `emitMTTR()`, `emitOutcome()`) -- handlers call these, single place to change metric names/tags
- MTTR computed from webhook payload timestamps only: PR `created_at` minus `workflow_run` failure time -- no GitHub API enrichment needed
- Fix outcome tracking uses exactly 5 categories from REQUIREMENTS.md OPS-02: fix_pr_created, no_fix, escalated, flaky_skipped, circuit_breaker -- no unknown/fallback bucket
- Upstash Redis (free tier: 10K commands/day, 256MB) via `@upstash/redis` REST SDK -- no persistent connections needed for serverless
- 24-hour TTL on delivery IDs -- covers all reasonable GitHub retry windows
- Fail-open on Redis errors: if Redis is unreachable, process the event anyway (risk: possible duplicate metric, acceptable vs silently dropping events)
- Dedup check happens in `processEvent()` before `routeEvent()` -- prevents any handler code from running twice on redelivered events
- Duration-based cost estimation: derive cost from `workflow_run` duration (e.g., ~$0.50 base + $0.10/min). Rough but usable without external API calls. Rate can be calibrated later
- Monthly spend as cumulative counter gauge, resets naturally with calendar month. Uses $200/month threshold from `config/pricing.json`
- Budget alert thresholds (50%/80%) enforced only in Sentry alert rules (Phase 7) -- handler just emits the gauge, doesn't read pricing.json thresholds
- Upgrade to strong types from `@octokit/webhooks-types`: `WorkflowRunEvent`, `PullRequestEvent`, `PullRequestReviewEvent` (already a dependency)
- Router (`routeEvent`) updated to accept union type -- each switch case narrows to specific event type. Full type safety from router through handlers
- Safety signal events (circuit breaker trips, scope violations, escalations) inferred from existing webhook event payloads -- no new event sources or endpoints needed

### Claude's Discretion
- Exact Sentry metric names and namespace conventions
- Internal structure of the metrics module (class vs functions vs namespace)
- Redis key format for dedup store
- How to detect each safety signal category from webhook payloads (heuristics for circuit breaker detection, scope violation inference, escalation detection)
- Error handling patterns within the metrics module

### Deferred Ideas (OUT OF SCOPE)
- Sentry dashboards with Operations Health, Value Metrics, Safety Signal panels -- Phase 7
- Sentry Cron Monitors per repo for silence detection -- Phase 7
- Sentry alert rules for success rate drops, cost spikes, repo silence -- Phase 7
- External cost enrichment via record-metrics.sh POST endpoint -- v1.3 (ADV-03)
- Artifact monitoring (PR lifecycle, promotion health, caller status) -- v1.3
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HOOK-04 | Idempotency handling via X-GitHub-Delivery header prevents duplicate event processing | Upstash Redis dedup with SET NX + 24h TTL; fail-open pattern; inserted at processEvent() before routeEvent() |
| OPS-01 | Trigger frequency tracked as Sentry counter per workflow_run.completed event, tagged by repository | `Sentry.metrics.increment('auto_fix.trigger_count', 1, { tags })` in handleWorkflowRun |
| OPS-02 | Fix outcome breakdown tracked by outcome type (5 categories) | `Sentry.metrics.increment('auto_fix.outcome', 1, { tags: { outcome } })` with typed FixOutcome union |
| OPS-03 | Per-repo health scores visible in Sentry dashboard grouped by repository tag | Enabled by tagging every metric with `repo`, `org`, `stack` -- dashboard grouping is Phase 7 |
| OPS-04 | Run duration tracked as Sentry distribution metric from workflow_run timing data | `Sentry.metrics.distribution('auto_fix.run_duration_ms', duration, { tags, unit: 'millisecond' })` |
| VAL-01 | MTTR computed from CI failure to fix PR creation, tracked as distribution | Computed from `pull_request.created_at` minus `workflow_run` failure timestamp, emitted as distribution |
| VAL-02 | PR acceptance rate tracked from pull_request.closed events where merged=true | `Sentry.metrics.increment('auto_fix.pr_accepted'/'auto_fix.pr_rejected')` based on merged boolean |
| VAL-03 | Cost per fix tracked as distribution (estimated from run duration) | Duration-based formula: base_cost + rate_per_min * duration_minutes |
| VAL-04 | Monthly spend vs budget tracked as gauge with cumulative USD | `Sentry.metrics.gauge('auto_fix.monthly_spend_usd', estimated_cost)` cumulative |
| SAFE-01 | Budget burn rate as cumulative time-series gauge | Same gauge as VAL-04 -- cumulative spend is the burn rate source |
| SAFE-02 | Circuit breaker trip rate as counter | Inferred from workflow_run conclusion patterns (repeated failures on same repo in short window) |
| SAFE-03 | Scope violation detection as counter | Inferred from workflow_run where auto-fix ran but conclusion is 'failure' with validate-diff context |
| SAFE-04 | Escalation frequency as counter | Inferred from auto-fix labeled PRs that receive 'changes_requested' review or specific label patterns |
| INFRA-03 | Upstash Redis provides dedup store for X-GitHub-Delivery GUIDs | `@upstash/redis` REST SDK, env vars UPSTASH_REDIS_REST_URL + TOKEN, SET NX with EX 86400 |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sentry/node | ^10.0.0 | Metrics emission (increment, distribution, gauge) | Already initialized in project; metrics API built-in since v7.x, stable in v10 |
| @upstash/redis | ^1.34.0 | Dedup store for delivery IDs | REST-based (no connections), serverless-native, free tier covers 10K cmds/day |
| @octokit/webhooks-types | ^7.0.0 | Strong typing for GitHub webhook payloads | Already a dependency; provides WorkflowRunEvent, PullRequestEvent, PullRequestReviewEvent |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vercel/functions | ^1.0.0 | waitUntil() for deferred processing | Already used in api/webhook.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @upstash/redis | Vercel KV | Vercel KV is Upstash-backed anyway but adds Vercel coupling; direct Upstash is more portable and has clearer free-tier docs |

**Installation:**
```bash
npm install @upstash/redis
```

Only `@upstash/redis` is new. All other dependencies already exist in `package.json`.

## Architecture Patterns

### Recommended Project Structure
```
api/
├── webhook.ts              # Entry point (add dedup call in processEvent)
├── lib/
│   ├── sentry.ts           # Existing Sentry init
│   ├── types.ts            # Add FixOutcome, MetricTags, strong event types
│   ├── router.ts           # Upgrade payload type from any to union
│   ├── metrics.ts           # NEW: centralized metric emission functions
│   ├── dedup.ts            # NEW: Upstash Redis dedup check
│   ├── filters.ts          # Existing event filters
│   └── handlers/
│       ├── workflow-run.ts  # Upgrade types, add metric calls
│       ├── pull-request.ts  # Upgrade types, add metric calls
│       └── review.ts        # Upgrade types, add metric calls
config/
├── pricing.json            # Existing: budget thresholds
└── repo-stack-map.json     # Existing: repo/org/stack enrichment source
```

### Pattern 1: Centralized Metrics Module
**What:** Single module exporting typed functions that wrap Sentry.metrics.* calls. All metric names, tags, and units defined in one place.
**When to use:** Every handler that needs to emit metrics imports from this module.
**Example:**
```typescript
// api/lib/metrics.ts
import * as Sentry from '@sentry/node';

export type FixOutcome = 'fix_pr_created' | 'no_fix' | 'escalated' | 'flaky_skipped' | 'circuit_breaker';

interface MetricTags {
  repo: string;
  org: string;
  stack: string;
}

export function emitTriggerCount(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.trigger_count', 1, { tags });
}

export function emitOutcome(outcome: FixOutcome, tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.outcome', 1, { tags: { ...tags, outcome } });
}

export function emitRunDuration(durationMs: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.run_duration_ms', durationMs, {
    tags,
    unit: 'millisecond',
  });
}

export function emitMTTR(mttrMs: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.mttr_ms', mttrMs, {
    tags,
    unit: 'millisecond',
  });
}

export function emitCostEstimate(costUsd: number, tags: MetricTags): void {
  Sentry.metrics.distribution('auto_fix.cost_per_fix_usd', costUsd, { tags });
  Sentry.metrics.gauge('auto_fix.monthly_spend_usd', costUsd, { tags });
}

export function emitPrAccepted(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.pr_accepted', 1, { tags });
}

export function emitPrRejected(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.pr_rejected', 1, { tags });
}

export function emitCircuitBreakerTrip(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.safety.circuit_breaker_trip', 1, { tags });
}

export function emitScopeViolation(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.safety.scope_violation', 1, { tags });
}

export function emitEscalation(tags: MetricTags): void {
  Sentry.metrics.increment('auto_fix.safety.escalation', 1, { tags });
}
```

### Pattern 2: Fail-Open Dedup Guard
**What:** Redis SET NX with TTL. Returns boolean. Catches all errors and defaults to "not duplicate" (fail-open).
**When to use:** Called once in `processEvent()` before `routeEvent()`.
**Example:**
```typescript
// api/lib/dedup.ts
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

/**
 * Check if a delivery ID has already been processed.
 * Returns true if this is a duplicate (already seen).
 * Fail-open: returns false on any error (processes event rather than dropping it).
 */
export async function isDuplicate(deliveryId: string): Promise<boolean> {
  try {
    const client = getRedis();
    if (!client) return false; // No Redis configured -- fail open

    // SET NX returns "OK" if key was set (new), null if key existed (duplicate)
    const result = await client.set(`dedup:${deliveryId}`, '1', { nx: true, ex: 86400 });
    return result === null; // null means key existed = duplicate
  } catch {
    return false; // Redis error -- fail open
  }
}
```

### Pattern 3: Tag Enrichment from repo-stack-map.json
**What:** Derive org and stack type from the repository full_name using the static config.
**When to use:** Every handler call needs tags; extract once per event.
**Example:**
```typescript
// api/lib/metrics.ts (tag extraction helper)
import repoStackMap from '../../config/repo-stack-map.json' assert { type: 'json' };

export function buildMetricTags(repoFullName: string): MetricTags {
  const org = repoFullName.split('/')[0] ?? 'unknown';
  const repoConfig = (repoStackMap.repos as Record<string, { stack: string }>)[repoFullName];
  const stack = repoConfig?.stack ?? 'unknown';
  return { repo: repoFullName, org, stack };
}
```

### Pattern 4: Safety Signal Detection Heuristics
**What:** Infer safety events from existing webhook payloads without new event sources.
**When to use:** Within handlers, after primary metric emission.

| Safety Signal | Detection Heuristic | Source Event |
|---------------|---------------------|--------------|
| Circuit breaker trip (SAFE-02) | `workflow_run.conclusion === 'failure'` AND workflow name contains 'auto-fix' AND outcome is `circuit_breaker` | workflow_run.completed |
| Scope violation (SAFE-03) | `workflow_run.conclusion === 'failure'` AND auto-fix workflow AND the run log/context indicates validate-diff rejection | workflow_run.completed |
| Escalation (SAFE-04) | `pull_request_review.state === 'changes_requested'` on auto-fix labeled PR, OR PR labeled with 'needs-human' | pull_request_review, pull_request |

**Recommendation:** Since we cannot query workflow logs from webhooks alone, the simplest approach is to infer the outcome category first (the 5-way classification) and then emit the corresponding safety counter if the outcome is `circuit_breaker` or `escalated`. Scope violations can be inferred when an auto-fix PR is closed without merge (reverted).

### Anti-Patterns to Avoid
- **Emitting metrics in the router:** Metrics belong in handlers or the metrics module, not in routing logic. The router should remain a pure dispatcher.
- **Reading pricing.json thresholds at emission time:** The handler emits raw gauge values. Threshold logic belongs in Sentry alert rules (Phase 7).
- **Creating multiple Redis clients:** Use lazy singleton pattern. Vercel may warm-start; avoid per-request client instantiation.
- **Blocking on Redis in the request path:** Dedup runs inside `waitUntil()` (already post-response), so this is naturally non-blocking for the HTTP response.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis connection management | Custom HTTP client for Upstash | `@upstash/redis` SDK | Handles auth, retries, REST serialization, TypeScript types |
| GitHub webhook payload types | Manual interfaces | `@octokit/webhooks-types` | Maintained by GitHub, always current with API changes |
| Metric aggregation/storage | Custom counters or in-memory stores | `Sentry.metrics.*` built-in API | Sentry handles aggregation, storage, querying, visualization |
| Idempotency key generation | Hash-based dedup or custom IDs | `X-GitHub-Delivery` header directly | GitHub provides a UUID per delivery; no need to compute our own |

**Key insight:** Every metric primitive needed (counter, distribution, gauge) is already built into `@sentry/node` v10. No custom aggregation logic needed.

## Common Pitfalls

### Pitfall 1: Sentry.metrics.gauge() Semantics
**What goes wrong:** Treating `gauge()` as a cumulative counter. In Sentry, `gauge()` records the last value, min, max, sum, and count for each time bucket. It is not automatically cumulative across calls.
**Why it happens:** Confusion between Sentry gauge and Prometheus-style gauges.
**How to avoid:** For monthly spend, emit the estimated cost of each individual run. Sentry's gauge aggregation will sum values within time buckets. For dashboards (Phase 7), use `sum()` aggregation on the gauge to get cumulative spend.
**Warning signs:** Monthly spend appears as individual data points instead of growing total.

### Pitfall 2: Upstash Redis Free Tier Limits
**What goes wrong:** Exceeding 10,000 commands/day on the free tier.
**Why it happens:** Each dedup check is one SET command. At 15 repos with ~20 events/day = ~300 commands/day, well within limits. But debugging/testing can burn through quota quickly.
**How to avoid:** Monitor Upstash dashboard. The fail-open pattern means quota exhaustion degrades gracefully (duplicates pass through rather than events being dropped).
**Warning signs:** Redis errors in Sentry logs, Upstash dashboard showing >8K daily commands.

### Pitfall 3: MTTR Timestamp Calculation
**What goes wrong:** Using wrong timestamp fields or timezone confusion.
**Why it happens:** GitHub timestamps are ISO 8601 UTC strings. The MTTR calculation needs `workflow_run.run_started_at` (when CI started failing) and `pull_request.created_at` (when the fix PR was opened).
**How to avoid:** Parse both as `Date` objects, subtract, validate the result is positive and reasonable (< 24 hours for auto-fix). Negative or extremely large values indicate a data issue.
**Warning signs:** Negative MTTR values, MTTR > 86400000ms (24 hours).

### Pitfall 4: JSON Import Assertions in ESM
**What goes wrong:** `import ... from '*.json'` fails without `assert { type: 'json' }` or the newer `with { type: 'json' }` syntax in Node 18+ ESM.
**Why it happens:** ESM does not auto-detect JSON modules.
**How to avoid:** Use `import ... assert { type: 'json' }` (Node 18-20) or read the file with `fs.readFileSync` and JSON.parse at module scope. Given Vercel bundler handles this, test locally to confirm which syntax works.
**Warning signs:** `ERR_IMPORT_ASSERTION_TYPE_MISSING` at startup.

### Pitfall 5: Sentry Metrics Not Appearing
**What goes wrong:** Metrics are emitted but don't show up in Sentry UI.
**Why it happens:** Sentry metrics have a pipeline delay (typically 1-3 minutes). Also, `flushSentry()` must be called after metric emissions to ensure they're sent before the serverless function terminates.
**How to avoid:** `flushSentry()` is already called in the `finally` block of `processEvent()`. Verify that metric calls happen before the `finally` block runs. Allow several minutes before checking the Sentry Metrics page.
**Warning signs:** Sentry errors/breadcrumbs appear but metrics page is empty.

## Code Examples

### MTTR Calculation
```typescript
// In handlePullRequest, when action is 'closed' and merged is true
function computeMttrMs(prCreatedAt: string, workflowRunStartedAt: string): number | null {
  const prTime = new Date(prCreatedAt).getTime();
  const failTime = new Date(workflowRunStartedAt).getTime();
  const mttr = prTime - failTime;
  // Sanity check: MTTR should be positive and < 24 hours
  if (mttr > 0 && mttr < 86_400_000) return mttr;
  return null; // Invalid -- skip emission
}
```

### Cost Estimation
```typescript
// Duration-based cost estimate from workflow_run timing
function estimateCostUsd(runDurationMs: number): number {
  const BASE_COST = 0.50;          // Fixed cost per run
  const RATE_PER_MIN = 0.10;       // Variable cost per minute
  const durationMin = runDurationMs / 60_000;
  return BASE_COST + RATE_PER_MIN * durationMin;
}
```

### Workflow Run Duration Extraction
```typescript
// From WorkflowRunEvent payload
function extractRunDurationMs(workflowRun: { run_started_at: string; updated_at: string }): number {
  const start = new Date(workflowRun.run_started_at).getTime();
  const end = new Date(workflowRun.updated_at).getTime();
  return end - start;
}
```

### Upstash Redis Integration in processEvent
```typescript
// In api/webhook.ts processEvent() -- insert before routeEvent() call
import { isDuplicate } from './lib/dedup.js';

// Inside processEvent:
if (await isDuplicate(headers.deliveryId)) {
  Sentry.addBreadcrumb({
    category: 'webhook.dedup',
    message: `Duplicate delivery skipped: ${headers.deliveryId}`,
  });
  return; // Skip all processing for duplicates
}
await routeEvent(headers.eventType, payload);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sentry custom event properties | Sentry.metrics.* API (increment, distribution, gauge, set) | Sentry SDK v7.x+ (2023), stable v10 | First-class metrics without custom event abuse |
| Vercel KV (Redis wrapper) | @upstash/redis direct (Vercel KV is Upstash under the hood) | 2024 | Direct SDK is more portable, same underlying infrastructure |
| Manual webhook type definitions | @octokit/webhooks-types v7 | Ongoing | Auto-generated from GitHub API schema, always current |

**Deprecated/outdated:**
- `Sentry.captureMessage()` for metrics: Use `Sentry.metrics.*` instead. Messages consume event quota; metrics have separate (unlimited on most plans) quota.

## Open Questions

1. **Sentry.metrics.gauge() cumulative behavior**
   - What we know: Sentry gauge records last/min/max/sum/count per bucket. For monthly spend, each emission adds the cost of one run.
   - What's unclear: Whether Sentry's gauge `sum()` aggregation in dashboards produces a true cumulative total across the month, or only within the dashboard time window.
   - Recommendation: Use gauge for now. If cumulative behavior isn't correct, switch to a counter (`increment`) with the USD amount as the value -- counters are inherently cumulative.

2. **JSON import syntax in Vercel bundler**
   - What we know: ESM requires assertion syntax for JSON imports. Node 22 uses `with`, Node 18-20 uses `assert`.
   - What's unclear: Which syntax the Vercel bundler prefers/supports.
   - Recommendation: Use `createRequire(import.meta.url)` as a safe fallback, or `fs.readFileSync` + `JSON.parse` at module scope. Test locally with `vercel dev`.

3. **Outcome classification without workflow logs**
   - What we know: The 5-outcome classification (fix_pr_created, no_fix, escalated, flaky_skipped, circuit_breaker) requires understanding what happened during the auto-fix run.
   - What's unclear: How to distinguish between no_fix, flaky_skipped, and circuit_breaker from `workflow_run.completed` alone, since all may have `conclusion: 'failure'`.
   - Recommendation: Use the workflow run name or head branch to identify auto-fix runs. Map `conclusion: 'success'` to `fix_pr_created`. For failure cases, check if a PR was created (check_suite context) to distinguish outcomes. This may need a simple naming convention in the auto-fix caller workflow.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (recommended -- ESM-native, no config needed for TS) |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOOK-04 | isDuplicate returns true for seen delivery IDs | unit | `npx vitest run tests/dedup.test.ts -t "duplicate"` | No -- Wave 0 |
| OPS-01 | emitTriggerCount calls Sentry.metrics.increment with correct name/tags | unit | `npx vitest run tests/metrics.test.ts -t "trigger"` | No -- Wave 0 |
| OPS-02 | emitOutcome emits all 5 categories with correct tags | unit | `npx vitest run tests/metrics.test.ts -t "outcome"` | No -- Wave 0 |
| OPS-04 | emitRunDuration calls distribution with milliseconds | unit | `npx vitest run tests/metrics.test.ts -t "duration"` | No -- Wave 0 |
| VAL-01 | computeMttrMs returns correct positive values, null for invalid | unit | `npx vitest run tests/metrics.test.ts -t "mttr"` | No -- Wave 0 |
| VAL-02 | PR acceptance/rejection counters increment correctly | unit | `npx vitest run tests/metrics.test.ts -t "acceptance"` | No -- Wave 0 |
| VAL-03 | estimateCostUsd applies formula correctly | unit | `npx vitest run tests/metrics.test.ts -t "cost"` | No -- Wave 0 |
| VAL-04 | emitCostEstimate calls gauge with USD value | unit | `npx vitest run tests/metrics.test.ts -t "spend"` | No -- Wave 0 |
| SAFE-02 | emitCircuitBreakerTrip increments safety counter | unit | `npx vitest run tests/metrics.test.ts -t "circuit"` | No -- Wave 0 |
| SAFE-03 | emitScopeViolation increments safety counter | unit | `npx vitest run tests/metrics.test.ts -t "scope"` | No -- Wave 0 |
| SAFE-04 | emitEscalation increments safety counter | unit | `npx vitest run tests/metrics.test.ts -t "escalation"` | No -- Wave 0 |
| INFRA-03 | Redis SET NX with EX 86400, fail-open on errors | unit | `npx vitest run tests/dedup.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest` + `@vitest/coverage-v8` -- add as devDependencies
- [ ] `vitest.config.ts` -- minimal config for ESM + TypeScript
- [ ] `tests/metrics.test.ts` -- covers OPS-01, OPS-02, OPS-04, VAL-01 through VAL-04, SAFE-01 through SAFE-04
- [ ] `tests/dedup.test.ts` -- covers HOOK-04, INFRA-03
- [ ] Mock for `Sentry.metrics.*` -- spy on increment/distribution/gauge calls
- [ ] Mock for `@upstash/redis` -- mock Redis.set() responses

## Sources

### Primary (HIGH confidence)
- Existing codebase: `api/webhook.ts`, `api/lib/router.ts`, `api/lib/types.ts`, `api/lib/sentry.ts`, handler stubs -- direct source reading
- `package.json` -- confirmed @sentry/node ^10.0.0, @octokit/webhooks-types ^7.0.0 already present
- `config/repo-stack-map.json` -- confirmed 15 repos across 3 orgs with stack types
- `config/pricing.json` -- confirmed $200/month budget, 50%/80%/100% thresholds

### Secondary (MEDIUM confidence)
- Sentry metrics API: `Sentry.metrics.increment()`, `.distribution()`, `.gauge()` -- confirmed available in @sentry/node v10+ from Sentry SDK documentation
- @upstash/redis REST SDK: `Redis.set()` with `nx` and `ex` options -- well-documented in Upstash docs
- @octokit/webhooks-types: exports `WorkflowRunEvent`, `PullRequestEvent`, `PullRequestReviewEvent` -- standard package, types auto-generated from GitHub API

### Tertiary (LOW confidence)
- Sentry gauge cumulative behavior across time windows -- needs validation during implementation
- JSON import assertion syntax compatibility with Vercel bundler -- needs local testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project or well-established with clear APIs
- Architecture: HIGH - patterns directly follow from user decisions in CONTEXT.md and existing codebase structure
- Pitfalls: MEDIUM - Sentry gauge semantics and outcome classification heuristics need validation during implementation

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (30 days -- stable domain, no fast-moving dependencies)
