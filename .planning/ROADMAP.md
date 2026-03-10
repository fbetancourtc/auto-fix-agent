# Roadmap: Auto-Fix Agent

## Milestones

- ✅ **v1.0 MVP** — Phases 1-2.2 (shipped 2026-03-02) — [archive](milestones/v1.0-ROADMAP.md)
- ✅ **v1.1 Multi-Repo Rollout & Observability** — Phases 3-4 (shipped 2026-03-03) — [archive](milestones/v1.1-ROADMAP.md)
- 🚧 **v1.2 Monitoring & Observability** — Phases 5-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-2.2) — SHIPPED 2026-03-02</summary>

- [x] Phase 1: Infrastructure and Security Guardrails (2/2 plans) — completed 2026-03-02
- [x] Phase 2: Core Fix Loop (3/3 plans) — completed 2026-03-02
- [x] Phase 2.1: Integration Fixes & Documentation (1/1 plan) — completed 2026-03-02
- [x] Phase 2.2: Retroactive Phase 1 Verification (1/1 plan) — completed 2026-03-02

</details>

<details>
<summary>✅ v1.1 Multi-Repo Rollout & Observability (Phases 3-4) — SHIPPED 2026-03-03</summary>

- [x] Phase 3: Multi-Repo Rollout (3/3 plans) — completed 2026-03-03
- [x] Phase 4: Promotion and Observability (3/3 plans) — completed 2026-03-03

</details>

### 🚧 v1.2 Monitoring & Observability (In Progress)

**Milestone Goal:** Add real-time visibility into the auto-fix pipeline via a Vercel webhook receiver feeding Sentry dashboards, cron monitors, and alert rules.

- [x] **Phase 5: Webhook Receiver and Security Foundation** — Deployed, secure Vercel function receiving GitHub webhooks with Sentry error capture (completed 2026-03-06)
- [ ] **Phase 6: Event Processing, Metrics, and Deduplication** — Full telemetry emission for operations health, value metrics, and safety signals with deduplication
- [ ] **Phase 7: Dashboard, Cron Monitors, and Alert Rules** — Sentry dashboard panels, per-repo silence detection, and proactive alerting

## Phase Details

### Phase 5: Webhook Receiver and Security Foundation
**Goal**: A deployed, secure Vercel serverless function accepts GitHub webhook events and captures its own errors to Sentry
**Depends on**: Phase 4 (v1.1 complete)
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-05, HOOK-06, SENT-01, INFRA-01, INFRA-02
**Success Criteria** (what must be TRUE):
  1. GitHub webhook test delivery from each org returns HTTP 200 from the Vercel function
  2. A request with an invalid or missing `X-Hub-Signature-256` header is rejected before any event processing occurs
  3. Sentry captures an error when the webhook handler throws an unexpected exception
  4. The Vercel function responds 200 within 5 seconds on cold start and defers processing via `waitUntil()`
  5. Events that are not `workflow_run.completed`, auto-fix-labeled PRs, or reviews on those PRs are filtered out and not processed
**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md — Project scaffolding, signature verification, Sentry init, and deployable handler foundation
- [x] 05-02-PLAN.md — Event routing, filtering, handler stubs, ONBOARDING docs, and deployment verification

### Phase 6: Event Processing, Metrics, and Deduplication
**Goal**: Every auto-fix pipeline event produces structured Sentry telemetry for operations health, value metrics, and safety signals, with deduplication preventing inflated counts
**Depends on**: Phase 5
**Requirements**: HOOK-04, OPS-01, OPS-02, OPS-03, OPS-04, VAL-01, VAL-02, VAL-03, VAL-04, SAFE-01, SAFE-02, SAFE-03, SAFE-04, INFRA-03
**Success Criteria** (what must be TRUE):
  1. A `workflow_run.completed` event for an auto-fix run produces counter and distribution metrics visible in Sentry (trigger count, outcome, run duration)
  2. A `pull_request.closed` event for a merged auto-fix PR produces MTTR and acceptance rate metrics in Sentry
  3. Redelivering the same GitHub webhook event (same `X-GitHub-Delivery` GUID) does not produce duplicate metrics
  4. Safety signal counters (circuit breaker trips, scope violations, escalations) increment when their respective events arrive
  5. Monthly spend gauge and budget burn rate are visible as cumulative values in Sentry after processing cost-related events
**Plans:** 3 plans

Plans:
- [x] 06-01-PLAN.md — Metrics module, dedup module, and test infrastructure (vitest + @upstash/redis)
- [x] 06-02-PLAN.md — Strong-typed handlers with full metric emission wiring
- [x] 06-03-PLAN.md — Dedup integration into processEvent and deployment verification

### Phase 7: Dashboard, Cron Monitors, and Alert Rules
**Goal**: Sentry surfaces actionable operational visibility through dashboard panels, silence detection per repo, and threshold-based alerts
**Depends on**: Phase 6
**Requirements**: SENT-02, SENT-03, SENT-04
**Success Criteria** (what must be TRUE):
  1. A Sentry Custom Dashboard exists with Operations Health, Value Metrics, and Safety Signal panels showing live data
  2. Each enrolled repo has a Sentry Cron Monitor that marks the repo unhealthy if no events arrive within 7 days
  3. Sentry alert rules fire test notifications when success rate drops, cost spikes, or a repo goes silent
**Plans**: TBD

Plans:
- [ ] 07-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Infrastructure and Security Guardrails | v1.0 | 2/2 | Complete | 2026-03-02 |
| 2. Core Fix Loop | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2.1 Integration Fixes & Documentation | v1.0 | 1/1 | Complete | 2026-03-02 |
| 2.2 Retroactive Phase 1 Verification | v1.0 | 1/1 | Complete | 2026-03-02 |
| 3. Multi-Repo Rollout | v1.1 | 3/3 | Complete | 2026-03-03 |
| 4. Promotion and Observability | v1.1 | 3/3 | Complete | 2026-03-03 |
| 5. Webhook Receiver and Security Foundation | v1.2 | 2/2 | Complete | 2026-03-06 |
| 6. Event Processing, Metrics, and Deduplication | v1.2 | 3/3 | Complete | 2026-03-10 |
| 7. Dashboard, Cron Monitors, and Alert Rules | v1.2 | 0/0 | Not started | - |
