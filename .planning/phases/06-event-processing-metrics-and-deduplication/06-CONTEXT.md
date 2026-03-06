# Phase 6: Event Processing, Metrics, and Deduplication - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Transform the Phase 5 handler stubs into real telemetry emitters. Every auto-fix pipeline event produces structured Sentry metrics (counters, distributions, gauges) for operations health, value metrics, and safety signals. Add deduplication via Upstash Redis to prevent inflated counts from GitHub redeliveries. No dashboards or alert rules -- those are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Metric Granularity and Tagging
- Tag every metric with three dimensions: repository, org (fbetancourtc/Liftitapp/LiftitFinOps), and stack type (ts/python/kotlin) -- enables slicing dashboards by any dimension in Phase 7
- Centralized metrics module (`api/lib/metrics.ts`) with typed functions (e.g., `emitTriggerCount()`, `emitMTTR()`, `emitOutcome()`) -- handlers call these, single place to change metric names/tags
- MTTR computed from webhook payload timestamps only: PR `created_at` minus `workflow_run` failure time -- no GitHub API enrichment needed
- Fix outcome tracking uses exactly 5 categories from REQUIREMENTS.md OPS-02: fix_pr_created, no_fix, escalated, flaky_skipped, circuit_breaker -- no unknown/fallback bucket

### Deduplication Strategy
- Upstash Redis (free tier: 10K commands/day, 256MB) via `@upstash/redis` REST SDK -- no persistent connections needed for serverless
- 24-hour TTL on delivery IDs -- covers all reasonable GitHub retry windows
- Fail-open on Redis errors: if Redis is unreachable, process the event anyway (risk: possible duplicate metric, acceptable vs silently dropping events)
- Dedup check happens in `processEvent()` before `routeEvent()` -- prevents any handler code from running twice on redelivered events

### Cost and Spend Tracking
- Duration-based cost estimation: derive cost from `workflow_run` duration (e.g., ~$0.50 base + $0.10/min). Rough but usable without external API calls. Rate can be calibrated later
- Monthly spend as cumulative counter gauge, resets naturally with calendar month. Uses $200/month threshold from `config/pricing.json`
- Budget alert thresholds (50%/80%) enforced only in Sentry alert rules (Phase 7) -- handler just emits the gauge, doesn't read pricing.json thresholds

### Handler Typing Strategy
- Upgrade to strong types from `@octokit/webhooks-types`: `WorkflowRunEvent`, `PullRequestEvent`, `PullRequestReviewEvent` (already a dependency)
- Router (`routeEvent`) updated to accept union type -- each switch case narrows to specific event type. Full type safety from router through handlers
- Safety signal events (circuit breaker trips, scope violations, escalations) inferred from existing webhook event payloads -- no new event sources or endpoints needed

### Claude's Discretion
- Exact Sentry metric names and namespace conventions
- Internal structure of the metrics module (class vs functions vs namespace)
- Redis key format for dedup store
- How to detect each safety signal category from webhook payloads (heuristics for circuit breaker detection, scope violation inference, escalation detection)
- Error handling patterns within the metrics module

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `api/lib/router.ts`: routeEvent() switch dispatches to 3 handlers -- metrics module will be called from within each handler
- `api/lib/types.ts`: ProcessEventResult, WebhookHeaders, extractHeaders() -- deliveryId already extracted for dedup
- `api/lib/sentry.ts`: Sentry.init() at module scope, flushSentry() helper -- metrics will use same Sentry instance
- `api/lib/handlers/workflow-run.ts`, `pull-request.ts`, `review.ts`: Stub handlers with breadcrumbs and `// Phase 6 will emit Sentry metrics here` comments
- `config/pricing.json`: Budget thresholds ($200/month, 50%/80% alerts) -- cost estimation can reference these rates
- `config/repo-stack-map.json`: Registry of 15 repos with stack types, allowed_dirs -- source for repo/org/stack tags

### Established Patterns
- ESM with `.js` extensions in imports (Vercel bundler compat)
- Side-effect Sentry import first, then namespace import
- Response-first pattern: verify -> respond 200 -> waitUntil(processEvent)
- Sentry breadcrumbs for filtering decisions (category: 'webhook.filter')

### Integration Points
- `processEvent()` in `api/webhook.ts` -- dedup check inserts before `routeEvent()` call (line 79)
- Handler stubs -- replace breadcrumb-only stubs with metric emission calls
- `package.json` -- add `@upstash/redis` dependency
- New env vars needed: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (Vercel Production only)

</code_context>

<specifics>
## Specific Ideas

- Phase 5 CONTEXT explicitly deferred metric emission and deduplication to this phase
- STATE.md research flags: verify `waitUntil()` behavior on Hobby plan under Fluid Compute; confirm Upstash Redis lower-friction binding approach
- repo-stack-map.json can enrich every metric with org + stack type without any GitHub API calls
- Sentry metrics API: `Sentry.metrics.increment()` for counters, `Sentry.metrics.distribution()` for MTTR/duration/cost, `Sentry.metrics.gauge()` for budget spend

</specifics>

<deferred>
## Deferred Ideas

- Sentry dashboards with Operations Health, Value Metrics, Safety Signal panels -- Phase 7
- Sentry Cron Monitors per repo for silence detection -- Phase 7
- Sentry alert rules for success rate drops, cost spikes, repo silence -- Phase 7
- External cost enrichment via record-metrics.sh POST endpoint -- v1.3 (ADV-03)
- Artifact monitoring (PR lifecycle, promotion health, caller status) -- v1.3

</deferred>

---

*Phase: 06-event-processing-metrics-and-deduplication*
*Context gathered: 2026-03-06*
