# Architecture Research

**Domain:** Centralized self-healing CI/CD agent system (GitHub Actions + Claude Code)
**Researched:** 2026-03-01
**Confidence:** HIGH (GitHub official docs + Semaphore production patterns + Anthropic official action docs)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL ERROR SOURCES                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐    │
│  │  GitHub CI   │  │  Sentry Webhooks│  │  Firebase Crashlytics       │    │
│  │  (workflow_  │  │  (production    │  │  (Android crash reports)    │    │
│  │   run fail)  │  │   errors)       │  │                             │    │
│  └──────┬───────┘  └────────┬────────┘  └──────────────┬──────────────┘    │
└─────────┼───────────────────┼──────────────────────────┼───────────────────┘
          │ workflow_run       │ HTTP POST webhook         │ HTTP POST webhook
          │ (native GHA)       │                           │
          ▼                   ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CENTRAL REPO (auto-fix-agent)                           │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  WEBHOOK DISPATCHER  (.github/workflows/dispatcher.yml)              │   │
│  │  - Receives repository_dispatch events from external monitors        │   │
│  │  - Validates payloads, extracts: repo, branch, error_type, context  │   │
│  │  - Routes to appropriate reusable fixer workflow                    │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │ calls                                      │
│  ┌──────────────────────────────▼───────────────────────────────────────┐   │
│  │  REUSABLE FIXER WORKFLOWS (.github/workflows/fix-*.yml)              │   │
│  │                                                                      │   │
│  │  fix-ci-failure.yml        — responds to workflow_run failures       │   │
│  │  fix-sentry-error.yml      — responds to Sentry production errors   │   │
│  │  fix-crashlytics.yml       — responds to Android crash reports      │   │
│  │                                                                      │   │
│  │  Each workflow:                                                       │   │
│  │  1. Reads failure logs / error context                               │   │
│  │  2. Invokes Claude Code Action with stack-specific prompt            │   │
│  │  3. Opens fix PR on the CALLER repo                                  │   │
│  │  4. Labels PR `auto-fix`, links to failure                          │   │
│  │  5. Posts result to monitoring dashboard                             │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │ calls                                      │
│  ┌──────────────────────────────▼───────────────────────────────────────┐   │
│  │  SHARED RESOURCES (.github/prompts/, configs/)                       │   │
│  │                                                                      │   │
│  │  prompts/typescript-fix.md  — TypeScript/Next.js fix instructions   │   │
│  │  prompts/python-fix.md      — FastAPI/Python fix instructions       │   │
│  │  prompts/kotlin-fix.md      — Kotlin/Android fix instructions       │   │
│  │  prompts/base-system.md     — Common agent behavior rules           │   │
│  │  configs/stack-detection.yml — Maps repo names to stack types       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │ cross-org workflow_call (public repo OR enterprise)
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CALLER REPOS (14 repos, 3 orgs)                          │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  THIN CALLER (~15 lines, .github/workflows/auto-fix.yml)             │   │
│  │                                                                      │   │
│  │  on:                                                                 │   │
│  │    workflow_run:                                                     │   │
│  │      workflows: ["CI"]                                               │   │
│  │      types: [completed]                                              │   │
│  │  jobs:                                                               │   │
│  │    auto-fix:                                                         │   │
│  │      if: github.event.workflow_run.conclusion == 'failure'          │   │
│  │      uses: auto-fix-agent/.github/workflows/fix-ci-failure.yml@v1  │   │
│  │      secrets: inherit                                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  PR PROMOTION CALLER (.github/workflows/promote.yml)                 │   │
│  │                                                                      │   │
│  │  on:                                                                 │   │
│  │    pull_request:                                                     │   │
│  │      types: [closed]         # triggers when auto-fix PR merges     │   │
│  │      branches: [develop]                                            │   │
│  │  jobs:                                                               │   │
│  │    promote:                                                          │   │
│  │      uses: auto-fix-agent/.github/workflows/promote-pr.yml@v1      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
          │ PR creation (via GitHub App token)
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PR PROMOTION PIPELINE                                │
│                                                                              │
│  [auto-fix PR] → [human review] → [merge to develop]                       │
│       ↓                                                                      │
│  [auto-create PR: develop → qa]  — triggered on close                      │
│       ↓                                                                      │
│  [human approval gate]  ← NON-NEGOTIABLE                                   │
│       ↓                                                                      │
│  [merge to main]                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Webhook Dispatcher | Receives external errors, normalizes payload, routes to fixer | GitHub Actions workflow with `repository_dispatch` trigger |
| CI Failure Listener | Detects failed workflow runs in caller repos | `workflow_run` trigger with `conclusion == 'failure'` condition |
| Reusable Fixer Workflows | Orchestrates the fix cycle: log retrieval → agent → PR | Reusable GitHub Actions workflows in central repo |
| Claude Code Action | Reads logs, searches codebase, implements fix, runs tests | `anthropics/claude-code-action@v1` with stack-specific `prompt` |
| Prompt Library | Stack-specific fix instructions and agent behavior rules | Markdown files in `.github/prompts/` of central repo |
| PR Promotion Workflow | Auto-creates develop → qa PR when auto-fix merges | Reusable workflow triggered on `pull_request: closed` |
| External Webhook Bridge | Translates Sentry/Crashlytics events into `repository_dispatch` | Serverless function (AWS Lambda / Vercel Edge Function) OR GitHub webhook forwarding |
| Retry Guard | Prevents infinite fix loops, escalates on exhaustion | Workflow-level counter via PR labels (`auto-fix-attempt-1`, `auto-fix-attempt-2`) |
| Monitoring Dashboard | Tracks success rate, cost per fix, escalation rate | GitHub Actions summary + optional Supabase table |

