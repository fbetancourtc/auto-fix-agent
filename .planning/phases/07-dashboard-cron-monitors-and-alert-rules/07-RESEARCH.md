# Phase 7: Dashboard, Cron Monitors, and Alert Rules - Research

**Researched:** 2026-03-10
**Domain:** Sentry dashboards API, cron monitors, metric alert rules
**Confidence:** MEDIUM

## Summary

Phase 7 is the final phase of v1.2 and transforms the raw metrics emitted in Phase 6 into actionable visibility. It has three distinct deliverables: (1) a Sentry Custom Dashboard with panels for Operations Health, Value Metrics, and Safety Signals, (2) per-repo Cron Monitors that detect silence (no events within 7 days), and (3) metric alert rules that fire notifications on threshold breaches.

Unlike Phases 5-6 which were pure application code, Phase 7 is a mix of Sentry platform configuration and a small amount of application code. The dashboard and alert rules can be created either via the Sentry REST API or the Sentry web UI. The cron monitors require application code changes -- specifically, calling `Sentry.captureCheckIn()` in the webhook handler whenever an event is successfully processed for a repo, so that Sentry can detect when a repo goes silent.

The project uses `@sentry/node` v10.42.0, which confirms `Sentry.metrics.count()`, `Sentry.metrics.distribution()`, `Sentry.metrics.gauge()`, `Sentry.captureCheckIn()`, and `Sentry.withMonitor()` are all available. The existing metrics module (`api/lib/metrics.ts`) emits 11 distinct metrics across 3 types (counter, distribution, gauge) with `repo`, `org`, `stack` tags -- these are the data sources for the dashboard widgets.

**Primary recommendation:** Create the dashboard via the Sentry web UI (fastest, most reliable for widget-metric binding), implement cron monitor check-ins as application code in the webhook handler, and create alert rules via the Sentry API or UI. Provide setup scripts/documentation as IaC artifacts for reproducibility.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SENT-02 | Custom Sentry dashboard with Operations Health, Value Metrics, and Safety Signal panels | Sentry Dashboard API (`POST /api/0/organizations/{org}/dashboards/`) or web UI; widgets reference custom metrics emitted in Phase 6 |
| SENT-03 | Sentry Cron Monitors per enrolled repo detect repos that stop triggering events | `Sentry.captureCheckIn()` with `status: "ok"` on each processed event; 7-day interval schedule; 15 repos from repo-stack-map.json |
| SENT-04 | Sentry alert rules fire when success rate drops, cost spikes, or a repo goes silent | Sentry Alert Rules API (`POST /api/0/organizations/{org}/alert-rules/`) with `generic_metrics` dataset; cron monitor missed check-in creates issue automatically |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @sentry/node | 10.42.0 (installed) | captureCheckIn(), metrics API, SDK functions | Already in use; provides cron monitor check-ins and custom metrics |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Sentry REST API | v0 | Dashboard creation, alert rule creation, monitor creation | One-time setup via curl/script or Sentry web UI |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sentry web UI for dashboard | Sentry Dashboard API | API requires knowing exact MRI (Metric Resource Identifier) syntax for custom metrics; UI has a metric picker dropdown that handles this automatically |
| SDK captureCheckIn for cron | HTTP check-in API | HTTP API uses DSN-embedded URLs; SDK is simpler since Sentry is already initialized |
| Sentry API for alert rules | Sentry web UI | API is scriptable/reproducible but requires knowing exact dataset/aggregate syntax; UI guides you through metric selection |

**Installation:**
```bash
# No new packages needed. All functionality is in @sentry/node 10.42.0.
```

## Architecture Patterns

