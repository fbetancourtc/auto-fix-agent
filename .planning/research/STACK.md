# Stack Research

**Domain:** AI-powered self-healing CI/CD system (centralized, cross-repo, cross-org)
**Researched:** 2026-03-01
**Confidence:** HIGH (core action/workflow layer), MEDIUM (Crashlytics bridge), LOW (cross-org secret inheritance edge cases)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `anthropics/claude-code-action` | `@v1` (GA) | AI agent that reads CI logs, edits source code, opens PRs | Official Anthropic action on GitHub Marketplace; GA as of 2025; supports headless automation mode via `prompt:` input without `@claude` trigger; the only production-ready option in this space — not beta, not third-party |
| GitHub Actions Reusable Workflows | Native (workflow_call) | Central `.github/workflows/` in `auto-fix-agent` repo that all 14 callers invoke with 15 lines | Eliminates prompt duplication; central update propagates to all repos; supported cross-org when central repo is **public** — the only viable cross-org mechanism without enterprise billing |
| `workflow_run` trigger | Native GitHub Actions | Fires when a watched CI workflow completes with `failure` conclusion | Purpose-built for this pattern; fires in the context of the central repo, not the failing repo — critical distinction for permissions |
| `repository_dispatch` event | Native GitHub Actions | External systems (Sentry, Crashlytics bridge) trigger fix workflows | Standard GitHub webhook-to-workflow bridge; any system with a PAT can POST to `/repos/{owner}/{repo}/dispatches` |
| Sentry (`sentry-sdk`) | Python: `2.x` / JS: `8.x` | Production error capture for Python + TypeScript repos | Sentry Seer creates fix PRs natively from issues; webhook events `issue_alert` and `error` available on Team plan ($26/mo); native Python + JS SDK; most mature option for this stack |
| `actions/create-github-app-token` | `@v2` | Generate GitHub App tokens with write access to target repos across orgs | The correct mechanism for cross-org repo write access; a single GitHub App installed across all 3 orgs generates scoped tokens per target; avoids PAT sprawl |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` (current) | Default model for auto-fix runs | $3/$15 per MTok input/output; correct balance of reasoning capability and cost for automated code fixes; Opus 4.6 ($5/$25) is an option for monorepo complexity but not necessary as default |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gh` CLI | Bundled in `ubuntu-latest` runners | Download CI job logs, create PRs, post comments | Always — the primary tool for fetching failure logs from the triggering repo in a `workflow_run` context; `gh run download` and `gh api repos/.../actions/jobs/{id}/logs` |
| `sentry-sdk[fastapi]` | `2.x` | Sentry instrumentation for Python/FastAPI backend | Add to Python repos; automatically captures unhandled exceptions with full context |
| `@sentry/nextjs` | `9.x` | Sentry instrumentation for Next.js dashboard | Add to TypeScript repos; source maps required for Seer to generate accurate PRs |
| Firebase Cloud Functions | `firebase-functions` v5 | Bridge Crashlytics crash alerts → `repository_dispatch` | Required only for Android crash detection; no native Crashlytics→GitHub webhook exists; Cloud Function listens to `onNewFatalIssue` alert, POSTs to GitHub |
| `nick-fields/retry` | `@v3` | Retry transient GitHub API calls in workflows | Use for any `gh api` or `curl` calls that may hit rate limits; configure `max_attempts: 3` |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| CLAUDE.md (per-repo) | Tells Claude the stack, conventions, and scope boundaries for each repo | Place in each caller repo root; instructs the agent to only touch source code, never `.github/workflows/`; include stack-specific context (pytest for Python, vitest for TS, ktlint for Kotlin) |
| GitHub App (custom, single) | Cross-org identity for committing and PR creation | Install one app across all 3 orgs (liftitapp, fbetancourtc, LiftitFinOps); use `actions/create-github-app-token@v2` with `owner:` set per target org; generates short-lived scoped tokens |
| `.github/workflows/auto-fix-caller.yml` (per repo) | 15-line caller that invokes the central reusable workflow | Standard template; only variables are the repo's CI workflow name and stack hint |

---

## Installation

