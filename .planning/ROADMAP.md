# Roadmap: Auto-Fix Agent

## Milestones

- ✅ **v1.0 MVP** — Phases 1-2.2 (shipped 2026-03-02) — [archive](milestones/v1.0-ROADMAP.md)
- 📋 **v1.1** — Phases 3-4 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-2.2) — SHIPPED 2026-03-02</summary>

- [x] Phase 1: Infrastructure and Security Guardrails (2/2 plans) — completed 2026-03-02
- [x] Phase 2: Core Fix Loop (3/3 plans) — completed 2026-03-02
- [x] Phase 2.1: Integration Fixes & Documentation (1/1 plan) — completed 2026-03-02
- [x] Phase 2.2: Retroactive Phase 1 Verification (1/1 plan) — completed 2026-03-02

</details>

### 📋 v1.1 (Planned)

#### Phase 3: Multi-Repo Rollout
**Goal:** Expand auto-fix to all 14 repos across 3 orgs — Python/Kotlin prompt expansion, thin caller onboarding template, and full enrollment with working auto-fix on each repo.
**Plans:** 3 plans

Plans:
- [ ] 03-01-PLAN.md — Expand Python prompt + create ONBOARDING.md
- [ ] 03-02-PLAN.md — Enroll 8 repos (fbetancourtc + LiftitFinOps) with callers, secrets, smoke test
- [ ] 03-03-PLAN.md — Prepare Liftitapp activation guide for 6 repos (pending admin)

**Dependencies:** v1.0 complete
**Requirements:** Python stack-specific fix prompt, Kotlin stack-specific fix prompt, thin caller template with onboarding docs, all 14 repos enrolled with working auto-fix

#### Phase 4: Promotion and Observability
**Goal:** Add develop→qa→main promotion flow with human approval gate, plus success rate tracking, cost-per-fix tracking via token usage, and budget alerts at 50%/80% of $200/month threshold.
**Plans:** 2
**Dependencies:** Phase 3 complete
**Requirements:** Auto-create develop→qa PR when fix PR merges, human approval gate for qa→main promotion, success rate tracking per repo, cost-per-fix tracking via token usage output, budget alerts at 50%/80% of $200/month threshold

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Infrastructure and Security Guardrails | v1.0 | 2/2 | Complete | 2026-03-02 |
| 2. Core Fix Loop | v1.0 | 3/3 | Complete | 2026-03-02 |
| 2.1 Integration Fixes & Documentation | v1.0 | 1/1 | Complete | 2026-03-02 |
| 2.2 Retroactive Phase 1 Verification | v1.0 | 1/1 | Complete | 2026-03-02 |
| 3. Multi-Repo Rollout | v1.1 | 0/3 | Planned | - |
| 4. Promotion and Observability | v1.1 | 0/2 | Not started | - |
