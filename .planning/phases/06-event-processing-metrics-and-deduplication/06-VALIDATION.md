---
phase: 06
slug: event-processing-metrics-and-deduplication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (or npx tsc --noEmit for type checking) |
| **Config file** | none — Wave 0 installs if needed |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | INFRA-03 | integration | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | HOOK-04 | integration | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | OPS-01, OPS-02, OPS-04 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | VAL-01, VAL-02, VAL-03, VAL-04 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 2 | SAFE-01, SAFE-02, SAFE-03, SAFE-04 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 2 | OPS-03 | type-check | `npx tsc --noEmit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `@upstash/redis` — npm install for dedup store
- [ ] Verify `@octokit/webhooks-types` v7 already in package.json

*Existing TypeScript infrastructure covers type checking. No test framework needed for Phase 6 — metrics are verified via Sentry dashboard in Phase 7.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Metrics visible in Sentry | OPS-01 thru OPS-04, VAL-01 thru VAL-04, SAFE-01 thru SAFE-04 | Requires live Sentry project with real webhook events | Send test webhook, check Sentry metrics explorer |
| Dedup prevents duplicates | HOOK-04 | Requires live Redis + redelivered webhook | Redeliver same event via GitHub UI, verify no duplicate metric |
| Budget gauge accumulates | VAL-04, SAFE-01 | Requires multiple events over time | Process 3+ events, check cumulative gauge in Sentry |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
