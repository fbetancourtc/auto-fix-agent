---
phase: 07-dashboard-cron-monitors-and-alert-rules
verified: 2026-03-10T05:00:00Z
status: human_needed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Trigger a webhook event from an enrolled repo and confirm cron monitor auto-creates in Sentry under Crons sidebar"
    expected: "A monitor named repo-{org}-{repo} appears with status OK"
    why_human: "captureCheckIn with upsert behavior creates the monitor in the Sentry platform — cannot verify external Sentry state programmatically"
  - test: "Run scripts/setup-dashboard.sh with valid SENTRY_AUTH_TOKEN and SENTRY_ORG_SLUG, then open the returned dashboard URL"
    expected: "Auto-Fix Operations dashboard exists in Sentry with 12 widgets across Operations Health, Value Metrics, and Safety Signals sections"
    why_human: "Dashboard creation requires live Sentry API call; MRI format may need adjustment — script notes LOW confidence on MRI strings"
  - test: "Run scripts/setup-alerts.sh with valid credentials and navigate to Sentry Alerts -> Alert Rules"
    expected: "Four alert rules exist: Low Success Rate, Cost Spike, Budget Warning (80%), Budget Critical (100%)"
    why_human: "Alert rule creation requires live Sentry API call against the authenticated organization"
---

# Phase 7: Dashboard, Cron Monitors, and Alert Rules — Verification Report

**Phase Goal:** Sentry surfaces actionable operational visibility through dashboard panels, silence detection per repo, and threshold-based alerts
**Verified:** 2026-03-10T05:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each enrolled repo has a Sentry Cron Monitor that marks the repo unhealthy if no events arrive within 7 days | VERIFIED (code) / HUMAN (platform) | `api/lib/monitors.ts` exports `emitRepoHeartbeat` with 7-day interval schedule, checkinMargin=1440, failureIssueThreshold=1. `api/webhook.ts` calls it gated on `result.processed`. Sentry auto-creates monitors on first check-in — platform state requires human confirm. |
| 2 | Processing a webhook event for a repo emits a heartbeat check-in to Sentry for that repo | VERIFIED | `api/webhook.ts` line 91: `const result = await routeEvent(...)`, lines 94-97: extracts `repoFullName` and calls `emitRepoHeartbeat(repoFullName)` when `result.processed && repoFullName`. Import at line 19 confirmed. |
| 3 | Repo names are sanitized into valid Sentry monitor slugs (lowercase, hyphens only) | VERIFIED | `repoSlug()` in `api/lib/monitors.ts`: lowercases, replaces non-alphanumeric with hyphens, collapses consecutive hyphens, trims trailing hyphens, prefixes with "repo-". 7 test cases in `tests/monitors.test.ts` cover org/repo, dots, underscores, mixed case, consecutive special chars, trailing hyphens. |
| 4 | A Sentry Custom Dashboard exists with Operations Health, Value Metrics, and Safety Signal panels | VERIFIED (script) / HUMAN (platform) | `scripts/setup-dashboard.sh` (255 lines, valid bash) POSTs 12 widgets to `sentry.io/api/0/organizations/{org}/dashboards/`. Three panel groups confirmed in JSON payload. Dashboard creation in Sentry platform requires human confirm. |
| 5 | Sentry alert rules fire when success rate drops, cost spikes, or a repo goes silent | VERIFIED (script) / HUMAN (platform) | `scripts/setup-alerts.sh` (191 lines, valid bash) creates 4 alert rules via `alert-rules/` API: Low Success Rate (below, 24h), Cost Spike (avg>$5, 1h), Budget Warning (sum>$160, 24h), Budget Critical (sum>$200, 24h). Repo silence handled by cron monitors (Plan 01). Platform state requires human confirm. |
| 6 | Setup scripts document the exact Sentry configuration for reproducibility | VERIFIED | `docs/sentry-setup.md` (243 lines): 5 sections covering prerequisites, dashboard setup, alert rules, cron monitor verification, and troubleshooting. Covers all 12 dashboard widgets with manual UI instructions and all 4 alert rules as fallback to API scripts. |

