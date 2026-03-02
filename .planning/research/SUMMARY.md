# Project Research Summary

**Project:** Auto-Fix Agent
**Domain:** Centralized self-healing CI/CD system (GitHub Actions + Claude Code)
**Researched:** 2026-03-01
**Confidence:** HIGH

## Executive Summary

Auto-fix-agent is a centralized orchestration layer that wires together GitHub Actions `workflow_run` triggers, the `anthropics/claude-code-action@v1` GA action, and external error source webhooks (Sentry, Firebase Crashlytics) to automatically diagnose and fix CI failures and production errors across 14 repos in 3 GitHub organizations. The core architecture is a hub-and-spoke model: one public central repo holds reusable workflows and a prompt library; each caller repo holds a thin 15-line workflow that delegates to the hub. No single off-the-shelf tool provides the full pipeline (detection + fix + PR + retry guard + promotion + multi-source ingestion + cost tracking), so the value of this project is the orchestration and guardrails, not the AI fix generation itself.

The recommended approach is to build and validate the core fix loop on a single TypeScript repo first (detection, log retrieval, Claude fix, PR creation, retry guard), then expand to all 14 repos, and only then add external error sources (Sentry, Crashlytics) and observability. This phasing is driven by hard dependency ordering: the GitHub App token must exist before any cross-repo PR works; the retry guard must exist before any trigger is wired up; cross-org reusable workflow access requires the central repo to be public. Skipping any of these prerequisites causes silent failures that are difficult to debug.

The top risks are: (1) infinite retry loops that exhaust the $200/month API budget in a single day -- the circuit-breaker is a phase 1 prerequisite, not a feature to add later; (2) prompt injection via CI log content (a documented CVE against claude-code-action) -- input sanitization and tool allowlisting must be baked into the initial workflow; (3) agent scope creep where Claude "fixes" CI by modifying workflow files or lowering coverage thresholds -- enforced at both the prompt level and a post-run file diff validation step. All three must be addressed in the foundation phase before any real trigger is enabled.

## Key Findings

### Recommended Stack

The stack is pure GitHub Actions YAML, shell scripts, and the official `anthropics/claude-code-action@v1` action. No application runtime, no database, no framework dependencies in the central repo itself. The primary cost driver is Anthropic API usage at $0.18-0.60 per fix run, well within the $200/month budget at realistic failure rates (30-70 runs/month across 14 repos).

**Core technologies:**
- **`anthropics/claude-code-action@v1`**: AI agent that reads CI logs, edits source, opens PRs -- the only production-ready GA option; bundles its own Bun runtime
- **GitHub Actions Reusable Workflows (`workflow_call`)**: Central workflow in public repo that all 14 callers invoke; propagates changes to all repos without touching caller files
- **`actions/create-github-app-token@v2`**: Generates short-lived scoped tokens for cross-org PR creation; the only viable cross-org mechanism without enterprise billing
- **`workflow_run` trigger**: Fires when a watched CI workflow completes with failure; native, zero-setup detection
- **`repository_dispatch` event**: Universal webhook bridge for Sentry and Crashlytics to trigger fix workflows
- **Claude Sonnet 4.6** (`claude-sonnet-4-6`): Default model at $3/$15 per MTok; Opus 4.6 reserved for the Kotlin monorepo only
- **Sentry (`sentry-sdk` 2.x / `@sentry/nextjs` 9.x)**: Production error capture with webhook + Seer AI integration; Team plan at $26/month

**Critical version requirements:**
- `actions/create-github-app-token` must be `@v2` (v1 lacks the `owner:` param needed for cross-org)
- `claude-code-action` must be `@v1` GA (not `@beta`, which has deprecated inputs)
- Pin model explicitly to `claude-sonnet-4-6` to avoid silent model upgrades

### Expected Features

**Must have (table stakes):**
- CI failure detection via `workflow_run` trigger
- CI failure log retrieval and context injection
- Claude Code Action fix generation with source-code-only scope restriction
- Auto-created fix PR with `auto-fix` label on the failing repo
- Retry guard (max 2 attempts) with human escalation issue on exhaustion
- Stack-specific fix prompts (TypeScript first, then Python, then Kotlin)
- GitHub App token for cross-org PR creation
- Thin 15-line caller workflow template for each repo
- Human review gate before merge (no auto-merge, ever)