## Recommended Project Structure

```
auto-fix-agent/                       # Central repo (public or enterprise-internal)
├── .github/
│   └── workflows/
│       ├── fix-ci-failure.yml        # Reusable: triggered by workflow_run failure
│       ├── fix-sentry-error.yml      # Reusable: triggered by Sentry repository_dispatch
│       ├── fix-crashlytics.yml       # Reusable: triggered by Crashlytics repository_dispatch
│       ├── promote-pr.yml            # Reusable: develop → qa PR auto-creation
│       └── dispatcher.yml            # Routes repository_dispatch to correct fixer
├── prompts/
│   ├── base-system.md                # Common rules: scope, retry, PR format
│   ├── typescript-fix.md             # TS/Next.js/React context + common failure patterns
│   ├── python-fix.md                 # FastAPI/pytest context + common failure patterns
│   └── kotlin-fix.md                 # Kotlin/Android/ktlint context + common patterns
├── configs/
│   ├── stack-detection.yml           # Maps repo → stack type (used by dispatcher)
│   └── escalation-contacts.yml      # Who gets notified on retry exhaustion
├── scripts/
│   ├── webhook-bridge/               # Serverless function for Sentry → repository_dispatch
│   │   ├── handler.py                # Validates signature, calls GitHub API
│   │   └── vercel.json / serverless.yml
│   └── setup-caller.sh              # Script to add caller workflow to a new repo
├── examples/
│   ├── caller-auto-fix.yml          # Template: thin caller for CI auto-fix
│   ├── caller-promote.yml           # Template: thin caller for PR promotion
│   └── CLAUDE.md.template           # Template CLAUDE.md for caller repos
└── docs/
    ├── onboarding.md                 # How to add a new repo to the system
    └── runbook.md                    # Ops guide: escalation, cost monitoring
```

### Structure Rationale

- **`.github/workflows/`:** All reusable workflows live here because GitHub requires `workflow_call` workflows to be in `.github/workflows/` of the called repo.
- **`prompts/`:** Separated from workflows so prompts can be iterated without touching workflow logic. Passed to the action via `--append-system-prompt`.
- **`configs/`:** Declarative stack detection avoids hard-coding repo names inside workflows. Dispatcher reads this to select the right prompt.
- **`scripts/webhook-bridge/`:** The bridge between Sentry/Crashlytics and GitHub's `repository_dispatch` API. Small and stateless — a single HTTP handler.
- **`examples/`:** Copy-paste starting points for onboarding new repos. The `setup-caller.sh` script automates this.

## Architectural Patterns

### Pattern 1: Hub-and-Spoke Reusable Workflows

**What:** One central repo hosts all reusable workflows. Each of the 14 caller repos has a thin 15-line workflow that delegates to the hub via `uses: org/central-repo/.github/workflows/fix.yml@v1`.

**When to use:** When maintaining N nearly-identical workflows across repos. Any change to fix logic propagates to all callers by updating the hub — callers pin to a version tag.