**Score:** 6/6 truths verified (automated portions confirmed; 3 truths additionally need human platform verification)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `api/lib/monitors.ts` | emitRepoHeartbeat and repoSlug functions | VERIFIED | 51 lines. Exports both functions. `repoSlug` sanitizes via regex chain. `emitRepoHeartbeat` calls `Sentry.captureCheckIn` with 7-day interval schedule, checkinMargin=1440, failureIssueThreshold=1, recoveryThreshold=1. |
| `tests/monitors.test.ts` | Unit tests for slug generation and captureCheckIn calls (min 40 lines) | VERIFIED | 94 lines (exceeds min_lines=40). 10 tests: 7 for `repoSlug`, 3 for `emitRepoHeartbeat`. Mocks `@sentry/node` with `captureCheckIn: vi.fn()`. Tests verify exact call arguments including schedule config. |
| `scripts/setup-dashboard.sh` | Sentry Dashboard API creation script with all 12 widget definitions (min 50 lines) | VERIFIED | 255 lines (exceeds min_lines=50). Valid bash syntax (`bash -n` passed). POSTs to Sentry dashboards API. JSON payload contains exactly 12 widget objects across 3 panel groups. Includes error handling and MRI format guidance. |
| `scripts/setup-alerts.sh` | Sentry Alert Rule API creation script for 4 alert rules (min 40 lines) | VERIFIED | 191 lines (exceeds min_lines=40). Valid bash syntax (`bash -n` passed). Creates 4 alert rules via `alert-rules/` endpoint. Uses `generic_metrics` dataset. Includes `create_alert` helper with error tracking. |
| `docs/sentry-setup.md` | Manual setup guide as fallback for API scripts (min 30 lines) | VERIFIED | 243 lines (exceeds min_lines=30). 5 sections. Covers all 12 dashboard widgets, all 4 alert rules, cron monitor verification steps, and troubleshooting for empty widgets, missing monitors, and API auth failures. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `api/webhook.ts` | `api/lib/monitors.ts` | `import emitRepoHeartbeat`, call after `routeEvent` returns `processed: true` | WIRED | Line 19: `import { emitRepoHeartbeat } from './lib/monitors.js'`. Lines 91-97: result captured, `emitRepoHeartbeat(repoFullName)` called inside `if (result.processed && repoFullName)` block. |
| `api/lib/monitors.ts` | `@sentry/node` | `Sentry.captureCheckIn()` with interval schedule | WIRED | Line 12: `import * as Sentry from '@sentry/node'`. Line 39: `Sentry.captureCheckIn(...)` with monitorSlug, status, and full schedule config including `type: 'interval', value: 7, unit: 'day'`. |
| `scripts/setup-dashboard.sh` | Sentry Dashboard API | `curl POST /api/0/organizations/{org}/dashboards/` | WIRED | Line 23: `API_BASE="https://sentry.io/api/0/organizations/${SENTRY_ORG_SLUG}"`. Line 231: `curl ... -X POST "${API_BASE}/dashboards/"` with auth header and JSON payload. |
| `scripts/setup-alerts.sh` | Sentry Alert Rules API | `curl POST /api/0/organizations/{org}/alert-rules/` | WIRED | Line 33: `curl ... -X POST "${API_BASE}/alert-rules/"` inside `create_alert` helper. Called 4 times for each alert rule. |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SENT-02 | 07-02-PLAN.md | Custom Sentry dashboard with Operations Health, Value Metrics, and Safety Signal panels | VERIFIED (script) / HUMAN (platform) | `scripts/setup-dashboard.sh` defines all 3 panel groups with 4 widgets each (12 total). `docs/sentry-setup.md` provides manual fallback for each widget. Dashboard in live Sentry requires human confirmation. |
| SENT-03 | 07-01-PLAN.md | Sentry Cron Monitors per enrolled repo detect repos that stop triggering events | VERIFIED (code) / HUMAN (platform) | `api/lib/monitors.ts` implements per-repo heartbeat with 7-day interval. `api/webhook.ts` calls it after successful event processing. Cron monitors auto-create in Sentry on first check-in — live monitor state requires human confirmation. |
| SENT-04 | 07-02-PLAN.md | Sentry alert rules fire when success rate drops, cost spikes, or a repo goes silent | VERIFIED (script) / HUMAN (platform) | `scripts/setup-alerts.sh` defines 4 alert rules: low success rate, cost spike, budget warning, budget critical. Repo silence handled via cron monitors (SENT-03). Live alert rules in Sentry require human confirmation. |

