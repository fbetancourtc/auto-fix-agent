# Feature Research

**Domain:** Self-healing CI/CD agent — AI-powered auto-fix for CI failures and production errors
**Researched:** 2026-03-01
**Confidence:** HIGH (verified against Claude Code Action official docs, Sentry Seer docs, GitHub Agentic Workflows docs, Nx Self-Healing CI docs, Semaphore production patterns, OpenAI Codex CI cookbook, and multi-source community patterns)

---

## Context: Competitor Feature Landscape

Before categorizing, here is what each major tool in the space provides out of the box:

| Tool | Trigger | Fix Generation | PR Creation | Retry Logic | Cost Model |
|------|---------|----------------|-------------|-------------|------------|
| **Claude Code Action** | `@claude` mention, issue assignment, explicit prompt | Claude Code agent (full codebase access) | Yes, auto-creates PR | None built-in | Per-token Anthropic API |
| **GitHub Copilot Coding Agent** | Issue assigned to Copilot | Copilot GPT-4o (draft PRs, manual merge) | Yes, draft only | None built-in | Copilot Pro+ plan |
| **GitHub Agentic Workflows** | Declarative triggers, intent-driven | Copilot-powered, read-only by default | Yes, no auto-merge | None built-in | 2 premium requests/run |
| **Sentry Seer Issue Fix** | Sentry issue creation (new issues) | Root cause analysis + fix suggestion | Delegates to coding agents | None | Sentry Team plan ($26/mo) |
| **Nx Self-Healing CI** | CI task failure (nx-specific tasks) | High-confidence auto-commit for format/sync | Comment + one-click apply | Confidence threshold | Nx Cloud subscription |
| **OpenAI Codex CI** | `workflow_run` failure | Minimal surgical fix with test verification | Yes, auto-creates PR | None built-in | Per-token OpenAI API |
| **SWE-agent / OpenHands** | Manual / script invocation | Full agentic fix (72% SWE-bench resolve rate) | Yes | Configurable | Self-hosted or API |
| **Semaphore Self-Heal** | CI job failure | External agent (configurable) | Yes, via promotion | Loop prevention via selfheal branch naming | Semaphore CI plan |

**Key insight:** None of these tools provide the full pipeline out of the box — failure detection + fix generation + PR creation + retry guard + PR promotion + multi-source error ingestion + cost tracking — for a multi-repo, multi-org portfolio. The value of this project is the **orchestration layer** that wires them together with the right guardrails.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the system to be useful at all. Missing any of these means the system does not function as a self-healing CI agent.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **CI failure detection via `workflow_run`** | Without automatic detection, humans still have to trigger fixes manually — defeats the purpose | LOW | Native GitHub Actions trigger; `conclusion == 'failure'` condition. Already a standard pattern in OpenAI Codex cookbook and Semaphore. |
| **CI failure log retrieval** | Agent needs the actual error output to diagnose — cannot fix what it cannot read | LOW | `gh run view --log-failed` or GitHub REST API. Claude Code Action checks out code automatically; logs must be injected as context. |
| **AI-generated code fix** | This is the core product — a system that analyzes failures and generates source code changes | HIGH | Claude Code Action (`anthropics/claude-code-action@v1`) provides this. The prompt quality is the primary determinant of fix quality. |
| **Auto-created fix PR on the failed repo** | Without a PR, the fix has no path to review or merge | MEDIUM | Requires GitHub App token (not GITHUB_TOKEN) for cross-repo PR creation that triggers downstream CI. A critical non-obvious dependency. |
| **`auto-fix` label on generated PRs** | Users need to distinguish AI-generated PRs from human PRs in the PR list | LOW | `gh pr create --label "auto-fix"`. Required for tracking and for the retry guard to function. |
| **Scope restriction to source code** | If agent can modify `.github/workflows/`, it will disable failing checks to make CI pass — a security and reliability disaster | LOW | Enforced via Claude system prompt: "Never modify .github/, .env, *.env, secrets, CI configuration files, or Dockerfiles." |
| **Retry limit (max 2 attempts)** | Without a cap, repeated failed fixes create unbounded API costs, duplicate PRs, and developer confusion | MEDIUM | PR label counter (`auto-fix-attempt-1`, `auto-fix-attempt-2`). When limit reached, create escalation issue instead of another PR. |
| **Human escalation on retry exhaustion** | Retries exhausted = human must look at this; agent should not silently fail | LOW | Create a GitHub Issue labeled `needs-human` with failure context when retry limit is hit. |
| **Human review gate before merge** | No auto-merge of AI-generated code — industry consensus: "PRs are never merged automatically" (GitHub Agentic Workflows docs) | LOW | Architecture constraint, not a feature to build. Draft PRs or branch protection rules enforce this. |
| **Thin caller workflow (15-line max)** | Each of 14 repos needs to opt in. If the per-repo setup is complex, adoption fails | LOW | The thin caller is a `uses:` delegation to the central reusable workflow — literally 15 lines of YAML. |
| **Stack-specific fix prompts** | A TypeScript/Next.js prompt and a Python/FastAPI prompt need different diagnostic strategies and tool references | MEDIUM | Separate markdown prompt files per stack. Dispatcher selects the right one based on repo-to-stack config. |

