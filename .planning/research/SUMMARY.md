# Project Research Summary

**Project:** Auto-Fix Agent — v1.2 Monitoring & Observability
**Domain:** Vercel serverless webhook receiver + Sentry monitoring integration for an existing GitHub Actions CI/CD self-healing agent
**Researched:** 2026-03-03 (v1.2 additions); 2026-03-01 (v1.0/v1.1 core)
**Confidence:** HIGH

---

## Executive Summary

Auto-fix-agent is a centralized self-healing CI/CD system: 14 repos across 3 GitHub organizations trigger a central reusable GitHub Actions workflow that invokes Claude Code Action on CI failures, opens fix PRs, and commits run data to a flat `metrics/runs.json` file. The v1.0/v1.1 core pipeline (detection, fix generation, PR creation, retry guard, promotion, multi-stack prompt library) is working and validated. The v1.2 milestone adds the observability layer — the system currently has the raw data and safety mechanisms but zero real-time visibility into health, trends, or costs.

The recommended v1.2 approach introduces a single Vercel serverless function (`api/webhook.ts`) that acts as a passive observer on the GitHub event stream, translating webhook events into structured Sentry telemetry (spans, metrics, cron monitors, alert rules, dashboards). The Vercel function is deliberately read-only — it receives the same GitHub events that already drive the existing workflows but never mutates GitHub state. All observability state lives in Sentry. The existing GitHub Actions workflows, Bash scripts, and JSON configs are completely unchanged. The new dependency surface is minimal: `@sentry/node` v10 (sole runtime dependency), `@octokit/webhooks-methods` v6 (HMAC verification), and plain Vercel serverless functions (no framework) with TypeScript via `@vercel/node` v5. Total new cost: $0 (Vercel free tier covers ~50 events/month; Sentry Team plan already budgeted).

The key v1.2 risks fall into two clusters. Security: a webhook receiver on the public internet must verify `X-Hub-Signature-256` using `crypto.timingSafeEqual` before any processing, and all secrets must be scoped to Production-only in Vercel to prevent preview deployment exposure. Operational: GitHub enforces a strict 10-second webhook response timeout, which means the handler must respond 200 immediately and defer all Sentry SDK calls to an async `waitUntil()` continuation — skipping this causes silent event loss that surfaces as missing dashboard data, not an obvious error. Both risks must be addressed in Phase 1 before any metric data is written.

---

## Key Findings

### Recommended Stack

**v1.2 additions (new):** The v1.2 stack adds a TypeScript Vercel serverless function alongside the existing pure YAML/Shell/JSON pipeline. The existing stack (GitHub Actions, Claude Code Action `@v1`, `actions/create-github-app-token@v2`, Bash scripts, JSON config) is validated and unchanged.

**Core technologies:**
- `@sentry/node` v10 (not `@sentry/nextjs`, not the removed `@sentry/serverless`): Sentry SDK for a plain Node.js Vercel serverless function — spans, custom metrics, cron monitors, error capture. The `Sentry.metrics.*` API was removed in v9; use `span.setAttribute()` inside `Sentry.startSpan()` and `Sentry.captureMessage()` with structured contexts instead.
- `@octokit/webhooks-methods` v6: minimal HMAC-SHA256 webhook verification; 95% smaller than the full `@octokit/webhooks` package (no event routing needed for a single endpoint)
- `@vercel/node` v5 (dev dependency only): TypeScript types for `VercelRequest`/`VercelResponse`; zero runtime overhead
- `@octokit/webhooks-types` v7 (dev dependency): compile-time safety for GitHub webhook payload shapes
- TypeScript v5.5: Vercel natively compiles `api/*.ts` without a build step; self-contained to the `api/` module
- Vercel Free (Hobby) plan: zero-config deployment; 100K invocations/month covers ~50 events/month with vast headroom