```bash
# Python repos: add to requirements.txt or pyproject.toml
pip install sentry-sdk[fastapi]==2.*

# TypeScript/Next.js repos
npm install @sentry/nextjs@^9

# No npm package needed for the central workflow repo itself —
# it is pure GitHub Actions YAML + shell scripts
```

---

## Workflow Architecture (Central Repo Pattern)

The central `auto-fix-agent` repo holds the reusable workflows. Each of the 14 repos holds a thin caller.

**Central reusable workflow** (`.github/workflows/ci-failure-fix.yml` in `auto-fix-agent`):
```yaml
on:
  workflow_call:
    inputs:
      target_repo:
        required: true
        type: string
      run_id:
        required: true
        type: string
      stack_hint:
        required: false
        type: string
        default: "typescript"
    secrets:
      ANTHROPIC_API_KEY:
        required: true
      APP_ID:
        required: true
      APP_PRIVATE_KEY:
        required: true

jobs:
  auto-fix:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      actions: read
    steps:
      - name: Generate GitHub App token for target repo
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}
          owner: ${{ github.repository_owner }}   # scoped to target org

      - name: Checkout target repo
        uses: actions/checkout@v4
        with:
          repository: ${{ inputs.target_repo }}
          token: ${{ steps.app-token.outputs.token }}

      - name: Download CI failure logs
        run: |
          gh run view ${{ inputs.run_id }} \
            --repo ${{ inputs.target_repo }} \
            --log-failed > /tmp/ci_failure.log 2>&1 || true
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          github_token: ${{ steps.app-token.outputs.token }}
          prompt: |
            CI failed on ${{ inputs.target_repo }}.
            Stack: ${{ inputs.stack_hint }}.
            Failure log:
            $(cat /tmp/ci_failure.log)

            Fix the root cause in source code only.
            Do NOT modify .github/workflows/ or any CI configuration.
            Run the relevant test suite to verify your fix.
            Open a PR targeting the failed branch labeled `auto-fix`.
          claude_args: |
            --max-turns 10
            --model claude-sonnet-4-6
            --allowedTools "Bash(npm test),Bash(npm run lint),Bash(pytest),Bash(./gradlew test),Edit,Read,Write"
            --disallowedTools "WebSearch"
```

**Per-repo caller** (`.github/workflows/auto-fix.yml` in each of 14 repos):
```yaml
on:
  workflow_run:
    workflows: ["CI"]        # exact name of this repo's CI workflow
    types: [completed]

jobs:
  trigger-fix:
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    uses: your-org/auto-fix-agent/.github/workflows/ci-failure-fix.yml@main
    with:
      target_repo: ${{ github.repository }}
      run_id: ${{ github.event.workflow_run.id }}
      stack_hint: "typescript"    # or "python", "kotlin-monorepo"
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      APP_ID: ${{ secrets.APP_ID }}
      APP_PRIVATE_KEY: ${{ secrets.APP_PRIVATE_KEY }}
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `anthropics/claude-code-action@v1` | `autofix-ci/action` | autofix-ci is better for narrow, deterministic fixes (e.g., formatting, import sorting) — not for reasoning-heavy bug diagnosis; use it alongside claude-code-action for lint-only failures |
| `anthropics/claude-code-action@v1` | OpenAI Codex CLI in CI | If already on OpenAI ecosystem; Codex cookbook has a similar `workflow_run` pattern but requires Node runtime setup; choose based on API contract, not capability gap |
| `anthropics/claude-code-action@v1` | Sentry Seer Autofix | Seer only works for production errors Sentry has already captured; it does not handle CI test failures; use Seer for production, claude-code-action for CI — they are complementary |
| Sentry | Datadog APM | Datadog is better if you already pay for it; Sentry is cheaper for this scale (14 repos, ~150 employees) and has native Seer integration |
| Firebase Cloud Functions (bridge) | Alerting via PagerDuty webhook | PagerDuty adds another paid tier; Cloud Functions are free up to 2M invocations/month at this scale |
| Claude Sonnet 4.6 | Claude Opus 4.6 | Use Opus 4.6 only for the Kotlin+Python+TypeScript monorepo (`liftit-control-de-asistencia`) where cross-language context is large; Sonnet 4.6 handles single-stack repos adequately |
| Reusable workflow (public central repo) | Private central repo with `secrets: inherit` | `secrets: inherit` does NOT work cross-org; the central repo must be public for cross-org `uses:` calls without enterprise GitHub billing |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@beta` tag for claude-code-action | Beta is deprecated; breaking changes vs v1 GA; `direct_prompt`, `mode`, `max_turns` inputs no longer exist | `anthropics/claude-code-action@v1` |
| `secrets: inherit` across orgs | Only works within the same org or enterprise plan; silently fails cross-org, causing the called workflow to receive no secrets | Explicit `secrets:` block passing each secret by name in the caller |
| `GITHUB_TOKEN` for cross-repo commits | Scoped to the workflow's repo only; cannot push to a different repo or org | GitHub App token via `actions/create-github-app-token@v2` |
| `--allowedTools Bash` (unrestricted) | Unrestricted Bash means Claude can run arbitrary commands including deployment scripts, curl to external services, etc. | Allowlist specific commands: `--allowedTools "Bash(npm test),Bash(pytest),Edit,Read,Write"` |
| Modifying `.github/workflows/` in fix PRs | Allows agent to escalate its own permissions or disable CI gates — major security risk | Set this in CLAUDE.md as an explicit prohibition; the `--disallowedTools` flag does not prevent file writes by path |
| Sentry Free tier | No webhook integration on Free; webhook events (issue_alert, error) require Team plan or above | Sentry Team plan at $26/mo |
| `claude-opus-4-1` or `claude-opus-4` (old Opus) | $15/$75 per MTok — 3x the cost of Opus 4.6 ($5/$25) or Sonnet 4.6 ($3/$15) for equivalent or better results | `claude-sonnet-4-6` (default) or `claude-opus-4-6` (complex monorepo) |

