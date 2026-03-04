---
phase: 05
slug: webhook-receiver-and-security-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-03
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual smoke tests via curl + GitHub webhook deliveries + Sentry dashboard |
| **Config file** | none — deployed serverless function, no local test harness |
| **Quick run command** | `curl -s -o /dev/null -w "%{http_code}" -X POST https://<app>.vercel.app/api/webhook -H "Content-Type: application/json" -d '{}'` |
| **Full suite command** | GitHub Settings > Webhooks > Recent Deliveries > Redeliver from each org |
| **Estimated runtime** | ~30 seconds (curl smoke) / ~3 minutes (full webhook redeliver across 3 orgs) |

---

## Sampling Rate

- **After every task commit:** Deploy via `git push`, verify Vercel deployment succeeds, run quick curl smoke
- **After every plan wave:** GitHub webhook test delivery from all 3 orgs, check Sentry for breadcrumbs
- **Before `/gsd:verify-work`:** All 5 success criteria verified manually
- **Max feedback latency:** 60 seconds (Vercel deploy + curl)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | smoke | Vercel deploy succeeds, visit URL returns 405 | N/A — manual | ⬜ pending |
| 05-01-02 | 01 | 1 | INFRA-02 | smoke | `curl` to deployed endpoint returns 401 (no sig) | N/A — manual | ⬜ pending |
| 05-01-03 | 01 | 1 | HOOK-02 | smoke | `curl` with invalid `X-Hub-Signature-256` returns 401 | N/A — manual | ⬜ pending |
| 05-01-04 | 01 | 1 | SENT-01 | smoke | Check Sentry dashboard for test error capture | N/A — manual | ⬜ pending |
| 05-02-01 | 02 | 2 | HOOK-01 | smoke | GitHub webhook test delivery returns 200 | N/A — manual | ⬜ pending |
| 05-02-02 | 02 | 2 | HOOK-03 | smoke | Send test events of each type, verify routing | N/A — manual | ⬜ pending |
| 05-02-03 | 02 | 2 | HOOK-05 | smoke | Check Sentry breadcrumbs after 200 response | N/A — manual | ⬜ pending |
| 05-02-04 | 02 | 2 | HOOK-06 | smoke | Send `issues` event, verify filtered (no Sentry tx) | N/A — manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `package.json` — npm dependencies (@octokit/webhooks-methods, @sentry/node, @vercel/functions)
- [ ] `tsconfig.json` — TypeScript configuration
- [ ] `vercel.json` — Vercel deployment config (trailingSlash: false)
- [ ] `api/webhook.ts` — handler entry point stub
- [ ] Vercel project creation and GitHub repo linking
- [ ] Environment variables (`GITHUB_WEBHOOK_SECRET`, `SENTRY_DSN`) in Vercel dashboard
- [ ] Sentry project `auto-fix-monitor` creation
- [ ] Org-level webhook registration for all 3 GitHub organizations

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Webhook 200 from each org | HOOK-01 | Requires live GitHub org webhook delivery | GitHub Settings > Webhooks > Test delivery |
| Signature rejection | HOOK-02 | Requires live endpoint for curl test | `curl -X POST <url> -d '{}' -H "Content-Type: application/json"` — expect 401 |
| Sentry error capture | SENT-01 | Requires Sentry dashboard inspection | Throw test error, check Sentry Issues |
| waitUntil deferred processing | HOOK-05 | Requires timing analysis on live function | Check response time < 5s while Sentry shows deferred breadcrumbs |
| Event filtering | HOOK-06 | Requires sending non-matching GitHub events | Send `issues` event, verify no Sentry transaction |
| 3 org webhooks configured | INFRA-02 | Requires GitHub org admin access | Check each org's webhook settings for delivery status |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