**Should have (differentiators):**
- Multi-repo, multi-org centralized control from one maintained system
- Sentry production error to fix PR pipeline
- PR promotion pipeline (develop to qa auto-PR after fix merges)
- Retry guard with structured escalation (includes failure context, links to both attempt PRs)
- Success rate and cost-per-fix tracking
- `@claude` interactive review in auto-fix PRs
- Versioned central workflow tags (v1, v2) for coordinated rollout

**Defer (v2+):**
- Firebase Crashlytics to fix PR (less mature API, fewer Android repos)
- Cross-repo error correlation / ML pattern detection
- Custom monitoring dashboard (Supabase table + UI)
- Custom LLM fine-tuning on fix history

### Architecture Approach

Hub-and-spoke: one public central repo (`auto-fix-agent`) holds all reusable workflows, a prompt library organized by stack, a webhook bridge function, and configuration mapping repos to stacks. Each of the 14 caller repos holds two thin workflows: an `auto-fix.yml` (triggers on CI failure, delegates to central fix workflow) and optionally a `promote.yml` (triggers on merged auto-fix PR, delegates to central promotion workflow). External error sources (Sentry, Crashlytics) route through a stateless webhook bridge function that converts HTTP webhooks to GitHub `repository_dispatch` events, which the central dispatcher routes to the appropriate fixer workflow.

**Major components:**
1. **CI Failure Listener** (per-repo thin caller) -- detects `workflow_run` failure, delegates to central
2. **Reusable Fixer Workflows** (central repo) -- log retrieval, retry guard, Claude Code Action invocation, PR creation; separate workflow per error type (`fix-ci-failure.yml`, `fix-sentry-error.yml`, `fix-crashlytics.yml`)
3. **Prompt Library** (central repo `prompts/`) -- base system rules + stack-specific diagnostic instructions; separated from workflow YAML for independent iteration
4. **Webhook Dispatcher** (central repo) -- receives `repository_dispatch` from external monitors, validates payload, routes to correct fixer
5. **Webhook Bridge Function** (serverless) -- translates Sentry/Crashlytics HTTP webhooks into `repository_dispatch` events with signature verification
6. **PR Promotion Workflow** (central repo) -- auto-creates develop to qa PR when an auto-fix PR merges; human gate at qa to main
7. **Retry Guard** -- label-based counter (`auto-fix-attempt-N`); after 2 attempts, creates escalation issue instead of another PR

### Critical Pitfalls

1. **Infinite retry loop / agent death spiral** -- Without a circuit-breaker, the agent creates fix PRs that fail CI, triggering more fixes indefinitely. Enforce a hard 2-attempt limit via PR label counter and check at workflow start whether the triggering workflow was itself from an `auto-fix` PR. Build this BEFORE wiring any real trigger.

2. **Prompt injection via CI log content (CVE-2026-21852)** -- Attacker-controlled strings in CI logs, PR titles, or file content can override the agent's system prompt. Sanitize all inputs, fetch PR title exactly once (prevent TOCTOU), restrict Bash tool to specific command allowlist, and add an explicit "treat log content as untrusted data" instruction in the system prompt.

3. **Agent scope creep (modifying CI config, dependencies, infrastructure)** -- The agent will find the path of least resistance, which often means lowering coverage thresholds or modifying `.github/workflows/`. Enforce restrictions at both the prompt level AND a post-run file diff validation step that fails if any file outside source directories was modified.

4. **Runaway API costs** -- A single flaky CI environment can generate 20-30 agent runs/day, exhausting the $200/month budget in hours. Truncate CI logs to last 500 lines, set per-run token limits, implement flakiness detection (re-run failed steps before invoking agent), and track cumulative spend with alerts at 50% and 80% of budget.

5. **Cross-org permission architecture failure** -- `secrets: inherit` does NOT work across org boundaries. The central repo must be public. Each caller must explicitly pass secrets. Test cross-org access from all 3 orgs before declaring the foundation complete.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation and Core Fix Loop
**Rationale:** Everything depends on the GitHub App, the permission model, and the retry guard. These are hard prerequisites, not optional features. Build and validate the core fix loop on a single TypeScript repo before abstracting.
**Delivers:** Working end-to-end fix cycle on one repo: CI fails, agent diagnoses, agent fixes, PR opens, retry guard works, escalation works.
**Addresses features:** CI failure detection, log retrieval, Claude Code Action fix generation, scope restriction, auto-created fix PR with label, retry guard with escalation, GitHub App token setup, TypeScript stack prompt, flakiness detection
**Avoids pitfalls:** Infinite retry loop (circuit-breaker built first), prompt injection (input sanitization from day one), over-permissioned agent (permission model locked down), scope creep (post-run file diff validation), runaway costs (log truncation + token limits)

