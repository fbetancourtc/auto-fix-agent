# Feature Landscape: v1.2 Monitoring & Observability

**Domain:** Observability layer for self-healing CI/CD agent (Sentry + Vercel webhook receiver)
**Researched:** 2026-03-03
**Milestone:** v1.2 — Adding monitoring on top of existing auto-fix pipeline
**Confidence:** HIGH (Sentry official docs, Vercel patterns, GitHub webhook docs, CI/CD observability best practices)

---

## Existing System Context

Before defining features, here is what already exists and what the new layer builds on:

| Existing Capability | How It Works Today | Gap for v1.2 |
|---------------------|--------------------|--------------|
| Run outcome tracking | `record-metrics.sh` writes to `metrics/runs.json` (git-committed JSON) | Data is flat-file, not queryable, no visualization, no alerting |
| Cost tracking | `record-metrics.sh` extracts token usage from Claude Code Action output | Per-run cost exists but no trend analysis, no burn rate visualization |
| Budget alerts | `check-budget.sh` creates deduplicated GitHub Issues at 50%/80%/100% | Reactive (checks after each run), no continuous monitoring |
| Success rate | Computed from `metrics/runs.json` at query time | No dashboard, no historical trends, no per-repo breakdown |
| Circuit breaker | Inline JS in workflow YAML checking `auto-fix/` branches and labels | No visibility into how often it trips or false positive rate |
| Retry guard | Label-based PR count check | No tracking of escalation frequency or patterns |
| Promotion pipeline | `promote.yml` creates develop->qa and qa->main PRs | No visibility into promotion latency or pipeline health |

**Key insight:** The existing system has the raw data and the safety mechanisms, but zero visibility. v1.2 adds the eyes and ears.

---

## Table Stakes

Features users expect from any monitoring/observability layer on a CI/CD system. Missing any of these means the monitoring is incomplete or untrustworthy.

### Webhook Receiver Foundation

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Vercel serverless function `/api/webhook.ts`** | The entry point for all GitHub events. Without a receiver, there is nothing to monitor | MEDIUM | Vercel account, project deployment |
| **GitHub webhook signature verification (HMAC-SHA256)** | Without signature verification, anyone can POST fake events. Security table stakes per GitHub official docs | LOW | Webhook secret in env vars, `crypto.timingSafeEqual` |
| **Event type routing (`workflow_run`, `pull_request`, `pull_request_review`)** | Different events carry different data. The receiver must parse and route correctly | LOW | Depends on webhook receiver |
| **Idempotency handling via `X-GitHub-Delivery` header** | GitHub can redeliver webhooks. Processing the same event twice corrupts metrics | LOW | In-memory or KV dedup store (Vercel KV or simple Set with TTL) |
| **Respond within 5 seconds (Vercel constraint)** | Vercel serverless functions must respond quickly. Heavy processing must be deferred | LOW | Async-after-response pattern or Vercel background functions |

### Operations Health Panel

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Trigger frequency tracking** | "How often is the system firing?" is the first question any operator asks | LOW | Sentry counter metric on each `workflow_run.completed` event |
| **Fix outcome breakdown (success/fail/escalation)** | Knowing the success rate is the primary health indicator. Already tracked in runs.json but not visualized | LOW | Sentry counter with `outcome` tag (`fix_pr_created`, `no_fix`, `escalated`, `flaky_skipped`, `circuit_breaker`) |
| **Per-repo health scores** | With 14 repos, you need to know which repos are generating the most failures and which are being fixed successfully | MEDIUM | Sentry metrics with `repository` tag, Sentry dashboard widget grouped by repo |
| **Run duration tracking** | Long-running fixes indicate agent struggling. Short runs may indicate quick failures | LOW | Sentry distribution metric from `workflow_run` timing data |

### Value Metrics Panel

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Mean-time-to-fix (MTTR)** | The core value metric: "how fast does the system fix things?" Measured from CI failure to fix PR creation | MEDIUM | Sentry distribution metric. Requires computing delta between `workflow_run` failure timestamp and fix PR creation timestamp |
| **PR acceptance rate** | "Do humans actually merge the fixes?" If acceptance is low, the system is creating noise, not value | MEDIUM | Track `pull_request.closed` events where `merged=true` and label is `auto-fix`. Sentry gauge metric |
| **Cost per fix** | Already tracked per-run in `record-metrics.sh`. Now needs visualization and trend analysis | LOW | Sentry distribution metric from existing cost data, tagged by outcome |
| **Monthly spend vs budget** | Already computed in `check-budget.sh`. Needs a live gauge, not just issue-based alerts | LOW | Sentry gauge metric updated on each run |