### Differentiators (Competitive Advantage)

Features that are not provided by any single off-the-shelf tool and represent the unique value over using Claude Code Action raw. These justify building the orchestration layer rather than just installing the action.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-repo, multi-org centralized control** | 14 repos across 3 orgs get the same fix quality from one maintained system — changes propagate everywhere without touching 14 workflow files | MEDIUM | Hub-and-spoke reusable workflow architecture. Central repo must be public (for cross-org access without enterprise billing) or all orgs must share enterprise account. |
| **Sentry production error → fix PR pipeline** | Bridges the gap between production monitoring and code fixes — most teams manually copy Sentry stack traces into their IDE | HIGH | Requires: Sentry Team plan ($26/mo), webhook bridge function (stateless, Vercel Edge or Cloudflare Worker), `repository_dispatch` routing, separate fix prompt for production errors vs CI failures. |
| **Firebase Crashlytics → fix PR pipeline** | Closes the Android crash reporting → code fix gap with no manual triage step | HIGH | Crashlytics REST API is less mature than Sentry webhooks. Bridge function adds complexity. Consider Crashlytics-to-GitHub-Issues Firebase Extension as the simpler first step. |
| **PR promotion pipeline (develop → qa auto-PR)** | Eliminates the manual "now create a PR from develop to qa" step after merging a fix | MEDIUM | Triggered on `pull_request: closed` event when merged branch is `develop`. Must use GitHub App token — not GITHUB_TOKEN — so the promotion PR triggers CI on the qa branch. |
| **Retry guard with escalation** | Most raw Claude Code Action integrations have no loop protection. This system stops after 2 attempts and creates a human-actionable escalation issue | MEDIUM | Label-based counter is simple and sufficient at 14-repo scale. The escalation issue should include: attempt count, failure log excerpt, and a link to both auto-fix PRs. |
| **Success rate tracking dashboard** | Without metrics, you cannot know if the system is working — or if it is creating noise without fixes | MEDIUM | Track per-run outcomes: fixed / escalated / skipped. GitHub Actions job summaries provide zero-setup output. Optional: write to a lightweight store (Supabase table or GitHub Issues log) for trend tracking. |
| **Cost-per-fix tracking** | Anthropic API costs are a real budget concern ($0.50-5.00 per run, $200/month budget). Without tracking, cost overruns are invisible | MEDIUM | Log token usage from Claude Code Action output. Aggregate weekly. Alert if weekly spend exceeds threshold. |
| **`@claude` interactive review in auto-fix PRs** | Once the auto-fix PR is open, developers can ask `@claude` to explain the fix, adjust it, or extend it — without leaving GitHub | LOW | This is a built-in capability of Claude Code Action when configured in the repo. The auto-fix PR itself becomes a collaborative workspace. |
| **Versioned central workflow (v1, v2 tags)** | Caller repos pin to `@v1` so a breaking change in the central workflow does not break all 14 repos simultaneously | LOW | Standard GitHub Actions release tagging. Create releases when making breaking changes. |

### Anti-Features (Deliberately Not Building)