---

## Stack Patterns by Variant

**If the failing repo is TypeScript (10 repos):**
- `stack_hint: "typescript"`
- Allow: `Bash(npm install),Bash(npm test),Bash(npm run lint),Bash(npx tsc --noEmit),Edit,Read,Write`
- Claude.md should mention: vitest or jest, ESLint, TypeScript strict mode

**If the failing repo is Python (4 repos):**
- `stack_hint: "python"`
- Allow: `Bash(pip install -r requirements.txt),Bash(pytest),Bash(ruff check .),Bash(mypy .),Edit,Read,Write`
- Claude.md should mention: FastAPI, pytest coverage threshold (95%), ruff linting

**If the failing repo is the Kotlin+Python+TypeScript monorepo:**
- `stack_hint: "kotlin-monorepo"`
- Use `claude-opus-4-6` instead of Sonnet — the cross-language reasoning benefit justifies 1.67x cost
- Allow per-component: `Bash(./gradlew test),Bash(./gradlew ktlintCheck),Bash(pytest),Bash(npm test)`
- Set `--max-turns 15` (more complex codebase)

**If the error source is Sentry (production error, not CI):**
- Trigger path: Sentry webhook → `repository_dispatch` → separate workflow `sentry-fix.yml`
- Consider Sentry Seer Autofix first (it has Sentry context Claude does not)
- Fall back to claude-code-action if Seer confidence is low or plan does not include Seer ($40/contributor/mo)

**If the error source is Firebase Crashlytics (Android crash):**
- Cloud Function trigger: `onNewFatalIssue` → POST to GitHub `repository_dispatch`
- `client_payload` must include: crash type, affected version, stack trace excerpt
- Target repo is always `liftit-control-de-asistencia`; stack_hint is `kotlin-monorepo`

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `anthropics/claude-code-action@v1` | GitHub Actions runner `ubuntu-latest` (ubuntu-24.04) | Bundles its own Bun runtime; no Node.js setup step required |
| `actions/create-github-app-token@v2` | `anthropics/claude-code-action@v1` | v2 supports `owner:` param for cross-org; v1 does not — use v2 |
| `claude-sonnet-4-6` model | `claude-code-action@v1` | Pass via `claude_args: "--model claude-sonnet-4-6"`; the action defaults to Sonnet, but pin explicitly to avoid silent model upgrades |
| `sentry-sdk` `2.x` | Python 3.9+ | FastAPI integration via `sentry_sdk.integrations.fastapi.FastApiIntegration()` |
| `@sentry/nextjs` `9.x` | Next.js 14+ | Requires source maps upload to Sentry for Seer to generate accurate PRs; add `withSentryConfig` wrapper in `next.config.js` |
| `workflow_run` trigger | Reusable workflows via `workflow_call` | A `workflow_run` job in the central repo cannot directly call a reusable workflow in the same run — the caller repo's thin workflow fires `workflow_run`, which calls the central reusable; this two-hop is correct |