### Safety Signal Panel

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Budget burn rate visualization** | Flat-file budget checks are reactive. A burn rate chart shows the trajectory before it hits 100% | MEDIUM | Sentry gauge tracking cumulative monthly spend, Sentry alert rule at thresholds |
| **Circuit breaker trip rate** | Invisible today. If the circuit breaker trips frequently, it indicates a feedback loop problem | LOW | Sentry counter on circuit breaker events (trip vs clear) |
| **Scope violation detection** | Post-agent diff validation catches forbidden file modifications. These must be visible | LOW | Sentry counter on `validate-diff.sh` outcomes |
| **Escalation frequency** | How often does the system give up and create a `needs-human` issue? Rising escalations = declining effectiveness | LOW | Sentry counter on escalation events |

### Sentry Integration Core

| Feature | Why Expected | Complexity | Dependencies |
|---------|--------------|------------|--------------|
| **Sentry SDK initialization in webhook function** | Foundation for all Sentry features. Must be initialized once per cold start | LOW | `@sentry/node` package, DSN in env vars |
| **Custom transactions per webhook invocation** | Each webhook processing becomes a Sentry transaction with spans for parsing, validation, metric emission | LOW | `Sentry.startSpan()` wrapping the handler |
| **Custom metrics emission (counters, gauges, distributions)** | The mechanism for sending all the metrics above to Sentry | LOW | `Sentry.metrics.increment()`, `.gauge()`, `.distribution()` with tags |
| **Error capture for webhook failures** | If the receiver crashes or fails to process an event, Sentry must capture the error with context | LOW | `Sentry.captureException()` in error handler |

---

## Differentiators

Features that go beyond basic monitoring and provide unique value for an AI-agent CI/CD system. These are not expected from a generic monitoring setup but create significant operational advantage.

| Feature | Value Proposition | Complexity | Dependencies |
|---------|-------------------|------------|--------------|
| **Sentry Cron Monitors per repo** | Track that each enrolled repo is actively triggering. If a repo goes silent (no events for X hours), Sentry alerts. Catches misconfigured callers, revoked tokens, or disabled workflows before anyone notices | MEDIUM | `Sentry.withMonitor()` or `captureCheckIn()` per repo slug. Requires defining expected frequency per repo (varies by activity level) |
| **Sentry alert rules for anomaly detection** | Automatic alerts when: success rate drops below threshold, cost spikes, escalation rate rises, or a repo goes unhealthy. Goes beyond dashboards to proactive notification | MEDIUM | Sentry metric alerts configured via Sentry UI/API. Threshold definition requires baseline data |
| **Fix quality correlation** | Track which repos, stacks, and error types have highest fix success rates. Answers "where is the agent most/least effective?" to prioritize prompt improvements | HIGH | Requires tagging all metrics with `stack`, `repository`, `error_type`. Dashboard widget correlating these dimensions |
| **Promotion pipeline health tracking** | Track promotion latency (time from fix PR merge to qa PR creation), promotion success rate, and qa->main approval time. Answers "is the promotion pipeline working smoothly?" | MEDIUM | Sentry metrics on `pull_request` events with `auto-fix-promote` label. Requires correlating PR events across the pipeline stages |
| **Agent effectiveness trends** | Week-over-week or month-over-month trends in success rate, MTTR, cost efficiency. Answers "is the system getting better or worse over time?" | MEDIUM | Sentry dashboard with time-series widgets. Relies on accumulated metric data |
| **Structured event logging** | Beyond metrics, emit structured Sentry breadcrumbs for each processing step: event received, signature verified, event type identified, metrics emitted. Enables debugging failed webhook processing | LOW | `Sentry.addBreadcrumb()` at each processing step |

---

## Anti-Features

Features to explicitly NOT build for v1.2 monitoring. These either add unnecessary complexity, conflict with architectural decisions, or belong in a future milestone.