Features that sound useful but create problems. These are explicitly out of scope to prevent scope creep and protect system integrity.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-merge of fix PRs** | Reduces friction — why require human review if the agent is good? | LLM-generated code fails in non-obvious ways that pass tests. Security vulnerabilities. No human accountability for production code. GitHub itself mandates human approval for agent PRs. | Require PR approval. Use draft PRs to make the "this is not ready" signal explicit. |
| **Modifying CI configuration files (`.github/workflows/`)** | CI fails → agent "fixes" the CI definition to stop failing | Agent will disable failing checks, lower coverage thresholds, or add `continue-on-error: true`. This masks real bugs instead of fixing them. | Hard scope restriction in system prompt. Source code only. |
| **Cross-repo error correlation / pattern detection** | If the same bug appears in multiple repos, fix once and apply everywhere | Requires ML-based pattern matching, shared embeddings, and cross-repo context that is architecturally complex and has high false positive risk at this scale | Manual observation: if a pattern recurs, create a shared utility or linting rule. |
| **Autonomous production deployment** | If the fix works in qa, why not auto-deploy to main? | One bad auto-deploy can take down production. Human judgment for production gates is non-negotiable. Industry consensus is unanimous on this. | Mandatory human approval for qa → main. System auto-creates the PR; human approves the merge. |
| **Custom LLM fine-tuning on fix history** | Build a model specialized on your codebase's bug patterns | Training data requirements, model hosting costs, and maintenance burden far exceed the value at 14-repo scale with a $200/month budget | Use stack-specific prompts in CLAUDE.md / prompt files to give Claude codebase context without fine-tuning. |
| **Infrastructure provisioning fixes (Terraform, Pulumi)** | Infrastructure drift causes CI failures — why not fix it too? | Infrastructure changes have production blast radius. Agent modifying Terraform is dangerous without human review of the plan output. | Separate concern. Out of scope for this system. Infrastructure issues escalate directly to human. |
| **Automated rollback of production deployments** | Production error detected → rollback the bad deploy automatically | Rollback can trigger cascading failures if the rollback itself is wrong. Rollback decisions require context the agent does not have (in-flight transactions, data migrations). | Alert humans. Provide the deployment run link in the escalation issue. Rollback is a human decision. |
| **Slack/Teams/Email notifications per fix** | Developers want to know when the agent fires | Notification fatigue at 14 repos. Developers do not need to know every time — they need to know when a PR is created (GitHub already notifies) or when escalation happens | Use GitHub's native PR notification system. Only send external notification on escalation. |
| **Real-time "always-on" polling for failures** | Instant detection of failures as they happen | `workflow_run` already fires immediately when CI completes. Polling would add complexity and cost with no benefit. | `workflow_run` event-driven architecture. No polling needed. |

---

## Feature Dependencies

```
[CI failure detection: workflow_run trigger]
    └──requires──> [Thin caller workflow in each repo]
                       └──requires──> [Central reusable workflow (public or enterprise)]
                                          └──requires──> [GitHub App token for cross-org PR creation]

[AI-generated code fix]
    └──requires──> [CI failure log retrieval]
    └──requires──> [Stack-specific fix prompts]
    └──requires──> [Scope restriction in system prompt]

[Auto-created fix PR]
    └──requires──> [AI-generated code fix]
    └──requires──> [GitHub App token]
    └──enhances──> [auto-fix label]
    └──enhances──> [Retry guard: label counter]

[Retry guard]
    └──requires──> [auto-fix label on PRs] (counter depends on label query)
    └──enhances──> [Human escalation issue on exhaustion]

[PR promotion pipeline (develop → qa)]
    └──requires──> [Auto-created fix PR] (needs a merged auto-fix PR to promote)
    └──requires──> [GitHub App token] (promotion PR must trigger downstream CI)

[Sentry production error → fix PR]
    └──requires──> [Webhook bridge function]
    └──requires──> [repository_dispatch routing in dispatcher.yml]
    └──requires──> [Central reusable workflow]
    └──requires──> [Sentry Team plan ($26/mo)]

[Firebase Crashlytics → fix PR]
    └──requires──> [Webhook bridge function]
    └──requires──> [repository_dispatch routing]
    └──requires──> [Crashlytics REST API access OR Firebase Extension]

[Success rate tracking]
    └──requires──> [All fix workflows emitting outcome data]
    └──requires──> [At least one completed fix cycle to track]

[Cost-per-fix tracking]
    └──requires──> [Claude Code Action outputting token usage]
    └──enhances──> [Success rate tracking] (cost per successful fix is the key metric)

[Multi-repo, multi-org centralized control]
    └──requires──> [Central repo set to public OR GitHub Enterprise shared billing]
    └──requires──> [GitHub App installed on all 3 orgs]
```

### Dependency Notes

