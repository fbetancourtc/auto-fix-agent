# Sentry Setup Guide for Auto-Fix Operations

Manual setup guide for configuring Sentry dashboards, alert rules, and cron monitors.
Use this guide when the API setup scripts (`scripts/setup-dashboard.sh`, `scripts/setup-alerts.sh`) fail or when you prefer UI-based configuration.

## 1. Prerequisites

### Sentry Plan Requirements

- **Team plan or above** required for Custom Dashboards, Cron Monitors, and Metric Alert Rules
- **Custom Metrics** must be enabled (check Settings -> Subscription -> Features)

### Auth Token (for API scripts only)

If using the setup scripts, create an Internal Integration token:

1. Go to **Settings -> Developer Settings -> Internal Integrations**
2. Click **Create New Internal Integration**
3. Name: `auto-fix-setup`
4. Required scopes: `org:write`, `alerts:write`, `project:write`
5. Click **Save** and copy the token
6. Set as environment variable: `export SENTRY_AUTH_TOKEN=<token>`

### Required Values

| Variable | Where to Find |
|----------|---------------|
| `SENTRY_ORG_SLUG` | Settings -> General -> Organization Slug |
| `SENTRY_PROJECT_SLUG` | Settings -> Projects -> (your project name) |

## 2. Dashboard Setup

Create a Custom Dashboard named **"Auto-Fix Operations"** with 12 widgets across 3 sections.

### Navigate to Dashboards

1. Go to **Dashboards -> Create Dashboard**
2. Set title: `Auto-Fix Operations`

### Operations Health Widgets (Row 1-2)

**Widget 1: Trigger Count by Repo**
- Type: Bar Chart
- Metric: `auto_fix.trigger_count` (counter)
- Aggregation: `sum()`
- Group by: `repo`

**Widget 2: Outcome Breakdown**
- Type: Bar Chart (stacked)
- Metric: `auto_fix.outcome` (counter)
- Aggregation: `sum()`
- Group by: `outcome`

**Widget 3: Run Duration (p50/p95)**
- Type: Line Chart
- Query 1: `p50(auto_fix.run_duration_ms)`
- Query 2: `p95(auto_fix.run_duration_ms)`

**Widget 4: Per-Repo Health**
- Type: Table
- Metrics: `sum(auto_fix.trigger_count)`, `sum(auto_fix.outcome)`
- Group by: `repo`
- Sort by: trigger count descending

### Value Metrics Widgets (Row 3-4)

**Widget 5: MTTR Trend**
- Type: Line Chart
- Metric: `auto_fix.mttr_ms` (distribution)
- Aggregation: `p50()`

**Widget 6: Cost per Fix**
- Type: Line Chart
- Metric: `auto_fix.cost_per_fix_usd` (distribution)
- Aggregation: `avg()`

**Widget 7: Monthly Spend**
- Type: Big Number
- Metric: `auto_fix.monthly_spend_usd` (gauge)
- Aggregation: `sum()`

**Widget 8: PR Acceptance Rate**
- Type: Big Number
- Metric: `auto_fix.pr_accepted` (counter)
- Aggregation: `sum()`
- Note: Compare with `auto_fix.pr_rejected` to calculate rate manually

### Safety Signals Widgets (Row 5)

**Widget 9: Budget Burn Rate**
- Type: Line Chart
- Metric: `auto_fix.monthly_spend_usd` (gauge)
- Aggregation: `sum()` (cumulative view)

**Widget 10: Circuit Breaker Trips**
- Type: Big Number
- Metric: `auto_fix.safety.circuit_breaker_trip` (counter)
- Aggregation: `sum()`

**Widget 11: Scope Violations**
- Type: Big Number
- Metric: `auto_fix.safety.scope_violation` (counter)
- Aggregation: `sum()`

**Widget 12: Escalations**
- Type: Big Number
- Metric: `auto_fix.safety.escalation` (counter)
- Aggregation: `sum()`

### Save

Click **Save and Exit**. Widgets may show "No data" until metric events flow.

## 3. Alert Rules Setup

Create 4 metric alert rules. Navigate to **Alerts -> Create Alert Rule -> Metric Alert**.

### Alert 1: Low Success Rate

| Setting | Value |
|---------|-------|
| Name | `Auto-Fix: Low Success Rate` |
| Metric | `auto_fix.outcome` (counter) |
| Filter | `outcome:fix_pr_created` |
| Aggregation | `count()` |
| Time Window | 24 hours (1440 minutes) |
| Threshold Type | Below |
| Warning Threshold | 1 (adjust based on expected volume) |
| Dataset | Generic Metrics |
| Notification | Email to you |