**v1.0/v1.1 core (unchanged):**
- `anthropics/claude-code-action@v1` — AI agent; only production-ready GA option
- GitHub Actions Reusable Workflows (`workflow_call`) — hub-and-spoke central control
- `actions/create-github-app-token@v2` — cross-org token generation (v2 required for `owner:` param)
- `workflow_run` trigger — native CI failure detection
- Claude Sonnet 4.6 (`claude-sonnet-4-6`) — $3/$15 per MTok; correct cost/capability balance
- `@sentry/nextjs` v10 (on monitored Next.js repos) — note: the webhook receiver uses `@sentry/node`, not `@sentry/nextjs`

### Expected Features

The existing system has raw data and safety mechanisms (circuit breaker, retry guard, scope validator, budget checker) but zero real-time visibility. v1.2 adds the eyes and ears.

**Must have (table stakes):**
- Vercel serverless webhook receiver (`api/webhook.ts`) with HMAC-SHA256 signature verification — the foundation; nothing else works without it
- Event routing for `workflow_run`, `pull_request`, and `pull_request_review` events
- Sentry SDK initialization + error capture for receiver failures
- Counter and distribution metrics for Operations Health panel (trigger frequency, fix outcome breakdown, run duration)
- Value Metrics panel (MTTR, PR acceptance rate, cost per fix, monthly spend vs budget)
- Sentry Custom Dashboard with Operations + Value panels

**Should have (differentiators):**
- Safety Signal panel metrics: budget burn rate, circuit breaker trip rate, scope violation detection, escalation frequency
- Sentry Cron Monitors per repo: detect repos that go silent (misconfigured callers, revoked tokens, disabled workflows)
- Sentry Alert Rules: proactive notification when success rate drops, cost spikes, or a repo goes unhealthy

**Defer (v1.3+):**
- Artifact Status panel (PR lifecycle, promotion pipeline health) — lower priority than operations/value/safety visibility
- Fix quality correlation by stack and error type — requires significant accumulated data
- Promotion pipeline health tracking — only relevant for repos with promotion enabled

**Explicit anti-features (do not build):**
- Custom dashboard UI (React/Next.js) — Sentry dashboards are purpose-built; custom UI adds maintenance for no gain at 14 repos
- Persistent database for metrics (Postgres, Supabase) — Sentry is the durable store; a second store creates two sources of truth
- OpenTelemetry/Grafana stack — over-engineered for 14 repos; use Sentry as the single observability stack until outgrown
- Webhook event replay/queue system — GitHub delivery is reliable; a missed data point does not break the system (`runs.json` remains accurate)

### Architecture Approach

The v1.2 architecture follows the Passive Observer pattern: the Vercel function receives the same GitHub events that already drive the existing pipeline but takes no action that affects pipeline execution. It is a read-only event tap. All state lives in Sentry. The existing `metrics/runs.json` git-committed file continues as a cheap backup; Sentry becomes the real-time query layer.

**Major components:**
1. `api/webhook.ts` — main HTTP endpoint; signature verification gate; event type routing; returns 200 immediately; defers all Sentry work via `waitUntil()`
2. `api/_lib/verify.ts` — HMAC-SHA256 signature verification using `crypto.timingSafeEqual`; security gate that runs before any business logic
3. `api/_lib/sentry.ts` — Sentry SDK initialization at module scope (persists across warm invocations) + telemetry helper functions
4. `api/_lib/handlers.ts` — per-event-type processing; maps GitHub webhook events to Sentry spans, metrics, and cron check-ins
5. `api/_lib/types.ts` — TypeScript interfaces for GitHub webhook payloads; foundation for all other modules
6. Sentry Dashboard — four-panel configuration (Operations, Value, Safety, Artifacts) built via Sentry UI after data starts flowing

**Build dependency order (respects hard constraints):**
`types.ts` → `verify.ts` + `sentry.ts` (parallel) → `handlers.ts` → `webhook.ts` → Vercel deployment → GitHub webhook configuration → Sentry dashboard (requires live data)

