# Phase 5: Webhook Receiver and Security Foundation - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy a secure Vercel serverless function that accepts GitHub webhook events, verifies HMAC-SHA256 signatures, routes events by type, and captures its own errors to Sentry. This is the foundation — no metric emission or dashboards yet, just a secure, observable stub.

</domain>

<decisions>
## Implementation Decisions

### Vercel Project Setup
- Root-level `api/` directory (standard Vercel convention) — keeps it simple, Vercel auto-detects
- Own `package.json`, `tsconfig.json`, `vercel.json` at repo root — self-contained Node/TS alongside existing YAML/Shell
- Vercel Hobby (free) plan — 100K invocations/month is vast headroom for ~50 events/month
- Git push auto-deploy on main — standard Vercel GitHub integration
- Environment variables scoped to Production only (not Preview/Development) — prevents secret leakage on preview deployments
- Return 404 (not 403) when `VERCEL_ENV !== 'production'` — reveals nothing about the endpoint

### Webhook Registration
- Org-level webhooks for all 3 organizations (fbetancourtc, Liftitapp, LiftitFinOps) — one webhook per org covers all repos
- Subscribe to: `workflow_run`, `pull_request`, `pull_request_review` events
- Single shared webhook secret across all 3 orgs (simpler rotation, same security boundary)
- Registration is manual (GitHub UI or API) — documented in ONBOARDING.md, not automated

### Sentry Project Configuration
- New dedicated Sentry project for the webhook receiver (separate from any monitored app projects)
- Project name: `auto-fix-monitor` (distinguishes from the repos being monitored)
- User has existing Sentry account — use existing org, new project
- DSN stored in `SENTRY_DSN` env var (server-only, never in client bundle)
- Receiver errors (crashes, unhandled exceptions) appear as Sentry Errors
- Pipeline monitoring (metrics, cron monitors) will be Sentry Transactions/Events in Phase 6

### Handler Architecture
- Response-first pattern: verify signature → respond 200 immediately → `waitUntil(processEvent())` for all Sentry work
- Unrecognized event types: respond 200 (don't break GitHub's delivery), log to Sentry breadcrumb, skip processing
- Event filtering at handler level: only process `workflow_run.completed`, PRs with `auto-fix` label, reviews on auto-fix PRs
- All other events: 200 response, no processing (prevents Sentry quota waste)
- Sentry SDK initialized at module scope (persists across warm invocations)
- `Sentry.flush(2000)` called inside `waitUntil()` before completion — prevents silent data loss

### Claude's Discretion
- Exact file organization within `api/` (lib helpers, types, etc.)
- TypeScript strictness level
- Error message wording in rejection responses
- Sentry breadcrumb structure and verbosity

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `config/repo-stack-map.json`: Registry of all 15 repos with stack types, allowed_dirs, promotion config — webhook handler can use this to enrich events with repo metadata
- `config/pricing.json`: Budget thresholds ($200/month, alert at 50%/80%) — relevant for Phase 6 cost metrics

### Established Patterns
- JSON config files in `config/` directory — maintain this pattern for any new config
- Bash scripts in `scripts/` — webhook receiver is TypeScript, a new pattern but self-contained
- GitHub App auth (ID: 2985828) — webhooks use a separate mechanism (webhook secret), not the App token

### Integration Points
- No code changes to existing files — webhook receiver is purely additive
- `repo-stack-map.json` is read-only from the receiver's perspective
- GitHub webhook delivery logs provide end-to-end verification (GitHub UI shows delivery status + response)

</code_context>

<specifics>
## Specific Ideas

- Architecture from brainstorm: GitHub Webhooks → Vercel Serverless Function → Sentry (passive observer, never mutates GitHub state)
- Research identified 5 critical pitfalls to address in this phase: signature bypass, 308 redirect, 10-second timeout, env var leakage, DSN exposure
- Vercel 308 redirect pitfall: register webhook URL WITHOUT trailing slash (matches Vercel default `trailingSlash: false`)
- Use `@octokit/webhooks-methods` v6 for signature verification (95% smaller than full `@octokit/webhooks`)
- Use `@sentry/node` v10 (NOT `@sentry/nextjs` — no Next.js framework)

</specifics>

<deferred>
## Deferred Ideas

- Metric emission and telemetry — Phase 6
- Event deduplication via Upstash Redis — Phase 6
- Sentry dashboards, cron monitors, alert rules — Phase 7
- Artifact status monitoring (PR lifecycle, promotion health) — v1.3

</deferred>

---

*Phase: 05-webhook-receiver-and-security-foundation*
*Context gathered: 2026-03-03*