### Recommended Project Structure
```
api/
├── webhook.ts              # Add cron monitor check-in call after successful processing
├── lib/
│   ├── sentry.ts           # Existing Sentry init (no changes needed)
│   ├── monitors.ts         # NEW: cron monitor check-in helper
│   ├── metrics.ts          # Existing (Phase 6) - no changes
│   └── handlers/           # Existing handlers - no changes
scripts/
├── setup-dashboard.sh      # NEW: Sentry API script for dashboard creation (IaC artifact)
├── setup-alerts.sh         # NEW: Sentry API script for alert rule creation (IaC artifact)
└── setup-monitors.sh       # NEW: Sentry API script for cron monitor creation (IaC artifact)
docs/
└── sentry-setup.md         # NEW: Manual setup instructions as fallback
```

### Pattern 1: Cron Monitor Heartbeat via captureCheckIn
**What:** Call `Sentry.captureCheckIn()` with `status: "ok"` and a monitor slug derived from the repo name whenever a webhook event is successfully processed for that repo. Sentry expects periodic check-ins; if none arrive within the schedule window, it marks the monitor as missed and creates an issue.
**When to use:** Inside `processEvent()` after `routeEvent()` returns `processed: true`.
**Example:**
```typescript
// api/lib/monitors.ts
import * as Sentry from '@sentry/node';

/**
 * Emit a cron monitor heartbeat for the given repository.
 * Uses a 7-day interval schedule. If Sentry doesn't receive a check-in
 * within 7 days (+checkin_margin), it creates a "missed" issue.
 *
 * Monitor slugs are derived from repo full names:
 *   "Liftitapp/geocoding-enterprise" -> "repo-liftitapp-geocoding-enterprise"
 */
export function emitRepoHeartbeat(repoFullName: string): void {
  const slug = repoSlug(repoFullName);

  Sentry.captureCheckIn(
    { monitorSlug: slug, status: 'ok' },
    {
      schedule: { type: 'interval', value: 7, unit: 'day' },
      checkinMargin: 1440,       // 1 day grace period (in minutes)
      maxRuntime: 1,             // Heartbeat is instant
      timezone: 'UTC',
      failureIssueThreshold: 1,  // Alert on first missed check-in
      recoveryThreshold: 1,      // Recover on first successful check-in
    },
  );
}

/** Convert repo full name to a valid Sentry monitor slug. */
export function repoSlug(repoFullName: string): string {
  return `repo-${repoFullName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
}
```

### Pattern 2: Integration Point in processEvent
**What:** After successful event routing, emit a heartbeat for the repo that generated the event. This ensures Sentry knows the repo is "alive" -- generating webhook events that reach our receiver.
**When to use:** In `processEvent()` after `routeEvent()` returns with `processed: true`.
**Example:**
```typescript
// In api/webhook.ts processEvent(), after the routeEvent call:
const result = await routeEvent(headers.eventType, payload as WebhookPayload);

// SENT-03: Emit cron monitor heartbeat for active repos
if (result.processed && repoFullName) {
  emitRepoHeartbeat(repoFullName);
}
```

### Pattern 3: Setup Scripts for Reproducibility
**What:** Shell scripts using `curl` and the Sentry REST API to create dashboards, monitors, and alert rules. These serve as Infrastructure-as-Code artifacts even if initial setup is done via the UI.
**When to use:** For documenting and reproducing the Sentry configuration.
**Example:**
```bash
#!/usr/bin/env bash
# scripts/setup-alerts.sh
# Creates metric alert rules in Sentry

SENTRY_AUTH_TOKEN="${SENTRY_AUTH_TOKEN:?Set SENTRY_AUTH_TOKEN}"
ORG_SLUG="your-org"

# Alert: Success rate drop (fewer than expected fix_pr_created outcomes)
curl -X POST "https://sentry.io/api/0/organizations/${ORG_SLUG}/alert-rules/" \
  -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto-Fix: Low Success Rate",
    "aggregate": "count()",
    "dataset": "generic_metrics",
    "query": "",
    "timeWindow": 1440,
    "thresholdType": 1,
    "projects": ["auto-fix-monitor"],
    "triggers": [
      {
        "label": "critical",
        "alertThreshold": 1,
        "actions": [{ "type": "email", "targetType": "team", "targetIdentifier": "auto-fix" }]
      }
    ]
  }'