| Anti-Feature | Why It Seems Useful | Why Avoid | What to Do Instead |
|--------------|---------------------|-----------|-------------------|
| **Custom dashboard UI (React/Next.js app)** | "We should build our own dashboard for full control" | Sentry dashboards are purpose-built for this. Building a custom UI adds frontend maintenance burden, hosting costs, and duplicates what Sentry provides. At 14 repos, the scale does not justify custom UI | Use Sentry Custom Dashboards with Widget Builder. Four panels: Operations, Value, Safety, Artifacts |
| **Persistent database for metrics (Supabase, Postgres)** | "We need to store metrics durably for querying" | Sentry IS the durable metrics store. Adding a database creates two sources of truth, sync complexity, and schema migration burden | Sentry retains metric data per plan limits (90 days on Team plan). For long-term archival, export from Sentry API periodically |
| **Real-time WebSocket dashboard** | "We want live updates as events come in" | Sentry dashboards auto-refresh. WebSocket infrastructure adds deployment complexity (sticky sessions, connection management) for marginal value at this event volume | Sentry dashboards with auto-refresh interval. Event volume (~5-20/day) does not justify real-time streaming |
| **Slack/Teams integration for every metric** | "Push every metric change to Slack" | Notification fatigue. At 14 repos with multiple event types, this generates dozens of messages daily. Operators tune out | Use Sentry Alerts for threshold breaches only (budget alerts, success rate drops, repo health issues). Not per-event notifications |
| **OpenTelemetry/Grafana stack** | "Use open standards for portability" | Over-engineered for this scale. OTel collector + Grafana requires infrastructure management. User already has Sentry account. Adding another observability stack fragments the monitoring surface | Single stack: Sentry. If outgrowing Sentry, migrate then. Do not pre-optimize for a migration that may never happen |
| **Webhook event replay/queue system (Hookdeck, Redis queue)** | "What if we miss an event? We need replay capability" | GitHub webhook delivery is reliable. The metrics are supplementary (runs.json is the source of truth). Missing one webhook event means one metric data point is missed, not a system failure. Queue infrastructure adds operational burden | Simple idempotency check (X-GitHub-Delivery header dedup). If an event is lost, the runs.json git-committed data remains accurate |
| **Multi-environment monitoring (staging vs production)** | "We need separate Sentry projects for staging and production monitoring" | This system only has one environment: the auto-fix pipeline in production. There is no staging equivalent. A staging Sentry project would be empty | Single Sentry project. Use tags to distinguish test events during development |
| **Predictive analytics / ML on fix patterns** | "Use the metrics to predict which repos will fail next" | Insufficient data volume at 14 repos. ML requires thousands of data points; this system generates 5-20 events/day. Statistical significance is unreachable | Eyeball the dashboards. Human pattern recognition suffices at this scale |

---

## Feature Dependencies

```
[Vercel webhook receiver (/api/webhook.ts)]
    |-- requires --> [GitHub webhook secret for HMAC verification]
    |-- requires --> [Sentry DSN in environment variables]
    |-- requires --> [Vercel project deployed from this repo]
    |
    |-- enables --> [Event type routing]
    |       |-- routes --> workflow_run.completed --> [Operations metrics]
    |       |-- routes --> pull_request.closed (merged + auto-fix label) --> [Value metrics]
    |       |-- routes --> pull_request_review.submitted --> [PR acceptance tracking]
    |       |-- routes --> pull_request.closed (merged + auto-fix-promote) --> [Promotion metrics]
    |
    |-- enables --> [Sentry SDK initialization]
            |-- enables --> [Custom transactions per invocation]
            |-- enables --> [Custom metrics emission]
            |       |-- feeds --> [Operations Health Panel]
            |       |-- feeds --> [Value Metrics Panel]
            |       |-- feeds --> [Safety Signal Panel]
            |       |-- feeds --> [Artifact Status Panel]
            |
            |-- enables --> [Sentry Cron Monitors per repo]
            |-- enables --> [Sentry Alert Rules]
            |-- enables --> [Error capture for webhook failures]

[Sentry Custom Dashboard]
    |-- requires --> [Custom metrics being emitted (above)]
    |-- requires --> [Sufficient data volume for meaningful widgets]
    |-- contains --> [Operations Health Panel]
    |       |-- widgets --> Trigger frequency (time series)
    |       |-- widgets --> Fix outcome breakdown (pie/bar chart)
    |       |-- widgets --> Per-repo health (table widget)
    |       |-- widgets --> Run duration distribution
    |
    |-- contains --> [Value Metrics Panel]
    |       |-- widgets --> MTTR distribution
    |       |-- widgets --> PR acceptance rate (gauge)
    |       |-- widgets --> Cost per fix (distribution)
    |       |-- widgets --> Monthly spend vs budget (gauge)
    |
    |-- contains --> [Safety Signal Panel]
    |       |-- widgets --> Budget burn rate (time series)
    |       |-- widgets --> Circuit breaker trips (counter)
    |       |-- widgets --> Scope violations (counter)
    |       |-- widgets --> Escalation frequency (counter)
    |
    |-- contains --> [Artifact Status Panel]
            |-- widgets --> PR lifecycle (open/merged/closed)
            |-- widgets --> Promotion pipeline health
            |-- widgets --> Caller deployment status per repo
```