### Critical Pitfalls

1. **Webhook signature verification misimplementation** — Verify `X-Hub-Signature-256` (not SHA-1) using `crypto.timingSafeEqual` against the raw body before any processing. In Vercel Pages Router, `req.body` is pre-parsed JSON; use `JSON.stringify(req.body)` for the HMAC source or switch to `request.text()` for byte-for-byte accuracy. Never use `===` for signature comparison (timing attack vulnerability). Address in Phase 1.

2. **GitHub 10-second timeout causing silent event loss** — GitHub does not retry timed-out deliveries. Respond 200 immediately after signature verification, then use `waitUntil(processWebhookEvent(payload))` for all Sentry SDK calls. Processing synchronously before responding will cause event loss on cold starts. Address in Phase 1 as the foundational handler architecture.

3. **Vercel 308 redirect silently dropping webhook deliveries** — Register the webhook URL without a trailing slash (matches Vercel's default `trailingSlash: false`). Verify with a GitHub test delivery immediately after registration; a 308 response means zero function invocations. Address in Phase 1.

4. **Sentry event volume explosion from unfiltered events** — 14 repos at ~5-20 CI events/day can exhaust Sentry Team plan quota mid-month if events are not filtered. Only process `workflow_run.completed`, PRs with `auto-fix` label, and reviews on those PRs. Estimate monthly volume on paper before writing any `Sentry.captureEvent()` calls. Address in Phase 1 design.

5. **Environment variable leakage to preview deployments** — Vercel defaults secrets to "All Environments." Scope `GITHUB_WEBHOOK_SECRET`, `SENTRY_DSN` to "Production" only. Return 404 (not 403) from the handler when `VERCEL_ENV !== 'production'`. Address in Phase 1 during Vercel project setup.

6. **Missing event deduplication inflating metrics** — GitHub can redeliver webhooks; manual redelivery during debugging is common. Use the `X-GitHub-Delivery` GUID as a deduplication key in Upstash Redis (free tier: 10,000 commands/day, sufficient for ~50 events/month). Address in Phase 2 before trusting dashboard data for decisions.

7. **Sentry DSN exposure in client bundle** — This project has no frontend; there should be no `sentry.client.config.ts` and no `NEXT_PUBLIC_SENTRY_DSN` variable. Store the DSN in a server-only env var. Address in Phase 1 during Sentry setup.

---

## Implications for Roadmap

The v1.2 roadmap phase structure follows the hard dependency chain identified in ARCHITECTURE.md: nothing works until the receiver is live and secure; dashboards require accumulated data; alert thresholds require baseline data to calibrate meaningfully.

### Phase 1: Scaffold, Security, and Sentry Init

**Rationale:** Everything downstream depends on the receiver being deployed, secure, and connected to Sentry. Five of the seven critical pitfalls (signature bypass, 308 redirect, 10-second timeout architecture, environment variable leakage, Sentry DSN exposure) must be addressed here. This phase establishes the foundation without any business logic — a secure, working stub that accepts webhooks and captures its own errors.

**Delivers:** Deployed Vercel function that accepts GitHub webhooks, verifies signatures, and captures receiver errors to Sentry. GitHub org-level webhook configured and returning 200. No metric emission yet — just a secure, observable stub.

**Addresses:**
- Vercel project setup + deployment configuration (`vercel.json`, `package.json`, `tsconfig.json`)
- `api/_lib/types.ts` — TypeScript interfaces for all webhook payloads
- `api/_lib/verify.ts` — HMAC-SHA256 signature verification (`crypto.timingSafeEqual`)
- `api/_lib/sentry.ts` — Sentry SDK initialization at module scope; basic error capture
- Stub `api/webhook.ts` with `waitUntil()` pattern established, routing events, returning 200 immediately
- GitHub org-level webhook configuration for 3 organizations pointing to the Vercel URL
- Vercel environment variable scoping (Production only; all secrets marked Sensitive)

**Avoids:** Pitfalls 1 (signature bypass), 2 (10-second timeout), 3 (308 redirect), 5 (env var leakage), 7 (DSN exposure)

**Research flag:** No additional research needed — all patterns have HIGH-confidence official source coverage.

---

### Phase 2: Event Processing, Metric Emission, and Deduplication

**Rationale:** With a secure receiver in place, this phase wires the full event-to-telemetry mapping. The `waitUntil()` pattern was established in Phase 1; this phase populates it with real Sentry SDK calls. Event deduplication belongs here (not Phase 3) because it is a correctness prerequisite for any metric data used in decisions.

**Delivers:** Full telemetry emission for all three event types. Operations Health and Value Metrics data starts flowing to Sentry. Deduplicated metrics using Upstash Redis.

**Addresses:**
- `api/_lib/handlers.ts` — full event routing and telemetry emission for `workflow_run`, `pull_request`, `pull_request_review`
- Event filtering (only `workflow_run.completed`, only PRs with `auto-fix` label) to prevent quota explosion
- `X-GitHub-Delivery` deduplication via Upstash Redis
- Counter metrics: `autofix.trigger`, `autofix.outcome`, `autofix.pr_merged`, `autofix.pr_rejected`, `autofix.circuit_breaker`, `autofix.scope_violation`, `autofix.escalation`, `autofix.promotion`
- Distribution metrics: `autofix.run_duration`, `autofix.mttr`, `autofix.cost`, `autofix.tokens`
- Gauge metrics: `autofix.monthly_spend`, `autofix.budget_pct`, `autofix.success_rate`
- Sentry span instrumentation per webhook invocation (one span per auto-fix run)
- Error handling inside `waitUntil` callbacks (errors must surface to Sentry, not be silently swallowed)

**Avoids:** Pitfall 4 (event volume explosion via filtering), Pitfall 6 (duplicate metrics via Upstash dedup)

**Research flag:** The `waitUntil()` import path (`@vercel/functions`) and behavior under Vercel's Fluid Compute model (instance reuse) have MEDIUM-confidence sources. Verify during implementation. Upstash Redis free tier integration with Vercel is straightforward but confirm the specific binding approach (Vercel KV vs Upstash direct client).

---

### Phase 3: Dashboard, Cron Monitors, and Alert Rules

**Rationale:** Dashboards and alerts require live data to be meaningful. Alert thresholds cannot be set responsibly without 1-2 weeks of baseline data. This phase converts raw Sentry telemetry into actionable operational panels.

**Delivers:** Sentry Custom Dashboard with Operations Health + Value Metrics panels immediately. Safety Signal panel and per-repo Cron Monitors after baseline data accumulates. Alert rules calibrated to observed baselines.

**Addresses:**
- Sentry Custom Dashboard: Operations Health panel, Value Metrics panel, Safety Signal panel (Artifact Status panel deferred to v1.3)
- Sentry Cron Monitors per repo (heartbeat type, 7-day margin for repos with infrequent failures — not traditional interval schedule)
- Sentry Alert Rules: high failure rate (>5 in 1 hour), budget burn (>$150 rolling 30 days), no activity (7 days), escalation spike (>3 in 24 hours)
- Verification: compare Sentry dashboard counts against GitHub Actions run history for the same time period (target: <5% variance)
- Alert rule calibration against accumulated baseline (configure after 1-2 weeks of data)

**Research flag:** No additional research needed. Sentry dashboard configuration is fully documented. Alert threshold calibration is empirical (requires baseline data), not a research question.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2: the receiver must be secure before any metric data can be trusted
- Deduplication in Phase 2 (not Phase 3): incorrect to build dashboards on potentially duplicated data, then retroactively fix
- Phase 2 before Phase 3: dashboards require data; alert thresholds require a baseline; both require Phase 2 to be running
- Safety Signal metrics belong in Phase 2 emission layer (same code path as Operations and Value); only the Sentry dashboard widget for Safety is deferred to Phase 3
- Artifact Status panel deferred to v1.3: PR lifecycle and promotion pipeline tracking are lower operational priority than operations/value/safety

### Research Flags

Phases needing deeper research during planning:
- **Phase 2:** `waitUntil()` API from `@vercel/functions` — behavior on Hobby plan under Fluid Compute has MEDIUM-confidence sources only; verify the exact import and execution guarantee before implementing async processing
- **Phase 2:** Upstash Redis vs Vercel KV for deduplication store — both work but confirm which is lower friction for Vercel deployment without additional service dependencies

Phases with standard patterns (skip additional research):
- **Phase 1:** Vercel serverless function setup, TypeScript config, HMAC verification, Sentry init — all HIGH-confidence official documentation; no ambiguity
- **Phase 3:** Sentry dashboard widget builder and alert rule configuration — comprehensive official documentation with working examples

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core packages verified against npm current versions (2026-03-03). Official docs for Vercel, Sentry v10, Octokit webhooks methods. One MEDIUM item: Sentry flush behavior in serverless (community discussion, not official docs). The deprecated `Sentry.metrics.*` API removal is confirmed in official migration guides. |
| Features | HIGH | Sentry dashboard and metrics APIs are fully documented. Feature scope is well-bounded against existing system gaps. Anti-features are explicitly researched and justified. FEATURES.md uses deprecated Sentry metrics API names — translated to v10 patterns in this summary. |
| Architecture | HIGH | Passive Observer pattern and event-to-telemetry mapping are clear and straightforward. Component boundaries are explicit. One known gap: token cost data is internal to GitHub Actions workflow steps and not available in webhook payloads; v1.2 uses estimated values. |
| Pitfalls | HIGH | Seven critical pitfalls identified with official source verification. Each has a specific prevention strategy, phase assignment, and detection checklist. Recovery strategies documented. |

**Overall confidence:** HIGH

### Gaps to Address

- **Token cost data in Sentry:** The webhook receiver cannot observe token counts or cost directly — these are internal to the Claude API call inside the GitHub Actions workflow. The existing `record-metrics.sh` script captures this into `runs.json`. For cost-per-fix metrics in Sentry, v1.2 will use estimated values based on run duration. A future enhancement (v1.3+) could have `record-metrics.sh` POST cost data to a second Vercel endpoint. Flag this when building the Value Metrics panel — label cost estimates as estimates.

- **FEATURES.md vs STACK.md API discrepancy:** FEATURES.md references `Sentry.metrics.increment()`, `Sentry.metrics.gauge()`, and `Sentry.metrics.distribution()` — these were removed in Sentry SDK v9. STACK.md correctly documents the v10 replacement API: `span.setAttribute()` inside `Sentry.startSpan()` and `Sentry.captureMessage()` with structured contexts. During Phase 2 implementation, use the STACK.md API patterns; ignore the metric names in FEATURES.md as API guidance (the metric naming conventions remain valid, only the SDK calls change).

- **Sentry cron monitor type for irregular repos:** Repos with infrequent and unpredictable CI failures do not map cleanly to a traditional `interval` cron schedule. The architecture recommends a heartbeat monitor with a 7-day margin. Confirm Sentry's heartbeat monitor configuration API during Phase 3 to avoid false "missed" alerts for low-activity repos.

- **Raw body HMAC accuracy:** If `JSON.stringify(JSON.parse(rawBody))` produces different bytes than GitHub's original payload (key ordering, whitespace), HMAC verification fails intermittently. `@octokit/webhooks-methods` handles this correctly. If implementing with raw `crypto`, test with real GitHub payloads before deploying to production.

---

## Sources

### Primary (HIGH confidence)

- [Sentry Node.js SDK docs](https://docs.sentry.io/platforms/javascript/guides/node/) — init, startSpan, captureMessage, cron check-in API
- [Sentry v9 to v10 migration guide](https://docs.sentry.io/platforms/javascript/guides/node/migration/v9-to-v10/) — removed metrics API, OpenTelemetry v2 internals
- [Sentry Custom Dashboards](https://docs.sentry.io/product/dashboards/custom-dashboards/) — widget types, dashboard layout patterns
- [Sentry Cron Monitoring for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/crons/) — withMonitor, captureCheckIn API
- [Sentry Billing Quota Management](https://docs.sentry.io/pricing/quotas/) — event volume limits, spike protection configuration
- [Sentry Alerts documentation](https://docs.sentry.io/product/alerts/) — metric alert configuration
- [Vercel Functions documentation](https://vercel.com/docs/functions) — api/ directory, handler signature, maxDuration configuration
- [Vercel Sensitive Environment Variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables) — Production-only scoping
- [Vercel Knowledge Base: raw body for webhooks](https://vercel.com/kb/guide/how-do-i-get-the-raw-body-of-a-serverless-function) — body parsing behavior, HMAC implications
- [Vercel Knowledge Base: function timeouts](https://vercel.com/kb/guide/what-can-i-do-about-vercel-serverless-functions-timing-out) — 10-second limit, mitigation patterns
- [GitHub: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) — HMAC-SHA256 official pattern
- [GitHub: Handling webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries) — retry behavior, timeout rules, deduplication guidance
- [GitHub: Troubleshooting webhooks](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/troubleshooting-webhooks) — 308 redirect diagnosis
- [@octokit/webhooks-methods GitHub](https://github.com/octokit/webhooks-methods.js) — verify(), sign(), verifyWithFallback() API
- [@sentry/node on npm](https://www.npmjs.com/package/@sentry/node) — v10.41.0 current version confirmed 2026-03-03
- [@vercel/node on npm](https://www.npmjs.com/package/@vercel/node) — v5.6.10 current version confirmed 2026-03-03

### Secondary (MEDIUM confidence)

- [Hookdeck: Webhooks in Vercel Serverless Functions](https://hookdeck.com/webhooks/platforms/how-to-receive-and-replay-external-webhooks-in-vercel-serverless-functions) — body parsing patterns, response timing patterns
- [Vercel Blog: Scale to one (Fluid Compute)](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts) — cold start behavior, instance reuse
- [Sentry + Vercel serverless community discussion](https://github.com/getsentry/sentry-javascript/discussions/18591) — `@sentry/node` compatibility with Vercel functions (community, not official)
- [Stack Overflow: webhook 308 on Vercel](https://stackoverflow.com/questions/75062050/stripe-webhook-returning-308-error-when-calling-vercel-serverless-function) — trailing slash redirect pitfall confirmation
- [Hookdeck: Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — deduplication patterns
- [GitHub Community: webhook retry handling](https://github.com/orgs/community/discussions/151676) — duplicate event behavior confirmation
- [CI/CD Monitoring Metrics Guide](https://daily.dev/blog/ultimate-guide-to-cicd-monitoring-metrics) — industry metric patterns for MTTR, success rate

### Tertiary (LOW confidence)

- [AI Agent Monitoring Best Practices 2026](https://uptimerobot.com/knowledge-hub/monitoring/ai-agent-monitoring-best-practices-tools-and-metrics/) — general patterns; all specific claims verified against official Sentry docs
- [Sentry Comprehensive Guide 2025 (baytechconsulting)](https://www.baytechconsulting.com/blog/sentry-io-comprehensive-guide-2025) — third-party summary; used only for initial orientation, all referenced patterns verified against official sources

---
*Research completed: 2026-03-03*
*Covers: v1.2 Monitoring & Observability (Vercel + Sentry webhook receiver)*
*Prior research: v1.0/v1.1 core pipeline (2026-03-01) — see git history for prior SUMMARY.md*
*Ready for roadmap: yes*