- **GitHub App token is a blocker for everything:** Without it, cross-repo PR creation fails with 403, and PRs created by GITHUB_TOKEN do not trigger downstream CI. This must be set up in Layer 1 before anything else.
- **Central repo visibility is a prerequisite for multi-org:** A private central repo can only be called by callers in the same org unless GitHub Enterprise billing is shared. For the 3-org portfolio (liftitapp, fbetancourtc, LiftitFinOps), the central repo must be public to avoid an enterprise plan requirement.
- **Retry guard depends on auto-fix labels:** The label counter query uses `gh pr list --label "auto-fix"` to find previous attempts. If the label is missing from a PR, the counter undercounts and the guard fails.
- **PR promotion depends on real merged PRs:** The promotion workflow is triggered by `pull_request: closed` on `develop`. You cannot test this until a real auto-fix PR is merged to develop.
- **Sentry and Crashlytics pipelines are independent:** They share the webhook bridge pattern and the central dispatcher, but fix-sentry-error.yml and fix-crashlytics.yml are separate workflows. They can be built in sequence after the CI failure path is validated.
- **`@claude` interactive review conflicts with cost budget:** Allowing open-ended `@claude` mentions in auto-fix PRs can run the model repeatedly with no token limit. Mitigate by configuring a `max_turns` or by only enabling interactive mentions for specific reviewers.

---

## MVP Definition

### Launch With (v1) — Validate the Core Loop

Minimum viable product: one repo, CI failure → fix PR, with guardrails. Proves the concept before expanding to 14 repos.

- [ ] **`workflow_run` failure trigger** — automatic detection on CI failure
- [ ] **CI log retrieval and injection into Claude context** — agent reads what broke
- [ ] **Claude Code Action fix generation with source-code-only scope restriction** — core value
- [ ] **Auto-created fix PR with `auto-fix` label** — fix has a path to review
- [ ] **Retry guard (max 2 attempts) with escalation issue** — cost control and human fallback
- [ ] **Stack-specific prompt for TypeScript** (most common: 10/14 repos) — fix quality for majority
- [ ] **GitHub App token for cross-org PR creation** — prerequisite for all PR operations

### Add After Validation (v1.x) — Scale and Extend

Add once the core loop is confirmed working on 2-3 repos with real fixes.

- [ ] **Thin caller template + onboarding script** — trigger: core loop validated, ready to roll out to all 14 repos
- [ ] **Python stack prompt** — trigger: TypeScript loop working, 4 Python repos are valuable enough to add
- [ ] **Kotlin/Android stack prompt** — trigger: Python added, Android monorepo needs specialized ktlint and detekt guidance
- [ ] **PR promotion pipeline (develop → qa)** — trigger: at least 5 merged auto-fix PRs, promotion bookkeeping is a real time cost
- [ ] **Success rate and cost tracking** — trigger: enough runs to have data (minimum 10 fix attempts)
- [ ] **Sentry production error → fix PR** — trigger: Sentry Team plan subscribed, monitoring configured on at least one repo

### Future Consideration (v2+) — Advanced Integration

Defer until product-market fit (the system is reliably fixing a majority of CI failures) is established.

- [ ] **Firebase Crashlytics → fix PR** — defer: Android repos are fewer, Crashlytics REST API is less mature than Sentry, Firebase Extension alternative exists as a simpler stop-gap
- [ ] **Cross-repo error correlation** — defer: requires ML pattern matching, out of scope per PROJECT.md
- [ ] **Custom monitoring dashboard (Supabase table + UI)** — defer: GitHub Actions job summaries and Issues log cover the need initially
- [ ] **Versioned caller workflow pinning (v2, v3 tags)** — defer: needed when breaking changes require coordinated rollout; not needed for v1

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| `workflow_run` failure trigger | HIGH | LOW | P1 |
| CI log retrieval + context injection | HIGH | LOW | P1 |
| Claude Code Action fix generation | HIGH | HIGH | P1 |
| Scope restriction (source code only) | HIGH | LOW | P1 |
| Auto-created fix PR + `auto-fix` label | HIGH | MEDIUM | P1 |
| Retry guard (max 2) + escalation issue | HIGH | MEDIUM | P1 |
| TypeScript stack-specific prompt | HIGH | MEDIUM | P1 |
| GitHub App token setup | HIGH | LOW | P1 (prerequisite) |
| Thin caller workflow template | HIGH | LOW | P1 |
| Python stack-specific prompt | MEDIUM | MEDIUM | P2 |
| Kotlin/Android stack-specific prompt | MEDIUM | HIGH | P2 |
| PR promotion pipeline (develop → qa) | MEDIUM | MEDIUM | P2 |
| `@claude` interactive review in fix PRs | MEDIUM | LOW | P2 |
| Success rate + cost tracking | HIGH | MEDIUM | P2 |
| Sentry production error pipeline | MEDIUM | HIGH | P2 |
| Versioned central workflow tags | LOW | LOW | P2 |
| Firebase Crashlytics pipeline | LOW | HIGH | P3 |
| Custom monitoring dashboard | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch (v1 core loop)
- P2: Should have, add after validation
- P3: Nice to have, v2+ consideration