### Critical Path

The strict ordering required:

1. **Vercel project + deployment** -- nothing works without the receiver being live
2. **Webhook receiver with signature verification** -- security before functionality
3. **Sentry SDK init + basic error capture** -- catch problems in the receiver itself
4. **Event routing + metric emission** -- the data pipeline
5. **Sentry dashboard creation** -- visualization of the emitted data
6. **Cron monitors + alert rules** -- proactive monitoring layer

### Independence Notes

- Operations, Value, Safety, and Artifact panels are independent of each other. They can be built in parallel once the metric emission layer exists.
- Sentry Cron Monitors are independent of the dashboard. They can be configured before or after dashboard creation.
- Alert rules require baseline data to set meaningful thresholds. Configure alerts after 1-2 weeks of metric accumulation.

---

## Metrics Catalog

Concrete metrics the webhook receiver should emit to Sentry. This is the contract between the receiver and the dashboard.

### Counters (Sentry.metrics.increment)

| Metric Name | Tags | Incremented When | Panel |
|-------------|------|------------------|-------|
| `autofix.trigger` | `repository`, `conclusion` (success/failure/cancelled) | Every `workflow_run.completed` event received | Operations |
| `autofix.outcome` | `repository`, `stack`, `outcome` (fix_pr_created/no_fix/escalated/flaky_skipped/circuit_breaker) | Outcome determined from workflow_run data | Operations |
| `autofix.circuit_breaker` | `repository`, `result` (tripped/clear) | Circuit breaker step executes | Safety |
| `autofix.scope_violation` | `repository` | validate-diff.sh reverts forbidden files | Safety |
| `autofix.escalation` | `repository` | Retry limit reached, needs-human issue created | Safety |
| `autofix.pr_merged` | `repository`, `label` (auto-fix/auto-fix-promote) | PR merged event with matching label | Value / Artifacts |
| `autofix.pr_rejected` | `repository` | auto-fix PR closed without merge | Value |
| `autofix.promotion` | `repository`, `stage` (develop-qa/qa-main) | Promotion PR created | Artifacts |

### Gauges (Sentry.metrics.gauge)

| Metric Name | Tags | Value | Panel |
|-------------|------|-------|-------|
| `autofix.monthly_spend` | `month` | Cumulative USD spend this month | Safety |
| `autofix.budget_pct` | `month` | Percentage of monthly budget consumed | Safety |
| `autofix.success_rate` | `repository` | Rolling success rate (fixes / total attempts) | Value |

### Distributions (Sentry.metrics.distribution)

| Metric Name | Tags | Unit | Value | Panel |
|-------------|------|------|-------|-------|
| `autofix.run_duration` | `repository`, `outcome` | second | Seconds from workflow_run start to completion | Operations |
| `autofix.mttr` | `repository`, `stack` | second | Seconds from CI failure to fix PR creation | Value |
| `autofix.cost` | `repository`, `stack`, `outcome` | none (USD) | Cost in USD per run | Value |
| `autofix.tokens` | `repository`, `token_type` (input/output/cache_read/cache_write) | none | Token count per run | Value |

### Cron Monitors

| Monitor Slug | Schedule | Check-in Margin | Max Runtime | Purpose |
|-------------|----------|-----------------|-------------|---------|
| `autofix-{repo-slug}` | Per repo activity level (daily for active repos) | 24 hours | N/A (event-driven, not job-based) | Detect repos that stop triggering |
| `autofix-webhook-health` | Every 1 hour | 15 minutes | 5 minutes | Verify the webhook receiver itself is alive |

---

## Sentry Dashboard Layout

Four panels, each addressing a distinct operational concern.

### Panel 1: Operations Health
- **Top widget:** Trigger frequency time series (last 30 days)
- **Middle widget:** Fix outcome breakdown by outcome type (stacked bar, last 7 days)
- **Bottom widget:** Per-repo health table (repo name, total triggers, success rate, last trigger time)