```

### Anti-Patterns to Avoid
- **Creating monitors from a standalone script that runs once:** Monitors created via the Sentry API without ongoing check-ins will immediately go into "missed" state. Use `captureCheckIn()` in the webhook handler so monitors are created/updated on first event processing.
- **Hardcoding repo lists in monitor setup:** Use the existing `config/repo-stack-map.json` as the source of truth for enrolled repos.
- **Creating one monitor for all repos:** Each repo needs its own monitor with its own slug. A single monitor would only detect global silence, not per-repo silence.
- **Polling for metrics in alert rules:** Sentry alert rules are push-based on the metric stream. Don't build a separate polling mechanism.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Silence detection per repo | Custom timer/cron job checking last-event timestamps | Sentry Cron Monitors with captureCheckIn() | Sentry handles scheduling, missed detection, issue creation, and recovery automatically |
| Metric threshold alerting | Custom code reading metrics and sending notifications | Sentry Metric Alert Rules | Built-in comparison, time windows, notification routing, incident management |
| Dashboard visualization | Custom React dashboard or HTML reports | Sentry Custom Dashboards | Auto-refreshing, metric-aware, no hosting/maintenance needed |
| Metric aggregation for dashboards | Server-side rollups or custom aggregation code | Sentry metric aggregation engine | Sentry aggregates counters, distributions, gauges with configurable time windows |

**Key insight:** Phase 7 is primarily a Sentry platform configuration phase, not an application code phase. The only new application code is the cron monitor heartbeat (~20 lines). Everything else is Sentry resource creation.

## Common Pitfalls

### Pitfall 1: Monitor Slug Format
**What goes wrong:** Invalid characters in monitor slugs cause Sentry API errors. Slugs must be lowercase alphanumeric with hyphens only (no slashes, dots, or underscores).
**Why it happens:** Repo full names contain slashes (e.g., `Liftitapp/geocoding-enterprise`) which are invalid in slugs.
**How to avoid:** Sanitize repo names: lowercase, replace non-alphanumeric characters with hyphens. Use a dedicated `repoSlug()` function.
**Warning signs:** 400 errors from Sentry API, monitors not appearing in Sentry UI.

### Pitfall 2: Cron Monitor Schedule Misunderstanding
**What goes wrong:** Setting a crontab schedule like `0 0 * * 0` (weekly) when you want "alert if no events in 7 days." The crontab schedule expects check-ins at specific times, not within a window.
**Why it happens:** Confusion between crontab (fixed schedule) and interval (rolling window) schedule types.
**How to avoid:** Use `interval` schedule type with `{ type: 'interval', value: 7, unit: 'day' }`. This means "expect a check-in every 7 days" rather than "expect a check-in at midnight Sunday."
**Warning signs:** False missed alerts when events arrive at unexpected times.

### Pitfall 3: Dashboard Widget Metric Binding
**What goes wrong:** Creating dashboard widgets via the API that reference custom metrics with incorrect MRI (Metric Resource Identifier) format. Custom metrics emitted via `Sentry.metrics.count('auto_fix.trigger_count', ...)` appear internally as `c:custom/auto_fix.trigger_count@none` (counter), `d:custom/auto_fix.run_duration_ms@millisecond` (distribution), `g:custom/auto_fix.monthly_spend_usd@none` (gauge).
**Why it happens:** The API requires the full MRI format, not just the metric name. The UI handles this translation automatically.
**How to avoid:** Create the dashboard via the Sentry web UI first, which provides a metric picker dropdown. If scripting, use `GET /api/0/organizations/{org}/metrics/meta/` to discover the exact MRI strings.
**Warning signs:** Empty widgets, "No data" messages in dashboard panels.

### Pitfall 4: Alert Rule Dataset Selection
**What goes wrong:** Using `events` or `transactions` dataset for custom metric alerts. Custom metrics emitted via `Sentry.metrics.*` live in the `generic_metrics` dataset.
**Why it happens:** The API documentation lists multiple datasets without clearly mapping which one to use for SDK-emitted custom metrics.
**How to avoid:** Always use `"dataset": "generic_metrics"` for alert rules on custom metrics.
**Warning signs:** Alert rules created successfully but never fire despite metric data being present.

### Pitfall 5: Auth Token Scope for API Operations
**What goes wrong:** Organization auth tokens lack the required scopes for creating dashboards, monitors, or alert rules.
**Why it happens:** Default organization tokens have CI-focused scopes. Dashboard/alert creation needs `org:write` and `alerts:write`.
**How to avoid:** Create an Internal Integration in Sentry with `org:write`, `alerts:write`, and `project:write` scopes. Use that integration's token for API calls.
**Warning signs:** 403 Forbidden responses from the Sentry API.

### Pitfall 6: captureCheckIn Not Flushed
**What goes wrong:** Cron check-in events are captured but not sent to Sentry because the serverless function terminates before flushing.
**Why it happens:** `captureCheckIn()` enqueues the check-in but doesn't send it immediately.
**How to avoid:** The existing `flushSentry(2000)` call in the `finally` block of `processEvent()` already handles this. Ensure `emitRepoHeartbeat()` is called before the `finally` block.
**Warning signs:** Monitors show "Waiting for first check-in" indefinitely.

## Code Examples

### Cron Monitor Check-In (Heartbeat Pattern)
```typescript
// Source: Sentry Node.js SDK docs + verified with installed @sentry/node 10.42.0
import * as Sentry from '@sentry/node';

