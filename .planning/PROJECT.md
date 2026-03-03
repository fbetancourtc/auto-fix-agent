# Auto-Fix Agent

## What This Is

A centralized self-healing CI/CD system that monitors repos across 3 GitHub organizations for CI failures, auto-diagnoses bugs using Claude Code Action, implements source-code-only fixes, and opens PRs with human approval gates. Shipped v1.0 MVP and v1.1 multi-repo rollout. Now adding monitoring and observability via Sentry + Vercel webhook receiver.

## Core Value

When CI fails on any monitored repo, an AI agent automatically analyzes the failure, fixes the code, and opens a PR — reducing mean-time-to-fix from hours to minutes without human intervention until the final merge gate.

## Requirements

### Validated

- ✓ Reusable GitHub Actions workflow callable cross-org via thin 15-line caller — v1.0
- ✓ Stack-specific prompt library (TypeScript production, Python/Kotlin stubs) — v1.0
- ✓ CI failure auto-detection via `workflow_run` trigger with flakiness filter — v1.0
- ✓ Agent reads CI failure logs (last 500 lines, sanitized) and identifies root cause — v1.0
- ✓ Agent implements fix within allowed source directories only — v1.0
- ✓ Post-agent diff validation reverts any forbidden file modifications — v1.0
- ✓ Auto-created fix PR with `auto-fix` label and structured description — v1.0
- ✓ 2-attempt retry guard with `needs-human` escalation — v1.0
- ✓ Human review gate enforced architecturally (no auto-merge) — v1.0
- ✓ Input sanitization for CI logs (prompt injection, shell injection, secrets) — v1.0
- ✓ Python stack-specific fix prompt (24 patterns, 6 categories) — v1.1
- ✓ Kotlin stack-specific fix prompt (stub, expand when failures surface) — v1.1
- ✓ Thin caller template with ONBOARDING.md — v1.1
- ✓ 8 repos enrolled with working auto-fix (fbetancourtc + LiftitFinOps) — v1.1
- ✓ Auto-create develop→qa PR when fix PR merges — v1.1
- ✓ Human approval gate for qa→main promotion — v1.1
- ✓ Success rate tracking per repo — v1.1
- ✓ Cost-per-fix tracking via token usage output — v1.1
- ✓ Budget alerts at 50%/80% of $200/month threshold — v1.1
- ✓ Circuit breaker prevents self-triggering on auto-fix PR failures — v1.0
- ✓ Per-run token/time limits (`--max-turns 10`, `timeout-minutes: 15`) — v1.0
- ✓ Agent isolated from production secrets and deployment triggers — v1.0

### Active

- [ ] Vercel serverless webhook receiver for GitHub events
- [ ] Sentry integration for operations health, value metrics, safety, and artifact monitoring
- [ ] Dashboard with operations, value, safety, and artifact panels
- [ ] `@claude` interactive code review via PR comments
- [ ] Liftitapp org enrollment (6 repos, pending admin approval)
- [ ] LiftitFinOps/conciliacion-averias secrets configuration

### Out of Scope

- Auto-merge of fix PRs — LLM code requires human approval
- Modifying CI configuration files — agent fixes source code only
- Cross-repo error correlation / ML — architecturally complex at this scale
- Custom LLM fine-tuning — uses Claude API directly
- Infrastructure fixes (Terraform) — production blast radius
- Automated rollback — requires context agent doesn't have
- Slack/Teams notifications — GitHub PR notifications suffice

## Current Milestone: v1.2 Monitoring & Observability

**Goal:** Add monitoring and observability to the auto-fix pipeline via Sentry + Vercel webhook receiver, providing visibility into operations health, value metrics, safety signals, and artifact status.

**Target features:**
- Vercel serverless function (`/api/webhook.ts`) receiving GitHub webhook events (workflow_run, pull_request, pull_request_review)
- Sentry integration: Transactions (per run), Custom Events, Cron Monitors (per repo), Alerts, Dashboards
- Operations health: trigger frequency, fix outcomes (success/fail/escalation), repo health scores
- Value metrics: PR acceptance rate, mean-time-to-fix (MTTR), cost per fix
- Safety monitoring: budget burn rate, scope violations, failure pattern detection
- Artifact monitoring: caller deployment status, PR lifecycle tracking, promotion pipeline health

**Architecture:**
- GitHub Webhooks → Vercel Serverless Function → Sentry
- Receiver lives in this repo (auto-fix-agent) as a Vercel function
- User has existing Sentry account

## Context

Shipped v1.1 with ~1,973 LOC across YAML, Shell, JSON, and Markdown.
Tech stack: GitHub Actions, Claude Code Action, Bash scripts, JSON config.
GitHub App (ID: 2985828) installed on fbetancourtc and LiftitFinOps; Liftitapp pending admin.
14 active repos across 3 orgs (10 TypeScript, 4 Python, 1 Kotlin monorepo).
Audit found 4 non-critical tech debt items — all mitigated.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid architecture (central + per-repo callers) | 14 repos across 3 orgs — centralized prompts with thin per-repo callers | ✓ Good — clean separation of concerns |
| Claude Code Action over SWE-agent/OpenHands | Already using Claude ecosystem, GA official action | ✓ Good — simple integration |
| Public central repo for cross-org access | Required for free cross-org reusable workflow access | ✓ Good — avoids enterprise billing |
| Human gate at qa → main | Non-negotiable safety requirement | ✓ Good — enforced architecturally |
| Max 2 retries per failure | Prevents infinite loops and runaway API costs | ✓ Good — with closed-PR tracking |
| Start per-repo (validate) → extract to central | Learn what works before abstracting | ✓ Good — validated pattern in Phase 2 |
| Post-agent validation pattern | Agent pushes freely, workflow validates after | ✓ Good — simpler than pre-validation |
| Circuit breaker fails open | Transient API failures shouldn't block fixes | ⚠️ Revisit — monitor false positive rate |
| Retry guard counts repo-wide | Simpler than per-run tracking | ⚠️ Revisit — premature escalation risk |

## Constraints

- **API Cost**: ~$0.50-5.00 per fix run — budget ~$200/month
- **GitHub Actions**: Caller repos need `contents: write` and `pull-requests: write`
- **Cross-org**: Central repo must be public (or enterprise billing required)
- **Security**: Agent NEVER has production secrets or deployment triggers
- **Rate limits**: GitHub API (5000 req/hr) and Anthropic API limits

---
*Last updated: 2026-03-03 after starting v1.2 milestone*
