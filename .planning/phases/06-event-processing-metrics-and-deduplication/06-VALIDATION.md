---
phase: 06
slug: event-processing-metrics-and-deduplication
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-06
updated: 2026-03-06
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + tsc type checking |
| **Config file** | vitest.config.ts (created in Plan 01 Task 1) |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx vitest run --reporter=verbose && npx tsc --noEmit` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run --reporter=verbose && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirements | Test Type | Automated Command | Status |
|---------|------|------|--------------|-----------|-------------------|--------|
| 06-01-01 | 01 | 1 | INFRA-03, OPS-01..04, VAL-01..04, SAFE-01..04 | unit (TDD) | `npx vitest run tests/metrics.test.ts --reporter=verbose` | ⬜ pending |
| 06-01-02 | 01 | 1 | INFRA-03, SAFE-02 | unit (TDD) | `npx vitest run tests/dedup.test.ts --reporter=verbose` | ⬜ pending |
| 06-02-01 | 02 | 2 | OPS-01, OPS-02, OPS-03, OPS-04, VAL-01, VAL-03, VAL-04, SAFE-01, SAFE-02, SAFE-03 | type-check | `npx tsc --noEmit` | ⬜ pending |
| 06-02-02 | 02 | 2 | VAL-02, SAFE-03, SAFE-04 | type-check + unit | `npx tsc --noEmit && npx vitest run --reporter=verbose` | ⬜ pending |
| 06-03-01 | 03 | 2 | HOOK-04, OPS-03 | type-check + unit | `npx tsc --noEmit && npx vitest run --reporter=verbose` | ⬜ pending |
| 06-03-02 | 03 | 2 | (all) | checkpoint | Human verification of complete Phase 6 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `@upstash/redis` — npm install for dedup store (Plan 01 Task 1)
- [ ] `vitest` — npm install as devDependency (Plan 01 Task 1)
- [ ] `vitest.config.ts` — created in Plan 01 Task 1
- [ ] Verify `@octokit/webhooks-types` v7 already in package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Metrics visible in Sentry | OPS-01 thru OPS-04, VAL-01 thru VAL-04, SAFE-01 thru SAFE-04 | Requires live Sentry project with real webhook events | Send test webhook, check Sentry metrics explorer |
| Per-repo health scores groupable | OPS-03 | Requires live Sentry with dashboard panels (Phase 7) | Verify metrics have repo/org/stack tags in Sentry metrics explorer |
| Dedup prevents duplicates | HOOK-04 | Requires live Redis + redelivered webhook | Redeliver same event via GitHub UI, verify no duplicate metric |
| Budget gauge accumulates | VAL-04, SAFE-01 | Requires multiple events over time | Process 3+ events, check cumulative gauge in Sentry |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all dependencies (vitest, @upstash/redis)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