---

## Competitor Feature Analysis

| Feature | Claude Code Action (raw) | GitHub Copilot Coding Agent | Nx Self-Healing CI | Sentry Seer | **This Project** |
|---------|--------------------------|-----------------------------|--------------------|-------------|-----------------|
| CI failure auto-detection | Requires manual trigger or custom workflow wiring | Issue must be manually assigned | Built-in (Nx only) | Built-in (Sentry issues) | Built-in via `workflow_run` |
| Fix generation quality | HIGH (full codebase + agentic) | MEDIUM (constrained sandbox) | LOW-MEDIUM (format/sync only) | MEDIUM (RCA + suggestion) | HIGH (inherits from Claude Code Action) |
| Auto-creates fix PR | Yes | Yes (draft only) | No (comment + one-click) | Delegates to external agent | Yes (labeled, non-draft) |
| Retry limit / loop prevention | None | None | Confidence threshold (no retry cap) | None | 2 attempts, then escalation issue |
| PR promotion pipeline | None | None | None | None | develop → qa auto-PR |
| Multi-repo centralized | None (per-repo installation) | None (per-repo) | Nx Cloud workspace | Sentry project | Yes (14 repos, 3 orgs, one workflow) |
| Production error intake | None | None | None | Yes (Sentry) | Yes (Sentry + Crashlytics via webhook bridge) |
| Cost tracking | None | Included in plan | Nx Cloud subscription | Sentry plan | Per-run tracking via job summaries |
| Human escalation on failure | None | None | None | Alert routing | Escalation GitHub Issue on retry exhaustion |
| Stack-specific prompts | Via CLAUDE.md per repo | Not configurable | N/A | N/A | Central prompt library (TS, Python, Kotlin) |
| Source-code-only scope | Configurable but not enforced by default | Constrained sandbox | N/A | N/A | Enforced via system prompt |

---

## Sources

- [Claude Code Action — Official GitHub Repository](https://github.com/anthropics/claude-code-action) — HIGH confidence (primary source)
- [Claude Code GitHub Actions — Anthropic Official Docs](https://code.claude.com/docs/en/github-actions) — HIGH confidence
- [Sentry Seer Issue Fix — Official Docs](https://docs.sentry.io/product/ai-in-sentry/seer/issue-fix/) — HIGH confidence (live documentation)
- [Sentry Seer Product Page](https://sentry.io/product/seer/) — HIGH confidence
- [GitHub Copilot Coding Agent — GitHub Docs](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) — HIGH confidence
- [GitHub Agentic Workflows — GitHub Blog](https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/) — HIGH confidence
- [Nx Self-Healing CI — Official Docs](https://nx.dev/docs/features/ci-features/self-healing-ci) — HIGH confidence
- [Use Codex CLI to Automatically Fix CI Failures — OpenAI Cookbook](https://developers.openai.com/cookbook/examples/codex/autofix-github-actions) — HIGH confidence
- [AI-Driven Self-Healing Pipelines — Semaphore Blog](https://semaphore.io/blog/self-healing-ci) — MEDIUM confidence (production pattern, independent vendor)
- [Self-Healing CI/CD for Agentic AI — Optimum Partners](https://optimumpartners.com/insight/how-to-architect-self-healing-ci/cd-for-agentic-ai/) — MEDIUM confidence
- [FinOps for Agents: Loop Limits and Tool-Call Caps — InfoWorld](https://www.infoworld.com/article/4138748/finops-for-agents-loop-limits-tool-call-caps-and-the-new-unit-economics-of-agentic-saas.html) — MEDIUM confidence
- [OpenHands Software Agent SDK Paper](https://arxiv.org/abs/2511.03690) — MEDIUM confidence (academic, current)
- [GitHub + Sentry Integration — Sentry Blog](https://github.blog/enterprise-software/secure-software-development/how-to-fix-errors-in-production-with-github-and-sentry/) — HIGH confidence
- [CLAUDE.md Files for Monorepo Configuration — Anthropic Blog](https://claude.com/blog/using-claude-md-files) — HIGH confidence

---
*Feature research for: Self-healing CI/CD agent system (GitHub Actions + Claude Code)*
*Researched: 2026-03-01*