// Simple heartbeat: "this repo is alive"
Sentry.captureCheckIn(
  {
    monitorSlug: 'repo-liftitapp-geocoding-enterprise',
    status: 'ok',
  },
  {
    schedule: { type: 'interval', value: 7, unit: 'day' },
    checkinMargin: 1440,        // 1 day grace period (minutes)
    maxRuntime: 1,              // Heartbeat completes instantly
    timezone: 'UTC',
    failureIssueThreshold: 1,   // Create issue on first miss
    recoveryThreshold: 1,       // Resolve on first success
  },
);
```

### Dashboard API Request Body Structure
```json
{
  "title": "Auto-Fix Operations",
  "widgets": [
    {
      "title": "Trigger Count by Repo",
      "displayType": "bar",
      "widget_type": "custom_metrics",
      "queries": [
        {
          "name": "Triggers",
          "aggregates": ["sum(c:custom/auto_fix.trigger_count@none)"],
          "columns": ["repo"],
          "conditions": ""
        }
      ],
      "layout": { "x": 0, "y": 0, "w": 4, "h": 2, "min_h": 2 }
    }
  ]
}
```
**Confidence: LOW** -- The exact `widget_type` and MRI format for custom metrics in the dashboard API are not well-documented. Recommend creating via UI first.

### Alert Rule API Request Body
```json
{
  "name": "Auto-Fix: Cost Spike",
  "aggregate": "avg(d:custom/auto_fix.cost_per_fix_usd@none)",
  "dataset": "generic_metrics",
  "query": "",
  "timeWindow": 60,
  "thresholdType": 0,
  "projects": ["auto-fix-monitor"],
  "triggers": [
    {
      "label": "warning",
      "alertThreshold": 2.0,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "user-id"
        }
      ]
    },
    {
      "label": "critical",
      "alertThreshold": 5.0,
      "actions": [
        {
          "type": "email",
          "targetType": "user",
          "targetIdentifier": "user-id"
        }
      ]
    }
  ]
}
```
**Confidence: MEDIUM** -- Alert Rules API is well-documented; MRI format needs validation.

## Metric Inventory (from Phase 6)

All metrics emitted by the application code (source: `api/lib/metrics.ts`):

| Metric Name | Type | MRI (expected) | Dashboard Panel |
|-------------|------|-----------------|-----------------|
| `auto_fix.trigger_count` | counter | `c:custom/auto_fix.trigger_count@none` | Operations Health |
| `auto_fix.outcome` | counter | `c:custom/auto_fix.outcome@none` | Operations Health |
| `auto_fix.run_duration_ms` | distribution | `d:custom/auto_fix.run_duration_ms@millisecond` | Operations Health |
| `auto_fix.mttr_ms` | distribution | `d:custom/auto_fix.mttr_ms@millisecond` | Value Metrics |
| `auto_fix.cost_per_fix_usd` | distribution | `d:custom/auto_fix.cost_per_fix_usd@none` | Value Metrics |
| `auto_fix.monthly_spend_usd` | gauge | `g:custom/auto_fix.monthly_spend_usd@none` | Value Metrics / Safety |
| `auto_fix.pr_accepted` | counter | `c:custom/auto_fix.pr_accepted@none` | Value Metrics |
| `auto_fix.pr_rejected` | counter | `c:custom/auto_fix.pr_rejected@none` | Value Metrics |
| `auto_fix.safety.circuit_breaker_trip` | counter | `c:custom/auto_fix.safety.circuit_breaker_trip@none` | Safety Signals |
| `auto_fix.safety.scope_violation` | counter | `c:custom/auto_fix.safety.scope_violation@none` | Safety Signals |
| `auto_fix.safety.escalation` | counter | `c:custom/auto_fix.safety.escalation@none` | Safety Signals |

Tags on every metric: `repo`, `org`, `stack` (+ `outcome` on `auto_fix.outcome`).

## Dashboard Panel Design

### Operations Health Panel
| Widget | Type | Metric | Aggregation | Group By |
|--------|------|--------|-------------|----------|
| Trigger frequency | bar chart | trigger_count | sum | repo |
| Outcome breakdown | stacked bar | outcome | sum | outcome |
| Run duration (p50/p95) | line chart | run_duration_ms | p50, p95 | - |
| Per-repo health | table | trigger_count + outcome | sum | repo |

### Value Metrics Panel
| Widget | Type | Metric | Aggregation | Group By |
|--------|------|--------|-------------|----------|
| MTTR trend | line chart | mttr_ms | p50 | - |
| Cost per fix | line chart | cost_per_fix_usd | avg | - |
| Monthly spend | big number | monthly_spend_usd | sum | - |
| PR acceptance rate | big number | pr_accepted / (pr_accepted + pr_rejected) | count | - |

### Safety Signals Panel
| Widget | Type | Metric | Aggregation | Group By |
|--------|------|--------|-------------|----------|
| Budget burn rate | line chart | monthly_spend_usd | sum (cumulative) | - |
| Circuit breaker trips | big number | safety.circuit_breaker_trip | sum | - |
| Scope violations | big number | safety.scope_violation | sum | - |
| Escalations | big number | safety.escalation | sum | - |

## Alert Rules Design

| Alert Name | Metric | Condition | Threshold | Time Window | Severity |
|------------|--------|-----------|-----------|-------------|----------|
| Low Success Rate | outcome (fix_pr_created) | below | TBD (user-defined) | 24h (1440 min) | warning |
| Cost Spike | cost_per_fix_usd | above | $5.00 per fix | 1h (60 min) | warning |
| Budget Warning (80%) | monthly_spend_usd | above | $160 (80% of $200) | 24h (1440 min) | warning |
| Budget Critical (100%) | monthly_spend_usd | above | $200 (100% budget) | 24h (1440 min) | critical |
| Repo Silence | Cron Monitor missed check-in | missed | - | 7 days | critical |

Note: Repo silence alerting is handled automatically by Sentry Cron Monitors (they create issues on missed check-ins), not by metric alert rules.

## Enrolled Repos (from repo-stack-map.json)

15 repos across 3 orgs. Each needs its own cron monitor:

| Repo | Org | Stack | Monitor Slug |
|------|-----|-------|-------------|
| Liftitapp/liftit-control-de-asistencia | Liftitapp | kotlin | repo-liftitapp-liftit-control-de-asistencia |
| Liftitapp/averias-marketplace | Liftitapp | typescript | repo-liftitapp-averias-marketplace |
| Liftitapp/geocoding-enterprise | Liftitapp | typescript | repo-liftitapp-geocoding-enterprise |
| Liftitapp/conciliacion-recaudo-liftit | Liftitapp | python | repo-liftitapp-conciliacion-recaudo-liftit |
| Liftitapp/liftit-ai-system | Liftitapp | typescript | repo-liftitapp-liftit-ai-system |
| Liftitapp/geocoding-liftit-api | Liftitapp | python | repo-liftitapp-geocoding-liftit-api |
| Liftitapp/liftit-cargo-receptor-de-cumplidos | Liftitapp | python | repo-liftitapp-liftit-cargo-receptor-de-cumplidos |
| fbetancourtc/laundry-operating-dash | fbetancourtc | typescript | repo-fbetancourtc-laundry-operating-dash |
| fbetancourtc/lavandarosa-platform | fbetancourtc | typescript | repo-fbetancourtc-lavandarosa-platform |
| fbetancourtc/lavandarosa-petal-web | fbetancourtc | typescript | repo-fbetancourtc-lavandarosa-petal-web |
| fbetancourtc/laundry-property-managers | fbetancourtc | typescript | repo-fbetancourtc-laundry-property-managers |
| fbetancourtc/laundry-cleaning-staff | fbetancourtc | typescript | repo-fbetancourtc-laundry-cleaning-staff |
| fbetancourtc/laundry-admin-dash | fbetancourtc | typescript | repo-fbetancourtc-laundry-admin-dash |
| fbetancourtc/binance-bot | fbetancourtc | python | repo-fbetancourtc-binance-bot |
| LiftitFinOps/conciliacion-averias | LiftitFinOps | python | repo-liftitfinops-conciliacion-averias |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual polling for silence | Sentry Cron Monitors with SDK check-ins | Sentry SDK 7.51+ (2023) | Automatic missed detection, issue creation, recovery |
| Custom alerting scripts | Sentry Metric Alert Rules with generic_metrics dataset | Sentry 2024+ | Built-in threshold comparison, notification routing |
| Grafana/custom dashboards | Sentry Custom Dashboards with custom metrics widgets | Sentry 2024+ | Single-pane with errors, metrics, monitors in one tool |

**Deprecated/outdated:**
- `Sentry.metrics.increment()` -- replaced by `Sentry.metrics.count()` in v10. The codebase already uses `count()`.
- Statsd-based metric format (SDK spec v1.0) -- replaced by JSON-based format in SDK spec v2.0+. Transparent to users.

## Open Questions

1. **Exact MRI format for custom metrics in API calls**
   - What we know: Custom metrics follow a pattern like `c:custom/metric_name@unit` for counters, `d:custom/...` for distributions, `g:custom/...` for gauges
   - What's unclear: The exact MRI strings as they appear in the Sentry backend. The `@unit` suffix may vary (e.g., `@none` vs `@millisecond`)
   - Recommendation: Create dashboard and first alert via UI, then use `GET /api/0/organizations/{org}/metrics/meta/` to discover exact MRI strings for scripting. **Confidence: LOW**

2. **Dashboard API widget_type for custom metrics**
   - What we know: The API accepts `widget_type` values including `discover`, `issue`, `metrics`, and others
   - What's unclear: Whether custom SDK metrics require `widget_type: "custom_metrics"` or `widget_type: "metrics"` or something else
   - Recommendation: Create via UI first, then export the dashboard JSON via `GET /api/0/organizations/{org}/dashboards/{id}/` to see the exact structure. **Confidence: LOW**

3. **Sentry plan limitations for custom metrics, dashboards, and cron monitors**
   - What we know: Custom metrics are available in Beta for non-Enterprise plans. Cron monitors and dashboards are available on Team plan and above.
   - What's unclear: Whether the current Sentry plan supports all features needed (custom metrics in dashboards, 15+ cron monitors, metric alert rules on custom metrics)
   - Recommendation: Verify plan features before implementation. If limited, prioritize cron monitors and alert rules (highest value). **Confidence: MEDIUM**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | vitest.config.ts (exists) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SENT-02 | Dashboard exists with correct panels (manual verification) | manual-only | N/A - verify in Sentry UI | N/A |
| SENT-03 | emitRepoHeartbeat calls captureCheckIn with correct slug and config | unit | `npx vitest run tests/monitors.test.ts` | No -- Wave 0 |
| SENT-03 | repoSlug sanitizes repo names correctly | unit | `npx vitest run tests/monitors.test.ts -t "slug"` | No -- Wave 0 |
| SENT-03 | processEvent calls emitRepoHeartbeat after successful routing | unit | `npx vitest run tests/webhook.test.ts -t "heartbeat"` | No -- Wave 0 |
| SENT-04 | Alert rules exist and fire on threshold breach (manual verification) | manual-only | N/A - verify in Sentry UI | N/A |

**Justification for manual-only tests:** SENT-02 (dashboard) and SENT-04 (alert rules) are Sentry platform configurations, not application code. They cannot be unit-tested locally. Verification requires checking the Sentry UI or querying the Sentry API to confirm resources exist.

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green + manual Sentry UI verification

### Wave 0 Gaps
- [ ] `tests/monitors.test.ts` -- covers SENT-03 (captureCheckIn calls, slug generation)
- [ ] Mock for `Sentry.captureCheckIn` -- spy on check-in calls

## Sources

### Primary (HIGH confidence)
- Installed `@sentry/node` v10.42.0 -- verified `Sentry.metrics.count()`, `Sentry.captureCheckIn()`, `Sentry.withMonitor()` exist via runtime inspection
- Existing codebase: `api/lib/metrics.ts` (11 metrics), `api/webhook.ts` (processEvent flow), `config/repo-stack-map.json` (15 repos)
- [Sentry Cron Monitor Node.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/node/crons/) -- captureCheckIn API, monitor config structure
- [Sentry Create Monitor API](https://docs.sentry.io/api/crons/create-a-monitor/) -- REST API for monitor creation
- [Sentry HTTP Check-in API](https://docs.sentry.io/product/crons/getting-started/http/) -- upsert pattern, monitor_config structure

### Secondary (MEDIUM confidence)
- [Sentry Dashboard API](https://docs.sentry.io/api/dashboards/create-a-new-dashboard-for-an-organization/) -- endpoint, widget structure, display types
- [Sentry Metric Alert Rule API](https://docs.sentry.io/api/alerts/create-a-metric-alert-rule-for-an-organization/) -- endpoint, aggregate functions, datasets, trigger structure
- [Sentry Auth Token Guide](https://docs.sentry.io/api/guides/create-auth-token/) -- Internal Integration for API scopes

### Tertiary (LOW confidence)
- Custom metrics MRI format (`c:custom/...@unit`) -- inferred from naming conventions, not confirmed with official documentation
- Dashboard `widget_type` for custom metrics -- multiple candidates (`metrics`, `custom_metrics`), not verified
- `generic_metrics` dataset for custom metric alerts -- referenced in API docs but usage with SDK-emitted custom metrics not explicitly documented

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @sentry/node 10.42.0 verified with runtime checks, all needed APIs exist
- Architecture (cron monitors): HIGH - captureCheckIn well-documented, heartbeat pattern straightforward
- Architecture (dashboard): MEDIUM - Dashboard concept is clear but exact API syntax for custom metrics in widgets is poorly documented
- Architecture (alert rules): MEDIUM - API is well-documented but MRI format for custom metrics needs validation
- Pitfalls: HIGH - based on documented constraints and verified API behavior

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (30 days -- Sentry APIs are stable, custom metrics feature is in active development)