### Panel 2: Value Metrics
- **Top widget:** MTTR distribution (histogram, last 30 days)
- **Middle-left widget:** PR acceptance rate (big number widget, rolling 30 days)
- **Middle-right widget:** Cost per fix distribution (histogram)
- **Bottom widget:** Monthly spend vs budget (gauge widget with threshold lines at 50%, 80%, 100%)

### Panel 3: Safety Signals
- **Top widget:** Budget burn rate (time series, cumulative USD by day)
- **Middle-left widget:** Circuit breaker trips (counter, last 7 days)
- **Middle-right widget:** Scope violations (counter, last 7 days)
- **Bottom widget:** Escalation frequency (time series, last 30 days)

### Panel 4: Artifact Status
- **Top widget:** PR lifecycle (open/merged/closed auto-fix PRs, time series)
- **Middle widget:** Promotion pipeline health (develop->qa and qa->main PR counts)
- **Bottom widget:** Active repos table (repo name, caller status, last event, promotion enabled)

---

## MVP Recommendation for v1.2

### Must Build (Core Monitoring)

1. **Vercel webhook receiver with signature verification** -- the foundation
2. **Sentry SDK init + error capture** -- catch receiver failures
3. **Event routing for `workflow_run` and `pull_request` events** -- the data pipeline
4. **Counter and distribution metrics for Operations and Value panels** -- the most valuable dashboards
5. **Sentry Custom Dashboard with Operations + Value panels** -- immediate visibility

### Add After Initial Data (Week 2+)

6. **Safety Signal metrics (budget burn, circuit breaker, scope violations)** -- requires some baseline data
7. **Sentry Alert Rules** -- requires 1-2 weeks of data to set meaningful thresholds
8. **Sentry Cron Monitors per repo** -- requires understanding each repo's activity cadence

### Defer to v1.3+

9. **Artifact Status panel** -- lower priority than operations/value/safety visibility
10. **Fix quality correlation by stack/error type** -- requires significant accumulated data
11. **Promotion pipeline health tracking** -- only relevant for repos with promotion enabled (currently only fbetancourtc repos)

---

## Sources

- [Sentry Custom Dashboards](https://docs.sentry.io/product/dashboards/custom-dashboards/) -- HIGH confidence (official docs)
- [Sentry Widget Builder](https://docs.sentry.io/product/dashboards/widget-builder/) -- HIGH confidence (official docs)
- [Sentry Metrics for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/metrics/) -- HIGH confidence (official docs)
- [Sentry Cron Monitoring](https://docs.sentry.io/product/crons/) -- HIGH confidence (official docs)
- [Sentry Custom Span Instrumentation for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/tracing/instrumentation/custom-instrumentation/) -- HIGH confidence (official docs)
- [Sentry Alerts](https://docs.sentry.io/product/alerts/) -- HIGH confidence (official docs)
- [Sentry Alert Routing with Integrations](https://docs.sentry.io/product/alerts/create-alerts/routing-alerts/) -- HIGH confidence (official docs)
- [GitHub Webhook Signature Validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) -- HIGH confidence (official docs)
- [Vercel Webhook Receiver Patterns (Hookdeck)](https://hookdeck.com/webhooks/platforms/how-to-receive-and-replay-external-webhooks-in-vercel-serverless-functions) -- MEDIUM confidence (vendor guide, verified patterns)
- [Webhook Security Best Practices](https://www.webhookdebugger.com/blog/webhook-security-best-practices) -- MEDIUM confidence
- [CI/CD Monitoring Metrics Guide](https://daily.dev/blog/ultimate-guide-to-cicd-monitoring-metrics) -- MEDIUM confidence (industry patterns)
- [DevOps CI/CD Metrics (JetBrains)](https://www.jetbrains.com/teamcity/ci-cd-guide/devops-ci-cd-metrics/) -- MEDIUM confidence (industry reference)
- [AI Agent Monitoring Best Practices 2026](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/) -- MEDIUM confidence (current patterns)
- [Sentry Comprehensive Guide 2025](https://www.baytechconsulting.com/blog/sentry-io-comprehensive-guide-2025) -- LOW confidence (third-party summary)

---
*Feature research for: v1.2 Monitoring & Observability milestone*
*Existing system: auto-fix-agent with v1.0 core loop + v1.1 multi-repo rollout*
*Researched: 2026-03-03*