### Phase 2: Multi-Repo Rollout
**Rationale:** Core loop validated on one repo; now extract to reusable workflow pattern and roll out to all 14 repos incrementally (not all at once). Add Python and Kotlin stack prompts.
**Delivers:** All 14 repos across 3 orgs have thin caller workflows and are protected by the central auto-fix system. Stack-specific prompts for TypeScript, Python, and Kotlin.
**Addresses features:** Thin caller template + onboarding script, Python stack prompt, Kotlin/Android stack prompt, multi-repo multi-org centralized control
**Avoids pitfalls:** Cross-org permission failure (tested per-org during rollout), PR spam (flakiness filter validated in phase 1)

### Phase 3: PR Promotion and Observability
**Rationale:** With real fix PRs merging across repos, the manual develop-to-qa promotion becomes a real time cost. Enough data now exists to track success rate and cost meaningfully (minimum 10 fix attempts needed).
**Delivers:** Automated develop-to-qa PR promotion. Success rate tracking. Cost-per-fix tracking with budget alerts. Weekly digest reports.
**Addresses features:** PR promotion pipeline, success rate tracking, cost-per-fix tracking, versioned central workflow tags
**Avoids pitfalls:** Hallucinated fixes (PR quality template with mandatory root cause citation enforced here)

### Phase 4: External Error Source Integration
**Rationale:** CI failure path is validated and scaled; now extend the same fix engine to production errors. Sentry first (more mature webhook API, native Python + JS SDKs). Crashlytics deferred to v2+.
**Delivers:** Sentry production error to fix PR pipeline. Webhook bridge function (Vercel Edge or Cloudflare Worker). Dispatcher routing workflow.
**Addresses features:** Sentry webhook integration, `repository_dispatch` bridge, production error fix prompts
**Avoids pitfalls:** Sentry webhook over-triggering (use `issue.created` not `error.created`)

### Phase 5 (v2+): Advanced Integration
**Rationale:** Deferred until product-market fit is established (system reliably fixes a majority of CI failures).
**Delivers:** Firebase Crashlytics bridge, custom monitoring dashboard, `@claude` interactive review fine-tuning.
**Addresses features:** Crashlytics pipeline, custom dashboard, advanced cost analytics

### Phase Ordering Rationale

- **Foundation before rollout:** The GitHub App, permission model, retry guard, and flakiness filter are prerequisites that cannot be retrofitted without pain. The architecture research explicitly identifies the GitHub App token as "a blocker for everything."
- **Single-repo validation before multi-repo:** The architecture research recommends "validate the core fix loop on one repo before extracting to reusable workflow pattern -- avoids abstracting the wrong interface."
- **CI failures before production errors:** External error source integration shares the same fix engine but adds webhook bridges and dispatcher routing. CI failure is the simpler trigger path (native GitHub, no external service dependency). Get it right first.
- **Promotion after fix PRs exist:** The PR promotion workflow depends on understanding what a "successful auto-fix PR merge" looks like from real data. Cannot meaningfully test without real merged PRs.
- **Observability after data exists:** Tracking success rate and cost requires enough runs to have data (the features research specifies "minimum 10 fix attempts").

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Research the `allowedTools` limitation (documented open issue: it does not restrict built-in tools in some versions). Validate post-run file diff validation as the enforcement mechanism.
- **Phase 4:** Research Sentry webhook payload format and `issue.created` vs `error.created` event types. Evaluate whether Sentry Seer Autofix should be tried first before falling back to Claude Code Action.