**Trade-offs:** Centralization is powerful but requires the hub to be either public (works across orgs) or in an enterprise account with internal visibility. Cross-org access for private central repos requires a GitHub Enterprise plan or making the central repo public.

**Example:**
```yaml
# In caller repo: .github/workflows/auto-fix.yml
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]

jobs:
  auto-fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: liftitapp/auto-fix-agent/.github/workflows/fix-ci-failure.yml@v1
    with:
      repo: ${{ github.repository }}
      branch: ${{ github.event.workflow_run.head_branch }}
      run_id: ${{ github.event.workflow_run.id }}
    secrets:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
      github_app_private_key: ${{ secrets.GH_APP_PRIVATE_KEY }}
```

### Pattern 2: Repository Dispatch as Universal Event Bus

**What:** External systems (Sentry, Crashlytics, custom monitors) cannot trigger GitHub Actions directly via `workflow_run`. Instead, a lightweight webhook bridge function translates external webhooks into GitHub `repository_dispatch` events, which can trigger any workflow in the central repo.

**When to use:** Whenever an error source lives outside GitHub (production monitoring, crash reporting, custom health checks).

**Trade-offs:** Requires deploying a stateless bridge function (Vercel Edge, AWS Lambda, or Cloudflare Worker — all free tier friendly for this volume). Bridge must verify webhook signatures from source systems to prevent spoofing.

**Example:**
```python
# scripts/webhook-bridge/handler.py
import hmac, hashlib, json
from github import Github

def handle_sentry_webhook(request):
    # 1. Verify Sentry-Hook-Signature header
    sig = request.headers.get("Sentry-Hook-Signature")
    body = request.body
    expected = hmac.new(SENTRY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return 401

    # 2. Parse error data
    payload = json.loads(body)
    repo = map_dsn_to_repo(payload["project"]["slug"])

    # 3. Fire repository_dispatch to central repo
    g = Github(GITHUB_TOKEN)
    central = g.get_repo("liftitapp/auto-fix-agent")
    central.create_repository_dispatch(
        event_type="sentry-error",
        client_payload={
            "repo": repo,
            "error_type": payload["level"],
            "title": payload["message"],
            "url": payload["url"],
        }
    )
```

### Pattern 3: Retry Guard via PR Label Counter

**What:** Track how many auto-fix attempts have been made for a given failure using PR labels (`auto-fix-attempt-1`, `auto-fix-attempt-2`). When a label for attempt 2 already exists, escalate to a human rather than creating a third PR.

**When to use:** Required to prevent runaway API costs and infinite fix loops. The 2-retry limit from the project requirements maps directly to this pattern.

**Trade-offs:** Label-based state is simple but only tracks per-PR. If the branch is deleted and recreated, the counter resets. For this project scale (14 repos, ~150 employees), this is acceptable.

**Example:**
```yaml
# In fix-ci-failure.yml
- name: Check retry count
  id: retry-check
  run: |
    ATTEMPTS=$(gh pr list --repo $REPO --label "auto-fix" \
      --search "head:$BRANCH" --json labels \
      | jq '[.[].labels[].name | select(startswith("auto-fix-attempt-"))] | length')
    echo "attempts=$ATTEMPTS" >> $GITHUB_OUTPUT

- name: Escalate if exhausted
  if: steps.retry-check.outputs.attempts >= 2
  run: |
    gh issue create --repo $REPO \
      --title "Auto-fix exhausted for: $FAILURE_TITLE" \
      --label "needs-human" \
      --body "Auto-fix failed after 2 attempts. Manual investigation required."
    exit 0  # Stop workflow without failing

- name: Run Claude fix
  if: steps.retry-check.outputs.attempts < 2
  uses: anthropics/claude-code-action@v1
  with:
    prompt: ...
```

### Pattern 4: Staged PR Promotion (develop → qa → main)

**What:** When an auto-fix PR is merged to `develop`, a separate workflow automatically creates a PR from `develop` to `qa`. The `qa → main` promotion requires explicit human approval — no automation crosses this gate.

**When to use:** Any multi-environment branch strategy where you want automation to handle the bookkeeping of promotion PRs but humans to own production gates.