---

## Cost Model

At the $200/month API budget constraint:

| Scenario | Model | Est. tokens/run | Est. cost/run | Max runs/mo at $200 |
|----------|-------|-----------------|---------------|---------------------|
| TypeScript CI fix | Sonnet 4.6 | ~50K input, ~5K output | ~$0.23 | 869 |
| Python CI fix | Sonnet 4.6 | ~40K input, ~4K output | ~$0.18 | 1,111 |
| Kotlin monorepo fix | Opus 4.6 | ~80K input, ~8K output | ~$0.60 | 333 |
| Sentry production fix | Sonnet 4.6 | ~60K input, ~6K output | ~$0.27 | 740 |

With 14 repos and a realistic failure rate of 2-5 CI failures/repo/week, expect ~30-70 runs/month. Budget of $200 provides 10x headroom at Sonnet pricing. Cost spikes only if the monorepo fails frequently — monitor and alert at $150 spend.

**Prompt caching opportunity:** The CLAUDE.md content (codebase conventions, stack instructions) repeats across every run. Enable 1-hour cache writes for system prompts to reduce input token cost by 90% on cache hits. This requires structuring the prompt so the static context block appears first.

---

## Sources

- [anthropics/claude-code-action GitHub repo](https://github.com/anthropics/claude-code-action) — version, configuration API, deprecated inputs (HIGH confidence)
- [Claude Code GitHub Actions official docs](https://code.claude.com/docs/en/github-actions) — GA v1 setup, breaking changes from beta, model parameter (HIGH confidence)
- [claude-code-action/docs/configuration.md](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md) — allowed tools, MCP config, settings JSON, reusable workflow pattern (HIGH confidence)
- [claude-code-action/docs/security.md](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) — permission scoping, token lifetime, prompt injection risks (HIGH confidence)
- [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing) — current model names (Sonnet 4.6, Opus 4.6), token pricing (HIGH confidence, retrieved 2026-03-01)
- [GitHub Docs: Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) — cross-org constraints, secrets inheritance, nesting limits (HIGH confidence)
- [GitHub Community: Cross-org reusable workflows](https://github.com/orgs/community/discussions/65766) — confirmed `secrets: inherit` fails cross-org (HIGH confidence, multiple community confirmations)
- [actions/create-github-app-token](https://github.com/actions/create-github-app-token) — v2 with `owner:` param for cross-org (HIGH confidence)
- [Sentry Seer documentation](https://docs.sentry.io/product/ai-in-sentry/seer/) — Seer issue fix flow, GitHub PR creation, plan requirements (MEDIUM confidence — PR creation described as semi-manual)
- [Sentry Seer pricing](https://sentry.zendesk.com/hc/en-us/articles/45551407771931) — $40/active contributor/month as of Jan 21, 2026 (HIGH confidence)
- [Sentry webhooks documentation](https://docs.sentry.io/organization/integrations/integration-platform/webhooks/) — event types, signature verification, 1-second response SLA (HIGH confidence)
- [Firebase Cloud Functions alert events](https://firebase.google.com/docs/functions/alert-events) — Crashlytics `onNewFatalIssue` trigger (MEDIUM confidence — bridge pattern is custom, not documented end-to-end)
- [GitHub Actions 2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/) — $0.002/min platform fee shelved indefinitely after backlash (HIGH confidence)

---

*Stack research for: AI-powered self-healing CI/CD system (auto-fix-agent)*
*Researched: 2026-03-01*
