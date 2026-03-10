---
phase: 07
slug: dashboard-cron-monitors-and-alert-rules
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose && npx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose && npx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SENT-03 | unit | `npx vitest run tests/monitors.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SENT-03 | unit | `npx vitest run tests/monitors.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | SENT-02 | manual | Sentry Dashboard UI verification | N/A | ⬜ pending |
| 07-03-01 | 03 | 2 | SENT-04 | manual | Sentry Alert Rules UI verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/monitors.test.ts` — stubs for SENT-03 (cron monitor heartbeat)
- Existing test infrastructure (vitest, tsc) covers framework needs

*Dashboard creation and alert rule configuration are Sentry API/UI operations — validated manually.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dashboard panels show live data | SENT-02 | Requires Sentry UI with live metrics | Open Sentry dashboard, verify panels render with real data |
| Alert rules fire notifications | SENT-04 | Requires triggering real alert conditions | Verify alert rules exist, check test notification delivery |
| Cron monitor marks repo unhealthy after 7 days silence | SENT-03 | Requires 7-day timeout observation | Verify monitor config shows correct schedule in Sentry UI |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