**Trade-offs:** Requires a GitHub App token (not GITHUB_TOKEN) because PRs created by GITHUB_TOKEN do not trigger downstream workflows (this is a GitHub security design). The GitHub App token is treated as a real user action and does trigger CI.

**Example:**
```yaml
# promote-pr.yml (reusable)
on:
  workflow_call:
    inputs:
      source_branch: { type: string, default: develop }
      target_branch: { type: string, default: qa }

jobs:
  create-promotion-pr:
    runs-on: ubuntu-latest
    steps:
      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.GH_APP_ID }}
          private-key: ${{ secrets.GH_APP_PRIVATE_KEY }}
          repositories: ${{ inputs.caller_repo }}

      - name: Create promotion PR
        env:
          GH_TOKEN: ${{ steps.app-token.outputs.token }}
        run: |
          gh pr create \
            --repo ${{ inputs.caller_repo }} \
            --head ${{ inputs.source_branch }} \
            --base ${{ inputs.target_branch }} \
            --title "chore: promote auto-fix from develop to qa" \
            --label "auto-promotion" \
            --body "Automated promotion. Review the merged auto-fix before approving."
```

## Data Flow

### CI Failure Auto-Fix Flow

```
[Caller Repo CI fails]
         |
         | workflow_run event (conclusion: failure)
         v
[Caller: auto-fix.yml]
    - if: conclusion == failure
         |
         | uses: central/.github/workflows/fix-ci-failure.yml@v1
         v
[Central: fix-ci-failure.yml]
    1. Download failure logs (gh run view --log-failed)
    2. Check retry counter (PR labels)
    3a. If retries >= 2 → create escalation issue → EXIT
    3b. If retries < 2 → continue
         |
         | invokes
         v
[Claude Code Action (anthropics/claude-code-action@v1)]
    - Checks out caller repo code
    - Reads failure logs as context
    - Applies stack-specific prompt (typescript/python/kotlin)
    - Searches codebase for root cause
    - Implements fix
    - Runs tests locally to verify
         |
         | creates PR on caller repo
         v
[PR on Caller Repo]
    - labeled: auto-fix, auto-fix-attempt-N
    - body: failure summary + Claude explanation
    - targets: failed branch (not develop directly)
         |
         | human reviews and merges
         v
[PR merged to develop]
         |
         | pull_request closed event
         v
[Caller: promote.yml]
    - uses: central/promote-pr.yml@v1
         |
         v
[Auto-created PR: develop → qa]
         |
         | human approves
         v
[qa → main PR] (human-created or manually promoted)
```

### External Error (Sentry) Fix Flow

```
[Production error in Sentry]
         |
         | HTTP POST (Sentry webhook)
         v
[Webhook Bridge Function]
    - Validates Sentry-Hook-Signature
    - Maps project slug → GitHub repo
    - Extracts: error title, stack trace, url
         |
         | POST /repos/auto-fix-agent/dispatches
         | event_type: sentry-error
         | client_payload: {repo, error, stack_trace}
         v
[Central: dispatcher.yml]
    - Reads client_payload
    - Routes to fix-sentry-error.yml
         |
         v
[Central: fix-sentry-error.yml]
    - Fetches additional Sentry context (Seer analysis if available)
    - Invokes Claude Code Action with production error prompt
    - Creates fix PR on the affected repo
         |
         v
[PR on Affected Repo] → same promotion flow as above
```

### Key Data Flows

1. **Failure context propagation:** Log data travels from the failed CI run → downloaded by the central workflow → injected as context into the Claude Code Action prompt. The action itself checks out the caller repo code, so Claude reads actual source.

2. **Cross-org authentication:** GitHub App generates short-lived installation tokens at workflow runtime. The App is installed on all 3 orgs. Tokens are scoped to the specific caller repo for each run — no broad standing credentials.

3. **Prompt selection:** The dispatcher reads `configs/stack-detection.yml` to map repo name to stack type, then passes the correct prompt file path as a workflow input to the fixer workflow.

4. **Result tracking:** Each completed run posts a summary to GitHub Actions job summary (visible in the Actions tab). Optionally, a final step writes a row to a tracking store (GitHub Issues as a log, or Supabase table) for dashboard aggregation.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-14 repos (current) | Single central repo, workflow_run polling, in-memory retry tracking via labels |
| 15-50 repos | Add queueing: multiple `workflow_run` events can pile up; consider a dispatch queue table to rate-limit Claude calls and stay within Anthropic API rate limits |
| 50+ repos | Dedicated webhook bridge service (not serverless), persistent job queue (Redis/pg), separate metrics store |

