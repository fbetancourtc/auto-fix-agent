# Requirements: Auto-Fix Agent v1.2

**Defined:** 2026-03-03
**Core Value:** When CI fails on any monitored repo, an AI agent automatically fixes the code and opens a PR — reducing mean-time-to-fix from hours to minutes.

## v1.2 Requirements

Requirements for Monitoring & Observability milestone. Each maps to roadmap phases.

### Webhook Receiver

- [ ] **HOOK-01**: Vercel serverless function (`/api/webhook.ts`) receives GitHub webhook events and responds 200 within 5 seconds
- [ ] **HOOK-02**: HMAC-SHA256 signature verification rejects unsigned or tampered requests before any processing
- [ ] **HOOK-03**: Event type routing dispatches `workflow_run`, `pull_request`, and `pull_request_review` events to appropriate handlers
- [ ] **HOOK-04**: Idempotency handling via `X-GitHub-Delivery` header prevents duplicate event processing
- [ ] **HOOK-05**: Async processing via `waitUntil()` defers Sentry calls after immediate 200 response
- [ ] **HOOK-06**: Event filtering limits processing to `workflow_run.completed`, PRs with `auto-fix` label, and reviews on those PRs

### Operations Health

- [ ] **OPS-01**: Trigger frequency tracked as Sentry counter per `workflow_run.completed` event, tagged by repository
- [ ] **OPS-02**: Fix outcome breakdown tracked by outcome type (fix_pr_created, no_fix, escalated, flaky_skipped, circuit_breaker)
- [ ] **OPS-03**: Per-repo health scores visible in Sentry dashboard grouped by repository tag
- [ ] **OPS-04**: Run duration tracked as Sentry distribution metric from workflow_run timing data

### Value Metrics

- [ ] **VAL-01**: Mean-time-to-fix (MTTR) computed from CI failure timestamp to fix PR creation, tracked as Sentry distribution
- [ ] **VAL-02**: PR acceptance rate tracked from `pull_request.closed` events where merged=true and label is auto-fix
- [ ] **VAL-03**: Cost per fix tracked as Sentry distribution metric (estimated from run duration, labeled as estimate)
- [ ] **VAL-04**: Monthly spend vs budget tracked as Sentry gauge with cumulative USD

### Safety Signals

- [ ] **SAFE-01**: Budget burn rate visualized as cumulative time-series gauge in Sentry
- [ ] **SAFE-02**: Circuit breaker trip rate tracked as Sentry counter on circuit breaker events
- [ ] **SAFE-03**: Scope violation detection tracked as Sentry counter on validate-diff.sh reverts
- [ ] **SAFE-04**: Escalation frequency tracked as Sentry counter on needs-human escalations

### Sentry Integration

- [ ] **SENT-01**: Sentry SDK initialized in webhook function with error capture for receiver failures
- [ ] **SENT-02**: Custom Sentry dashboard with Operations Health, Value Metrics, and Safety Signal panels
- [ ] **SENT-03**: Sentry Cron Monitors per enrolled repo detect repos that stop triggering events
- [ ] **SENT-04**: Sentry alert rules fire when success rate drops, cost spikes, or a repo goes silent

### Infrastructure

- [ ] **INFRA-01**: Vercel project deployed from auto-fix-agent repo with environment variables scoped to Production only
- [ ] **INFRA-02**: GitHub org-level webhooks configured for all 3 organizations pointing to Vercel URL
- [ ] **INFRA-03**: Upstash Redis (free tier) provides deduplication store for `X-GitHub-Delivery` GUIDs

## Future Requirements

Deferred to v1.3+. Tracked but not in current roadmap.

### Artifact Monitoring

- **ART-01**: PR lifecycle tracking (open/merged/closed auto-fix PRs over time)
- **ART-02**: Promotion pipeline health (develop→qa and qa→main PR counts and latency)
- **ART-03**: Caller deployment status per repo visible in dashboard

### Advanced Analytics

- **ADV-01**: Fix quality correlation by stack and error type
- **ADV-02**: Agent effectiveness trends (week-over-week success rate, MTTR, cost efficiency)
- **ADV-03**: Cost enrichment from record-metrics.sh POST to secondary Vercel endpoint

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Custom dashboard UI (React/Next.js) | Sentry dashboards are purpose-built; custom UI adds maintenance for no gain at 14 repos |
| Persistent database for metrics | Sentry is the durable store; second store creates two sources of truth |
| OpenTelemetry/Grafana stack | Over-engineered for 14 repos; Sentry is the single observability stack |
| Webhook event replay/queue system | GitHub delivery is reliable; runs.json remains backup source of truth |
| Real-time WebSocket dashboard | Sentry auto-refreshes; event volume (~5-20/day) doesn't justify streaming |
| Slack/Teams per-event notifications | Alert fatigue at 14 repos; use Sentry alerts for threshold breaches only |
| Predictive analytics / ML | Insufficient data volume at 14 repos for statistical significance |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOOK-01 | Phase 5 | Pending |
| HOOK-02 | Phase 5 | Pending |
| HOOK-03 | Phase 5 | Pending |
| HOOK-04 | Phase 6 | Pending |
| HOOK-05 | Phase 5 | Pending |
| HOOK-06 | Phase 5 | Pending |
| OPS-01 | Phase 6 | Pending |
| OPS-02 | Phase 6 | Pending |
| OPS-03 | Phase 6 | Pending |
| OPS-04 | Phase 6 | Pending |
| VAL-01 | Phase 6 | Pending |
| VAL-02 | Phase 6 | Pending |
| VAL-03 | Phase 6 | Pending |
| VAL-04 | Phase 6 | Pending |
| SAFE-01 | Phase 6 | Pending |
| SAFE-02 | Phase 6 | Pending |
| SAFE-03 | Phase 6 | Pending |
| SAFE-04 | Phase 6 | Pending |
| SENT-01 | Phase 5 | Pending |
| SENT-02 | Phase 7 | Pending |
| SENT-03 | Phase 7 | Pending |
| SENT-04 | Phase 7 | Pending |
| INFRA-01 | Phase 5 | Pending |
| INFRA-02 | Phase 5 | Pending |
| INFRA-03 | Phase 6 | Pending |

**Coverage:**
- v1.2 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation*
