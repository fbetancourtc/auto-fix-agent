# Auto-Fix Agent

## What This Is

A centralized self-healing CI/CD system that monitors all Liftit and Lavandarosa repos for CI failures and production errors, auto-diagnoses bugs using Claude Code Action, implements fixes, and promotes them through develop → qa → main with human approval gates. Serves 14+ active repos across 3 GitHub organizations.

## Core Value

When CI fails on any monitored repo, an AI agent automatically analyzes the failure, fixes the code, and opens a PR — reducing mean-time-to-fix from hours to minutes without human intervention until the final merge gate.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Reusable GitHub Actions workflow that any repo can call with a 15-line caller
- [ ] CI failure auto-detection via `workflow_run` trigger on failed builds
- [ ] Agent reads CI failure logs and identifies root cause
- [ ] Agent searches codebase, implements fix, and runs tests in the runner
- [ ] Agent opens PR targeting the failed branch with fix description
- [ ] `@claude` mention in PR comments triggers interactive code review/fixes
- [ ] Sentry webhook integration for production error detection (Python + JS)
- [ ] Firebase Crashlytics integration for Android crash detection
- [ ] `repository_dispatch` event bridge for external error sources
- [ ] Stack-specific prompt configs (TypeScript, Python, Kotlin/monorepo)
- [ ] PR promotion pipeline: auto-create develop → qa PR after fix merges
- [ ] Human approval gate for qa → main promotion (non-negotiable)
- [ ] Max 2 retry limit per failure — escalate to human on exhaustion
- [ ] All auto-fix PRs labeled `auto-fix` for filtering and tracking
- [ ] Agent scope restricted to source code only (no CI config, no secrets)
- [ ] Success rate tracking and monitoring dashboard

### Out of Scope

- Full autonomous deployment to production — always requires human merge to main
- Modifying CI/CD configuration files (`.github/workflows/`) — agent only fixes source code
- Cross-repo error correlation or ML-based pattern detection — v2+
- Custom LLM fine-tuning — uses Claude API directly
- Infrastructure provisioning (Terraform, Pulumi) — separate concern
- Automated rollback of production deployments — separate tooling

## Context

### Repository Portfolio (14 active repos, 3 orgs)

**Liftitapp Org:**
- `liftit-control-de-asistencia` — Kotlin + Python + TypeScript monorepo (attendance control)
- `averias-marketplace` — TypeScript
- `geocoding-enterprise` — TypeScript (geocoding API)
- `conciliacion-recaudo-liftit` — Python (cash reconciliation)
- `liftit-ai-system` — TypeScript (AI logistics)
- `geocoding-liftit-api` — Python (geocoding service)
- `liftit-cargo-receptor-de-cumplidos` — Python (POD processing)

**Personal (fbetancourtc):**
- `laundry-operating-dash` — TypeScript (laundry management)
- `lavandarosa-platform` — TypeScript
- `lavandarosa-petal-web` — TypeScript
- `laundry-property-managers` — TypeScript
- `laundry-cleaning-staff` — TypeScript
- `laundry-admin-dash` — TypeScript
- `binance-bot` — Python (trading bot)

**LiftitFinOps:**
- `conciliacion-averias` — Python (claims reconciliation)

### Stack Distribution
- TypeScript: 10 repos (71%)
- Python: 4 repos (29%)
- Kotlin + Python + TypeScript: 1 monorepo
- All repos use GitHub Actions for CI
- Branch strategy: develop → qa → main (most repos)

### Key Tools Validated (from prior research)
1. **Claude Code Action** (`anthropics/claude-code-action@v1`) — GA, official GitHub Marketplace
2. **Claude CLI headless mode** — `claude -p "prompt" --allowedTools Bash,Read,Edit --output-format json`
3. **Sentry Seer** — built-in AI that auto-creates fix PRs from production errors
4. **GitHub `workflow_run` trigger** — reacts to failed CI runs
5. **GitHub `repository_dispatch`** — external systems trigger workflows

### Current CI/CD State (liftit-control-de-asistencia as reference)
- Backend CI: pytest (95% coverage threshold), ruff linting, mypy type checking
- Dashboard CI: vitest (90% coverage threshold), ESLint, TypeScript checks
- Android CI: JUnit + Robolectric, ktlint, detekt, JaCoCo coverage
- No error monitoring (Sentry/Crashlytics) configured on any repo yet

## Constraints

- **API Cost**: Anthropic API usage per auto-fix run (~$0.50-5.00 per fix) — budget ~$200/month
- **GitHub Actions**: Reusable workflows require the caller repo to grant `contents: write` and `pull-requests: write` permissions
- **Cross-org workflows**: GitHub reusable workflows can be called cross-org only if the central repo is public or the orgs share enterprise billing
- **Sentry plans**: Free tier limited — Team plan ($26/mo) needed for webhook integrations
- **Security**: Agent must NEVER have access to production secrets, deployment triggers, or CI config modification
- **Rate limits**: GitHub API rate limits (5000 req/hr authenticated) and Anthropic API rate limits

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid architecture (central + per-repo callers) | 14 repos across 3 orgs — centralized prompts with thin per-repo callers prevents maintenance burden | — Pending |
| Claude Code Action over SWE-agent/OpenHands | Already using Claude ecosystem, GA official action, simpler integration | — Pending |
| Sentry over Crashlytics for backend/dashboard | Native webhook support, Seer AI integration, unified platform for Python + JS | — Pending |
| Human gate at qa → main | Non-negotiable safety requirement — agent never auto-deploys to production | — Pending |
| Max 2 retries per failure | Prevents infinite loops and runaway API costs | — Pending |
| Start per-repo (validate) → extract to central | Learn what works before abstracting — avoid premature optimization | — Pending |

---
*Last updated: 2026-03-01 after initialization*