### Scaling Priorities

1. **First bottleneck:** Anthropic API rate limits. At 14 repos with bursts of CI failures, concurrent Claude runs could hit rate limits. Mitigation: add a concurrency group to the central workflow (`concurrency: auto-fix-${{ inputs.repo }}-${{ inputs.branch }}`) to serialize per-repo.

2. **Second bottleneck:** GitHub Actions minutes. Each Claude fix run takes 5-15 minutes. At 14 repos with daily failures, this stays well within free/team tier limits.

3. **Cost control:** Anthropic API is the primary cost driver (~$0.50-5.00 per run). The 2-retry max cap and scope restriction to source code only (no broad exploration) are the primary cost controls.

## Anti-Patterns

### Anti-Pattern 1: Agent Fixes CI Workflow Files

**What people do:** Allow Claude Code Action to modify `.github/workflows/` files when CI fails.

**Why it's wrong:** If CI fails because of a misconfiguration, the agent will patch the workflow — potentially disabling checks, relaxing coverage thresholds, or creating security holes. Workflow files are infrastructure, not application code.

**Do this instead:** Restrict the agent's `--disallowedTools` or explicitly instruct in the system prompt: "You are forbidden from modifying any files in .github/, .env, *.env, secrets, or CI configuration files." The project already lists this as out of scope.

### Anti-Pattern 2: Using GITHUB_TOKEN for Cross-Repo PR Creation

**What people do:** Pass `${{ secrets.GITHUB_TOKEN }}` to create PRs in caller repos from the central workflow.