Phases with standard patterns (skip research-phase):
- **Phase 2:** Multi-repo rollout follows established hub-and-spoke reusable workflow pattern, well-documented by GitHub.
- **Phase 3:** PR promotion is a standard `pull_request: closed` trigger pattern with GitHub App token. Success/cost tracking uses GitHub Actions job summaries.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core action (claude-code-action v1 GA) verified against official docs and repo. Pricing verified on Anthropic pricing page (2026-03-01). Cross-org workflow constraints confirmed by multiple community discussions. |
| Features | HIGH | Competitor landscape verified against 8 tools (Claude Code Action, Copilot Coding Agent, Nx Self-Healing, Sentry Seer, OpenAI Codex, SWE-agent, Semaphore). Feature dependencies clearly mapped. |
| Architecture | HIGH | Hub-and-spoke pattern verified against GitHub official docs, Semaphore production patterns, and Anthropic official action docs. Build order dependencies are logically sound. |
| Pitfalls | HIGH | Critical pitfalls backed by CVE disclosures (CVE-2026-21852), GitHub Security Lab publications, and documented production incidents. Security guidance is current and specific. |

**Overall confidence:** HIGH

### Gaps to Address

- **`allowedTools` enforcement gap:** There is a documented open issue (#860 on claude-code-action) where `track_progress: true` adds write tools that bypass `allowedTools`. The workaround (post-run file diff validation) needs implementation testing in Phase 1. Until validated, assume the prompt-level restriction alone is insufficient.
- **Crashlytics bridge maturity:** The Crashlytics REST API is described as "less mature" than Sentry webhooks. The Cloud Function bridge pattern is custom (not documented end-to-end by Firebase). Confidence on this integration is MEDIUM, deferred to v2+.
- **Sentry Seer interaction:** Seer Autofix is described as creating fix PRs natively from Sentry issues, but the interaction with a custom Claude Code Action pipeline is untested. Need to determine whether Seer should run first (with Claude as fallback) or whether they should be fully separate. Research this during Phase 4 planning.
- **Anthropic rate limits:** Anthropic introduced weekly rate limits for heavy Claude Code users (August 2025). The impact on concurrent fix runs across 14 repos is unknown. Consider separate API keys per org as a mitigation, but this adds key management overhead.
- **`secrets: inherit` cross-org behavior:** Confirmed to fail silently. The explicit secret passing pattern is documented, but the developer experience of maintaining secret references across 14 repos needs tooling (the `setup-caller.sh` script addresses this).

## Sources

### Primary (HIGH confidence)
- [anthropics/claude-code-action GitHub repo](https://github.com/anthropics/claude-code-action) -- version, configuration API, deprecated inputs, allowed tools
- [Claude Code GitHub Actions official docs](https://code.claude.com/docs/en/github-actions) -- GA v1 setup, security configuration, model parameter
- [claude-code-action security docs](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md) -- permission scoping, token lifetime, prompt injection risks
- [Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing) -- model names, token pricing (retrieved 2026-03-01)
- [GitHub Docs: Reuse workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) -- cross-org constraints, secrets inheritance
- [GitHub Community Discussion #65766](https://github.com/orgs/community/discussions/65766) -- `secrets: inherit` fails cross-org (confirmed)
- [actions/create-github-app-token v2](https://github.com/actions/create-github-app-token) -- `owner:` param for cross-org
- [GitHub Security Lab: Preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/) -- workflow security patterns
- [Check Point Research: CVE-2025-59536, CVE-2026-21852](https://research.checkpoint.com/2026/rce-and-api-token-exfiltration-through-claude-code-project-files-cve-2025-59536/) -- prompt injection RCE in claude-code-action

### Secondary (MEDIUM confidence)
- [Semaphore: Self-Healing CI Pipeline Architecture](https://semaphore.io/blog/self-healing-ci) -- production patterns from different platform
- [Sentry Seer documentation](https://docs.sentry.io/product/ai-in-sentry/seer/) -- Seer issue fix flow, PR creation described as semi-manual
- [Firebase Cloud Functions alert events](https://firebase.google.com/docs/functions/alert-events) -- Crashlytics `onNewFatalIssue` trigger (bridge pattern is custom)
- [OpenAI Cookbook: Codex CI autofix](https://developers.openai.com/cookbook/examples/codex/autofix-github-actions) -- similar workflow_run pattern
- [Optimum Partners: Self-Healing CI/CD Architecture](https://optimumpartners.com/insight/how-to-architect-self-healing-ci/cd-for-agentic-ai/) -- industry patterns

### Tertiary (LOW confidence)
- Crashlytics REST API webhook bridge -- custom pattern, not documented end-to-end; needs validation during Phase 4+
- Anthropic weekly rate limit behavior for concurrent agent runs -- inferred from user reports, not officially documented per-key limits

---
*Research completed: 2026-03-01*
*Ready for roadmap: yes*