All 3 requirement IDs from PLAN frontmatter are accounted for. No orphaned requirements found — REQUIREMENTS.md confirms SENT-02, SENT-03, SENT-04 all mapped to Phase 7.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/setup-dashboard.sh` | 25 | `# --- NOTE: LOW confidence on exact MRI format ---` | Info | Expected and intentional. Script is a best-effort IaC artifact; `docs/sentry-setup.md` provides manual fallback. Does not block code correctness. |

No blockers found. No stubs, placeholder implementations, or empty handlers detected in any phase file.

---

### Human Verification Required

#### 1. Sentry Cron Monitors — auto-creation on first webhook event

**Test:** Deploy the updated webhook function (`npx vercel --prod`), then trigger a webhook from any enrolled repo (push, PR open, or wait for CI). Navigate to Sentry -> Crons sidebar.

**Expected:** A cron monitor named `repo-{org}-{repo-name}` appears with status "OK". Monitor config shows 7-day interval schedule.

**Why human:** `captureCheckIn` with an interval schedule auto-upserts the monitor in the Sentry platform. The code is wired and verified, but whether the monitor actually materialized in the live Sentry account cannot be verified without executing against the platform.

#### 2. Sentry Custom Dashboard — 12 widgets across 3 panel groups

**Test:** Set env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`) and run `./scripts/setup-dashboard.sh`. If the API call fails due to MRI format issues, follow the manual instructions in `docs/sentry-setup.md` Section 2. Then open the dashboard URL returned by the script (or navigate to Sentry -> Dashboards).

**Expected:** Dashboard titled "Auto-Fix Operations" exists with 3 sections: Operations Health (4 widgets), Value Metrics (4 widgets), Safety Signals (4 widgets). Widgets may show "No data" until metrics flow.

**Why human:** Dashboard creation requires a live Sentry API call with org-scoped credentials. MRI format correctness (`c:custom/...@none` etc.) can only be confirmed against the live metrics namespace.

#### 3. Sentry Alert Rules — 4 threshold-based rules

**Test:** Set env vars (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG_SLUG`, `SENTRY_PROJECT_SLUG`) and run `./scripts/setup-alerts.sh`. Navigate to Sentry -> Alerts -> Alert Rules.

**Expected:** Four alert rules exist: "Auto-Fix: Low Success Rate", "Auto-Fix: Cost Spike", "Auto-Fix: Budget Warning (80%)", "Auto-Fix: Budget Critical (100%)". Each shows the correct threshold, time window, and notification action.

**Why human:** Alert rule creation requires live Sentry API credentials and project configuration. The `generic_metrics` dataset and threshold values are correct per RESEARCH.md guidance, but live API acceptance depends on the specific Sentry plan and organization configuration.

---

### Summary

All 6 observable truths are fully verified at the code level. The automated code path — monitors module, slug sanitization, webhook integration, setup scripts, and documentation — is substantive, wired, and free of stubs or placeholder implementations. All 4 documented commits (`f333125`, `4b87777`, `98acc32`, `62fead9`) exist in git history and match their described purpose.

Three of the six truths additionally require human confirmation because they depend on live Sentry platform state: whether cron monitors auto-created, whether the dashboard API call accepted the MRI format, and whether alert rules were accepted by the authenticated organization. These are external service verifications that cannot be assessed programmatically.

The LOW confidence note on MRI format in `setup-dashboard.sh` is intentional and accompanied by a full manual fallback in `docs/sentry-setup.md`. This is not a defect — it accurately reflects uncertainty documented in the phase RESEARCH.md.

SENT-02, SENT-03, and SENT-04 are all covered with no orphaned requirements.

---

_Verified: 2026-03-10T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