### Alert 2: Cost Spike

| Setting | Value |
|---------|-------|
| Name | `Auto-Fix: Cost Spike` |
| Metric | `auto_fix.cost_per_fix_usd` (distribution) |
| Aggregation | `avg()` |
| Time Window | 1 hour (60 minutes) |
| Threshold Type | Above |
| Warning Threshold | $5.00 |
| Dataset | Generic Metrics |
| Notification | Email to you |

### Alert 3: Budget Warning (80%)

| Setting | Value |
|---------|-------|
| Name | `Auto-Fix: Budget Warning (80%)` |
| Metric | `auto_fix.monthly_spend_usd` (gauge) |
| Aggregation | `sum()` |
| Time Window | 24 hours (1440 minutes) |
| Threshold Type | Above |
| Warning Threshold | $160 |
| Dataset | Generic Metrics |
| Notification | Email to you |

### Alert 4: Budget Critical (100%)

| Setting | Value |
|---------|-------|
| Name | `Auto-Fix: Budget Critical (100%)` |
| Metric | `auto_fix.monthly_spend_usd` (gauge) |
| Aggregation | `sum()` |
| Time Window | 24 hours (1440 minutes) |
| Threshold Type | Above |
| Critical Threshold | $200 |
| Dataset | Generic Metrics |
| Notification | Email to you |

### Note on Repo Silence Alerting

Repo silence is handled automatically by **Sentry Cron Monitors** (configured in Plan 01).
Each enrolled repo gets a cron monitor with a 7-day interval. If no webhook events are
processed for a repo within 7 days, Sentry automatically creates an issue. No separate
alert rule is needed for repo silence detection.

## 4. Cron Monitor Verification

Cron monitors are created automatically when the webhook function processes events.

### How to Verify

1. Deploy the webhook function: `npx vercel --prod`
2. Trigger a test event (push to any enrolled repo or wait for CI)
3. Navigate to **Crons** in Sentry sidebar
4. Verify a monitor named `repo-{org}-{repo-name}` appears
5. Status should be "OK" after the first successful check-in

### Expected Monitors

Each enrolled repo in `config/repo-stack-map.json` will auto-create a monitor on first
webhook event. With 15 enrolled repos, expect up to 15 cron monitors.

Monitor slug format: `repo-{org}-{name}` (lowercase, hyphens only)

Example: `Liftitapp/geocoding-enterprise` becomes `repo-liftitapp-geocoding-enterprise`

## 5. Troubleshooting

### Empty Dashboard Widgets ("No data")

- **Cause:** Metrics haven't been emitted yet, or MRI format mismatch
- **Fix:** Trigger a test webhook event, wait 1-2 minutes for metrics to appear
- **Verify:** Use `GET /api/0/organizations/{org}/metrics/meta/` to list available metrics
  and check their exact MRI format

### Cron Monitors Not Appearing

- **Cause:** No webhook events processed yet, or `emitRepoHeartbeat()` not called
- **Fix:** Check that the webhook function is deployed and processing events
- **Verify:** Check Vercel function logs for `repo-heartbeat` breadcrumbs

### Alert Rules Not Firing

- **Cause:** Wrong dataset or MRI format in alert rule configuration
- **Fix:** Ensure `dataset` is set to `generic_metrics` (not `events` or `transactions`)
- **Verify:** Manually emit test metrics via the webhook and check alert rule status

### API Script Authentication Errors (403)

- **Cause:** Auth token missing required scopes
- **Fix:** Create a new Internal Integration token with `org:write`, `alerts:write`, `project:write`
- **Verify:** Test with `curl -H "Authorization: Bearer $TOKEN" https://sentry.io/api/0/`

### MRI Format Issues

The Metric Resource Identifier (MRI) format for custom metrics:

| Type | Pattern | Example |
|------|---------|---------|
| Counter | `c:custom/{name}@none` | `c:custom/auto_fix.trigger_count@none` |
| Distribution | `d:custom/{name}@{unit}` | `d:custom/auto_fix.run_duration_ms@millisecond` |
| Gauge | `g:custom/{name}@none` | `g:custom/auto_fix.monthly_spend_usd@none` |

If widgets show no data, the MRI format may differ. Query the metrics meta endpoint:

```bash
curl -H "Authorization: Bearer ${SENTRY_AUTH_TOKEN}" \
  "https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}/metrics/meta/"
```

This returns all available metrics with their exact MRI strings.