**Why it's wrong:** `GITHUB_TOKEN` is scoped to the workflow's repo (the central repo), not the caller repo. PR creation will fail with a 403. Even if it somehow worked, PRs created by `GITHUB_TOKEN` do not trigger downstream workflows (CI won't run on the auto-fix PR).

**Do this instead:** Install a GitHub App across all 3 orgs and generate per-repo installation tokens at runtime using `actions/create-github-app-token@v2`. This is the official pattern for cross-repo automation.

### Anti-Pattern 3: Embedding Prompts Inside Workflow YAML

**What people do:** Write the full Claude prompt as a multi-line string inside the workflow YAML file.

**Why it's wrong:** Prompts need to evolve independently from workflow logic. Mixing them creates large, unreadable YAML, makes prompt iteration require workflow file changes (triggering re-review), and prevents reuse across multiple workflows.

**Do this instead:** Store prompts in `prompts/*.md` files. Pass them to the action via `--append-system-prompt "$(cat prompts/typescript-fix.md)"`. This separates concerns and allows A/B testing prompts without touching workflow files.

### Anti-Pattern 4: Infinite Fix Loops Without Retry Guard

**What people do:** Trigger auto-fix on every CI failure without tracking attempt counts. The agent creates a PR, human closes it without merging, CI fails again, agent creates another PR.

**Why it's wrong:** This produces unbounded API costs, clutters the PR list with duplicate auto-fix PRs, and creates a confusing developer experience.

**Do this instead:** Implement the retry guard pattern (Pattern 3 above). After 2 attempts, stop creating PRs and open a human-escalation issue instead. Label auto-fix PRs with `auto-fix-attempt-N` so the guard can count them even if the previous PR was closed.

### Anti-Pattern 5: Single Monolithic Workflow for All Error Types

**What people do:** Create one giant workflow that handles CI failures, Sentry errors, and Crashlytics crashes with long if/else chains.

**Why it's wrong:** Different error sources have different context shapes, different diagnostic approaches, and different prompt requirements. A monolithic workflow becomes unmaintainable and harder to test.

**Do this instead:** Separate reusable workflows per error type (`fix-ci-failure.yml`, `fix-sentry-error.yml`, `fix-crashlytics.yml`) sharing common helper steps via composite actions or a shared base prompt. Use the dispatcher workflow for routing.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Anthropic Claude API | `anthropics/claude-code-action@v1` in reusable workflow | `ANTHROPIC_API_KEY` stored as org secret on central repo; passed via `secrets: inherit` |
| GitHub (cross-org PRs) | GitHub App with per-repo installation tokens | App must be installed on all 3 orgs (liftitapp, fbetancourtc, LiftitFinOps) |
| Sentry | Sentry webhook → Bridge Function → `repository_dispatch` | Requires Sentry Team plan ($26/mo) for webhook integrations |
| Firebase Crashlytics | Crashlytics alert → Bridge Function → `repository_dispatch` | Crashlytics REST API or email-to-webhook forwarding as alternative |
| GitHub Actions (caller CI) | `workflow_run` trigger on `conclusion: failure` | Native, no extra service needed |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Caller repo ↔ Central repo | `uses:` reusable workflow call | Requires central repo to be public or enterprise-internal for cross-org |
| Central workflow ↔ Claude Action | `uses: anthropics/claude-code-action@v1` as a step | Action checks out the CALLER repo, not the central repo |
| Central workflow ↔ Caller repo (PR creation) | GitHub App token passed to `gh` CLI | Token is scoped to caller repo only |
| External monitor ↔ Central repo | HTTP POST → webhook bridge → `repository_dispatch` | Bridge validates source signature before forwarding |
| Fixer workflow ↔ Dispatcher | `repository_dispatch` event type routing | Dispatcher uses `event.client_payload.error_source` to select fixer |

## Build Order (Phase Dependencies)

The architecture has clear dependency layers. Build in this order:

```
Layer 1: Foundation (no dependencies)
├── Central repo structure + prompt library
├── GitHub App registration (all 3 orgs)
└── Anthropic API key configuration

Layer 2: Core Fix Engine (depends on Layer 1)
├── fix-ci-failure.yml reusable workflow
└── Claude Code Action integration + per-stack prompts

Layer 3: Caller Integration (depends on Layer 2)
├── Thin caller workflow template
└── Install on first 1-2 repos for validation

Layer 4: Retry & Promotion (depends on Layer 3, validated data)
├── Retry guard pattern
└── PR promotion workflow (develop → qa auto-PR)

Layer 5: External Error Sources (depends on Layer 4)
├── Webhook bridge function (Sentry)
├── dispatcher.yml routing workflow
└── fix-sentry-error.yml + fix-crashlytics.yml

Layer 6: Observability (depends on all layers)
├── Success rate tracking
└── Cost monitoring + escalation dashboard
```

**Key dependency rationale:**
- The GitHub App must exist before any cross-repo PR creation can work — this is not optional.
- Validate the core fix loop on one repo before extracting to reusable workflow pattern — avoids abstracting the wrong interface.
- PR promotion workflow depends on understanding what a "successful auto-fix PR merge" looks like from real data.
- External error source integration comes after CI failure is working because it shares the same fix engine — only the trigger and context extraction differ.

## Sources

- [GitHub Actions Reusable Workflows — Official Docs](https://docs.github.com/en/actions/concepts/workflows-and-actions/reusable-workflows) — HIGH confidence
- [Scaling GitHub Actions Reusability — GitHub Well-Architected](https://wellarchitected.github.com/library/collaboration/recommendations/scaling-actions-reusability/) — HIGH confidence
- [Claude Code GitHub Actions — Official Anthropic Docs](https://code.claude.com/docs/en/github-actions) — HIGH confidence
- [Self-Healing CI Pipeline Architecture — Semaphore](https://semaphore.io/blog/self-healing-ci) — MEDIUM confidence (production pattern, different platform)
- [How to Architect Self-Healing CI/CD for Agentic AI — Optimum Partners](https://optimumpartners.com/insight/how-to-architect-self-healing-ci/cd-for-agentic-ai/) — MEDIUM confidence
- [Cross-Repository Workflows in GitHub Actions — OneUptime](https://oneuptime.com/blog/post/2025-12-20-cross-repository-workflows-github-actions/view) — MEDIUM confidence
- [Repository Dispatch Pattern — Ananta Cloud](https://www.anantacloud.com/post/github-repository-dispatch-event-for-custom-triggers) — MEDIUM confidence
- [GitHub Actions Sharing from Private Repos — GitHub Changelog 2022](https://github.blog/changelog/2022-12-13-github-actions-sharing-actions-and-reusable-workflows-from-private-repositories-is-now-ga/) — HIGH confidence

---
*Architecture research for: Centralized self-healing CI/CD agent (GitHub Actions + Claude Code)*
*Researched: 2026-03-01*
