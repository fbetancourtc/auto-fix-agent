# Phase 2: Core Fix Loop - Research

**Researched:** 2026-03-02
**Domain:** GitHub Actions CI automation, Claude Code Action integration, git/PR management
**Confidence:** HIGH

## Summary

Phase 2 extends the existing `auto-fix.yml` reusable workflow (built in Phase 1) with three major capabilities: CI failure detection via thin caller workflows in each repo, a flakiness filter that re-runs failed jobs before invoking the agent, and a complete fix-loop pipeline where Claude Code Action creates branches, commits fixes, and opens PRs -- with retry guards and human escalation.

The architecture is straightforward: each pilot repo adds a ~12-line caller workflow triggered by `workflow_run` on its CI workflows. On failure, it calls the central `auto-fix.yml` reusable workflow which already handles token generation, checkout, circuit-breaking, log retrieval, sanitization, and prompt loading. Phase 2 adds new steps for flakiness re-run, retry guard checking, the agent's git/PR operations, diff validation, and human escalation.

The primary technical constraint is that `workflow_run` requires explicitly naming monitored workflows (no wildcard) -- each caller must list its CI workflow names. The agent gets git write and `gh` CLI access via `allowedTools` patterns like `Bash(git:*)` and `Bash(gh pr create:*)`. Post-run diff validation is a bash step that compares changed files against an allowed-directories list from `repo-stack-map.json`.

**Primary recommendation:** Extend the existing `auto-fix.yml` with new steps (flakiness filter, retry guard, diff validation, escalation) and add `allowed_dirs` to `repo-stack-map.json` per-stack with per-repo overrides. The caller workflow is a thin `workflow_run` trigger that forwards `github.event.workflow_run.id` and repository name to the central reusable workflow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Monitor ALL CI workflows on each repo (any `workflow_run` failure triggers the agent)
- Fire on ALL branches, not just default branch -- feature branch failures are also fixed
- Caller workflow stays under 15 lines (CIFD-04)
- Each failure triggers independently -- no batching/debouncing of concurrent failures
- Re-run the exact failed job once before invoking the agent
- Wait up to the job's own timeout-minutes setting -- no extra hard cap
- If the re-run passes, skip the agent and add a workflow annotation: "Flaky failure detected -- passed on re-run, agent skipped"
- Branch naming: `auto-fix/{run-id}` (e.g., `auto-fix/12345678`)
- Agent uses git directly (checkout -b, add, commit, push) -- added to allowedTools
- Commit messages follow conventional commits format (e.g., `fix(auth): resolve null pointer in login handler`)
- Agent creates PR itself via `gh pr create` (already in allowedTools)
- PR always targets the `develop` branch (develop->QA->main promotion is Phase 4)
- Apply `auto-fix` label only -- existing CODEOWNERS/branch protection handles reviewer assignment
- Structured PR description with sections: Root Cause Analysis, Changes Made, Verification Results
- Agent also gets `gh pr list` access for retry guard checks
- Agent checks retry count itself (needs `gh pr list` in allowedTools)
- Count existing open/closed PRs with `auto-fix` label on the same base branch + failure context
- Max 2 fix attempts per failure
- After 2 failed attempts, create a GitHub Issue on the failing repo (not central repo)
- Issue labeled `needs-human`
- Issue body includes: failure summary, links to both attempt PRs, link to original CI run, AND full sanitized CI logs inline
- Allowed source directories centrally configured in repo-stack-map.json (same list used for both prompt constraints and post-run validation -- DRY)
- Post-run diff validation checks all changed files against allowed directories
- If agent modifies a forbidden file: revert those files (git checkout), then create PR with only allowed changes
- If the agent's fix doesn't actually resolve the CI failure (tests still fail): abort -- no PR created, but counts as one attempt toward the 2-attempt limit
- Primary pilot: `Liftitapp/liftit-control-de-asistencia` (Kotlin, cross-org)
- Test across all platform apps
- Note: repo is Kotlin (not TypeScript), but the fix loop is stack-agnostic

### Claude's Discretion
- Diff validation implementation approach (central script vs inline -- follow existing pattern)
- Allowed directory config structure (stack-level defaults vs per-repo overrides -- must scale to 14 repos)
- Exact flakiness re-run polling mechanism
- PR description template formatting details
- How the retry guard correlates failures across runs (SHA-based vs branch-based matching)

### Deferred Ideas (OUT OF SCOPE)
- develop->QA->main promotion pipeline -- Phase 4 (PROM-01, PROM-02)
- Batching/debouncing concurrent failures -- revisit if duplicate PRs become a problem
- Central tracking dashboard for escalated issues -- Phase 4 observability
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CIFD-01 | `workflow_run` trigger fires automatically when any monitored CI workflow completes with failure | Caller workflow uses `workflow_run` event with `types: [completed]` + `if: github.event.workflow_run.conclusion == 'failure'`; must explicitly list CI workflow names per repo (no wildcard) |
| CIFD-02 | CI failure logs retrieved via `gh run view --log-failed` and injected into agent context (last 500 lines) | Already implemented in Phase 1 `auto-fix.yml` step 5; `sanitize-logs.sh` truncates to 500 lines and strips injection patterns |
| CIFD-03 | Flakiness filter re-runs failed CI once before invoking agent to avoid fixing transient failures | Use `gh run rerun {run_id} --failed` to re-run only failed jobs; poll with `gh run watch {run_id} --exit-status` (3s interval); skip agent if re-run passes |
| CIFD-04 | Thin caller workflow (max 15 lines) that each repo adds to opt in | ~12-line workflow: `workflow_run` trigger + `if` condition + single `uses:` call to central reusable workflow with 3 inputs and 2 secrets |
| FIXG-01 | Claude Code Action analyzes failure logs, searches codebase, and implements fix | Already configured in Phase 1 step 7; Phase 2 adds git write tools to `allowedTools` for branch creation and committing |
| FIXG-02 | Agent scope restricted to source code only -- cannot modify `.github/`, `.env`, CI config, Dockerfiles, or infrastructure | Enforced at two layers: (1) prompt constraints in stack-specific prompts, (2) post-run diff validation script checking against `allowed_dirs` from `repo-stack-map.json` |
| FIXG-03 | Post-run file diff validation fails the workflow if any file outside source directories was modified | New bash step after Claude Code Action: `git diff --name-only` compared against `allowed_dirs`; reverts forbidden files with `git checkout` before PR creation |
| FIXG-04 | TypeScript stack-specific fix prompt with Next.js, vitest, ESLint context | Already implemented in Phase 1 `prompts/typescript.md` with constraints and common patterns |
| PRMG-01 | Auto-created fix PR on the failing repo with `auto-fix` label | Agent uses `gh pr create --base develop --label auto-fix` via `allowedTools` Bash pattern |
| PRMG-02 | PR description includes root cause analysis, what changed, and how it was tested | PR description template injected via prompt: sections for Root Cause Analysis, Changes Made, Verification Results |
| PRMG-03 | Retry guard limits to max 2 fix attempts per failure using PR label counter | Agent runs `gh pr list --label auto-fix --state all --json headRefName` and counts PRs matching the failure context before creating a new attempt |
| PRMG-04 | On retry exhaustion, create GitHub Issue labeled `needs-human` with failure context and links to both attempt PRs | Agent (or workflow step) runs `gh issue create --label needs-human --title "..." --body "..."` with sanitized logs and PR links |
| PRMG-05 | Human review gate -- no auto-merge of fix PRs (enforced by architecture, not code) | No `gh pr merge` in `allowedTools`; branch protection rules on `develop` require approvals; enforced by omission |
</phase_requirements>

## Standard Stack

### Core

| Component | Version/Ref | Purpose | Why Standard |
|-----------|-------------|---------|--------------|
| GitHub Actions `workflow_run` event | GA | Trigger on CI failure completion | Official GitHub event for workflow chaining; provides `conclusion`, `id`, `head_branch`, `head_sha` in payload |
| GitHub Actions `workflow_call` | GA | Reusable workflow pattern | Already used by Phase 1 `auto-fix.yml`; enables thin callers |
| `anthropics/claude-code-action@v1` | v1 (GA) | AI fix generation | Already configured in Phase 1; supports `prompt`, `claude_args`, `allowedTools` |
| `actions/create-github-app-token@v2` | v2 | Cross-org token generation | Already used in Phase 1 for Liftitapp/fbetancourtc/LiftitFinOps access |
| `actions/github-script@v7` | v7 | Inline JS for complex logic | Already used in Phase 1 circuit-breaker; use for flakiness polling and retry guard |
| GitHub CLI (`gh`) | Pre-installed on runners | PR creation, issue creation, run operations | Standard on `ubuntu-latest`; no installation needed |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `gh run rerun {id} --failed` | Re-run only failed jobs for flakiness filter | Step before agent invocation |
| `gh run watch {id} --exit-status` | Poll re-run completion and detect pass/fail | After triggering re-run, wait for result |
| `gh pr create` | Agent creates fix PR | Via allowedTools in Claude Code Action |
| `gh pr list --label --state --json` | Retry guard counts previous attempts | Via allowedTools in Claude Code Action |
| `gh issue create --label` | Human escalation after 2 failures | Via allowedTools or workflow step |
| `jq` | JSON parsing for config and API responses | Pre-installed on `ubuntu-latest` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `gh run rerun --failed` + `gh run watch` for flakiness | REST API `POST /actions/runs/{id}/rerun-failed-jobs` + polling loop | REST API is more programmatic but `gh` CLI is simpler; `gh run watch` handles polling natively |
| Agent creating PR via `gh pr create` | Workflow step creating PR after agent runs | User decided agent creates PR itself; more natural agent workflow |
| `gh issue create` for escalation | `actions/github-script` to create issue via API | `gh` is simpler; `github-script` gives more control over error handling |
| Branch-based retry correlation | SHA-based retry correlation | Branch + label is simpler; SHA may not match across re-runs if new commits land |

## Architecture Patterns

### Recommended Project Structure

```
.github/workflows/
  auto-fix.yml              # Central reusable workflow (extended in Phase 2)

config/
  repo-stack-map.json       # Extended with allowed_dirs per stack/repo

scripts/
  sanitize-logs.sh          # Existing (Phase 1)
  validate-diff.sh          # NEW: Post-run diff validation

prompts/
  typescript.md             # Existing (Phase 1) -- no changes needed
  kotlin.md                 # Existing (Phase 1) -- no changes needed
  python.md                 # Existing (Phase 1) -- no changes needed

# Per-repo (in each pilot repo):
.github/workflows/
  auto-fix-caller.yml       # Thin caller (~12 lines)
```

### Pattern 1: Thin Caller Workflow

**What:** Each repo adds a ~12-line workflow that triggers on its CI workflow failures and calls the central reusable workflow.

**When to use:** Every pilot repo needs this to opt in.

**Critical constraint:** `workflow_run.workflows` requires explicit workflow names -- no wildcard. Each caller must list the CI workflow names for that specific repo.

**Example:**
```yaml
# Source: GitHub Actions docs - workflow_run event + workflow_call pattern
name: Auto Fix
on:
  workflow_run:
    workflows: [CI, Build, Test]  # Must list each CI workflow by name
    types: [completed]
jobs:
  fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main
    with:
      app_id: "12345"
      failed_run_id: "${{ github.event.workflow_run.id }}"
      repository: "${{ github.repository }}"
    secrets:
      anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}"
      app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}"
```

**Notes:**
- `workflow_run` fires on ALL branches by default (user decision: fire on all branches)
- The `if` condition filters to failures only
- `github.event.workflow_run.id` provides the failed run ID
- `github.repository` provides `owner/repo` format
- The caller is ~12 lines, well under the 15-line limit (CIFD-04)
- Workflow file must exist on the repo's default branch to trigger

### Pattern 2: Flakiness Filter (Re-run + Poll)

**What:** Before invoking the agent, re-run the failed jobs once. If they pass, skip the agent.

**When to use:** Always, as a step before the Claude Code Action.

**Implementation approach (recommended -- `actions/github-script`):**

```javascript
// Source: GitHub REST API docs + gh CLI docs
// Step in auto-fix.yml using actions/github-script@v7
const repo = '${{ inputs.repository }}'.split('/');
const owner = repo[0];
const repoName = repo[1];
const runId = parseInt('${{ inputs.failed_run_id }}');

// Trigger re-run of failed jobs
await github.rest.actions.reRunWorkflowFailedJobs({
  owner,
  repo: repoName,
  run_id: runId
});

// Poll until the re-run completes
let conclusion = null;
const maxWait = 30 * 60 * 1000; // 30 min safety cap
const start = Date.now();
while (!conclusion && (Date.now() - start) < maxWait) {
  await new Promise(r => setTimeout(r, 15000)); // 15s interval
  const run = await github.rest.actions.getWorkflowRun({
    owner,
    repo: repoName,
    run_id: runId
  });
  if (run.data.status === 'completed') {
    conclusion = run.data.conclusion;
  }
}

if (conclusion === 'success') {
  core.notice('Flaky failure detected -- passed on re-run, agent skipped');
  core.setOutput('is_flaky', 'true');
} else {
  core.setOutput('is_flaky', 'false');
}
```

**Why `actions/github-script` over `gh` CLI:** The `gh run rerun` command does not return the new run ID. The REST API `reRunWorkflowFailedJobs` re-runs the same run ID (GitHub mutates the existing run). Polling `getWorkflowRun` on the same `run_id` detects when it completes with the new conclusion. This is simpler and more reliable than trying to find a new run ID.

**Key insight:** When GitHub re-runs failed jobs, it mutates the existing workflow run (same `run_id`). The `status` resets to `in_progress` and eventually becomes `completed` again with a new `conclusion`. This means we can poll the same run ID.

### Pattern 3: Retry Guard via PR Label Counting

**What:** Before creating a fix, count existing `auto-fix`-labeled PRs targeting the same branch for the same failure.

**When to use:** Agent checks this before attempting a fix.

**Correlation approach (recommended -- branch-based):**

The agent runs:
```bash
gh pr list --repo "$REPO" --label auto-fix --state all \
  --base develop --json number,headRefName,state \
  --jq '[.[] | select(.headRefName | startswith("auto-fix/"))] | length'
```

If count >= 2, the agent should create an escalation issue instead of attempting a fix.

**Why branch-based over SHA-based:** Simpler, more reliable. The `auto-fix/{run-id}` branch naming uniquely identifies each attempt. Counting `auto-fix`-labeled PRs targeting `develop` from the same triggering branch gives the attempt count.

**More precise correlation:** To avoid counting unrelated auto-fix PRs from other failures, the agent can check if the existing PRs reference the same CI failure context (original head branch, error signature). However, for v1, simple label+base counting is sufficient since each failure creates a unique `auto-fix/{run-id}` branch.

### Pattern 4: Post-Run Diff Validation

**What:** After the agent runs, check that only files in allowed directories were modified.

**When to use:** Always, as a step after Claude Code Action and before PR creation.

**Recommendation:** Central script (`scripts/validate-diff.sh`) -- follows the established pattern of `scripts/sanitize-logs.sh`.

```bash
#!/usr/bin/env bash
set -euo pipefail
# validate-diff.sh <repo> <config-path>
# Checks git diff against allowed_dirs from repo-stack-map.json
# Reverts any forbidden file changes

REPO="${1:?Usage: validate-diff.sh <repo> <config-path>}"
CONFIG="${2:?Usage: validate-diff.sh <repo> <config-path>}"

# Get allowed directories for this repo (or stack default)
ALLOWED=$(jq -r --arg repo "$REPO" '
  .[$repo].allowed_dirs // .[$repo] as $stack |
  if ($stack | type) == "string" then
    .defaults[$stack].allowed_dirs
  else
    $stack.allowed_dirs
  end | .[]
' "$CONFIG")

VIOLATIONS=()
for file in $(git diff --name-only HEAD); do
  MATCH=false
  for dir in $ALLOWED; do
    if [[ "$file" == "$dir"* ]]; then
      MATCH=true
      break
    fi
  done
  if [ "$MATCH" = false ]; then
    VIOLATIONS+=("$file")
    git checkout HEAD -- "$file"  # Revert forbidden file
  fi
done

if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  echo "::warning::Reverted ${#VIOLATIONS[@]} forbidden file(s): ${VIOLATIONS[*]}"
fi
```

### Pattern 5: Allowed Directories Config (repo-stack-map.json extension)

**What:** Extend `repo-stack-map.json` with `allowed_dirs` per stack, with per-repo overrides.

**Recommended structure:**

```json
{
  "defaults": {
    "typescript": {
      "allowed_dirs": ["src/", "app/", "components/", "lib/", "utils/", "hooks/", "types/", "tests/", "__tests__/"]
    },
    "kotlin": {
      "allowed_dirs": ["app/src/"]
    },
    "python": {
      "allowed_dirs": ["src/", "app/", "lib/", "tests/"]
    }
  },
  "repos": {
    "Liftitapp/liftit-control-de-asistencia": {
      "stack": "kotlin",
      "allowed_dirs": ["app/src/", "dashboard/src/", "backend/src/"]
    },
    "Liftitapp/averias-marketplace": {
      "stack": "typescript"
    },
    "fbetancourtc/laundry-operating-dash": {
      "stack": "typescript"
    }
  }
}
```

**Design rationale:** Stack-level defaults cover the 80% case. Per-repo `allowed_dirs` overrides handle monorepos (like `liftit-control-de-asistencia` which has Kotlin + Python + TypeScript). When a repo has no `allowed_dirs` override, the stack default is used. This scales to 14+ repos without duplication.

**Migration note:** The current `repo-stack-map.json` maps `"repo": "stack"` directly. This restructure changes the schema. The prompt-loading step in `auto-fix.yml` (step 6) needs updating to read from `repos[repo].stack` instead of `.[repo]`.

### Pattern 6: Agent allowedTools for Phase 2

**What:** Extended `allowedTools` list for Claude Code Action to enable git operations and PR/issue management.

```yaml
claude_args: |
  --max-turns 10
  --allowedTools Edit,Read,Write,Bash(npm test),Bash(npm run test),Bash(npx vitest run),Bash(npx vitest),Bash(npm install),Bash(pip install -r requirements.txt),Bash(pytest),Bash(python -m pytest),Bash(./gradlew test),Bash(./gradlew ktlintCheck),Bash(npx eslint),Bash(npx tsc --noEmit),Bash(ruff check),Bash(mypy),Bash(git checkout -b:*),Bash(git add:*),Bash(git status),Bash(git diff:*),Bash(git commit:*),Bash(git push:*),Bash(gh pr create:*),Bash(gh pr list:*),Bash(gh issue create:*)
```

**Source:** Claude Code Action docs (configuration.md) + community patterns confirm `Bash(git:*)` and `Bash(gh:*)` patterns work for allowlisting.

### Anti-Patterns to Avoid

- **Wildcard workflow_run trigger:** `workflow_run` does NOT support `workflows: ["*"]`. Each caller must explicitly list monitored workflow names. Attempting a wildcard will silently fail.
- **Polling with `gh run watch` in GitHub Script:** `gh run watch` requires `checks:read` permission which fine-grained PATs cannot provide. Use the REST API polling approach via `actions/github-script` instead.
- **Creating new run ID after re-run:** `gh run rerun` does NOT create a new run ID. GitHub mutates the existing run. Poll the same run_id for the new conclusion.
- **Agent creating branch before checkout:** The agent must first check out the failing branch, THEN create the fix branch from it. The workflow step must checkout the correct `head_branch` from the failed run.
- **Auto-merging fix PRs:** Explicitly excluded (PRMG-05). Never add `gh pr merge` to allowedTools.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Re-running failed jobs | Custom API calls to re-trigger individual jobs | `github.rest.actions.reRunWorkflowFailedJobs()` | Handles job dependencies correctly, maintains run context |
| Polling run completion | Sleep loop with `gh run view` | `actions/github-script` polling with `getWorkflowRun` | Proper error handling, timeout control, cleaner than bash polling |
| Cross-org token generation | Manual PAT management | `actions/create-github-app-token@v2` | Already used in Phase 1; handles org-scoped installation tokens |
| PR description formatting | String concatenation in bash | Multiline heredoc in prompt instructions | Agent generates the structured description naturally from its analysis |
| Workflow annotation | Custom step summary | `core.notice()` in `actions/github-script` | Standard GitHub Actions annotation mechanism; appears in workflow UI |

**Key insight:** The existing Phase 1 infrastructure handles the hard parts (token generation, circuit-breaking, log sanitization, prompt loading). Phase 2 adds steps around and after the Claude Code Action invocation -- not a rebuild.

## Common Pitfalls

### Pitfall 1: workflow_run Only Fires From Default Branch

**What goes wrong:** The caller workflow file must exist on the repo's default branch (usually `main` or `develop`) for `workflow_run` to trigger. Creating the caller on a feature branch won't work.

**Why it happens:** GitHub limitation -- `workflow_run` event processing only reads workflow files from the default branch.

**How to avoid:** First PR that adds the caller workflow must be merged to the default branch before it becomes active. Document this in onboarding instructions.

**Warning signs:** Workflow never triggers despite CI failures occurring.

### Pitfall 2: Re-Run Mutates Existing Run (Same run_id)

**What goes wrong:** Expecting `gh run rerun` to create a new run with a new ID, then trying to find/poll that new ID.

**Why it happens:** GitHub's re-run mechanism mutates the existing workflow run rather than creating a new one. The `status` resets and a new `conclusion` is set on completion.

**How to avoid:** Poll the same `run_id` that was re-run. Check `status` field transitions from `in_progress` back to `completed`.

**Warning signs:** Code tries to look up a "new" run ID after re-run and finds nothing.

### Pitfall 3: workflow_run Requires Exact Workflow Names

**What goes wrong:** Using approximate or incorrect workflow names in the `workflows:` array. The trigger silently fails.

**Why it happens:** `workflow_run` matches on the `name:` field of the target workflow YAML, not the filename. Name mismatch = silent no-trigger.

**How to avoid:** Check each repo's CI workflow files for their exact `name:` value. Document the required names in onboarding.

**Warning signs:** Caller workflow never fires. No error in logs.

### Pitfall 4: Checkout Branch Mismatch

**What goes wrong:** The agent tries to fix code but the repo is checked out on the default branch, not the branch where CI failed.

**Why it happens:** `actions/checkout@v4` defaults to the ref that triggered the workflow. In `workflow_run` context, `GITHUB_REF` is the default branch, NOT the failed run's branch.

**How to avoid:** Explicitly set `ref: ${{ github.event.workflow_run.head_branch }}` in the checkout step, OR have the agent read the head_branch from inputs and checkout accordingly.

**Warning signs:** Agent fixes code on wrong branch; PR diff looks unrelated to the failure.

### Pitfall 5: Race Condition with Concurrent Failures

**What goes wrong:** Two CI failures fire simultaneously. Both agents try to create `auto-fix/{run-id}` branches and PRs. Since run IDs differ, branches don't collide, but both target `develop`.

**Why it happens:** User decision is "each failure triggers independently" with no debouncing.

**How to avoid:** This is acceptable by design. Each produces a separate PR. The retry guard counts all `auto-fix` PRs, so the 2-attempt limit still applies globally per branch. Document that multiple concurrent fix PRs are expected behavior.

**Warning signs:** Multiple auto-fix PRs open simultaneously. This is not a bug.

### Pitfall 6: gh CLI Authentication in Workflow

**What goes wrong:** `gh` commands fail with authentication errors because the app token isn't set in the agent's environment.

**Why it happens:** Claude Code Action step intentionally has NO env block with tokens (SECR-04). But the agent needs `gh` access for PR/issue operations.

**How to avoid:** Two options: (1) Set `GH_TOKEN` only for the agent's Bash commands via the allowedTools mechanism, or (2) Configure git credentials globally in a prior step so `gh` inherits them. Option 2 is safer -- set `GH_TOKEN` in the environment of the workflow step that runs Claude Code Action, since the action itself manages tool access.

**Warning signs:** `gh pr create` fails with "authentication required" inside the agent.

**Resolution:** The `anthropics/claude-code-action@v1` action inherits the job's environment. The `GITHUB_TOKEN` or app token can be set in the action's `env:` block specifically for `gh` operations. This does NOT violate SECR-04 as long as the token is scoped to `contents:write` + `pull-requests:write` (already configured in job permissions). The concern is about DEPLOYMENT tokens and PRODUCTION secrets, not the repo-scoped app token needed for PR creation.

### Pitfall 7: Diff Validation Timing

**What goes wrong:** Running diff validation AFTER the agent creates the PR. Forbidden files are already pushed.

**Why it happens:** If the agent does `git push` and `gh pr create` in one sequence, the diff validation step runs too late.

**How to avoid:** Structure the workflow so diff validation runs AFTER the agent modifies files but BEFORE the agent pushes/creates PR. This means: (1) Agent fixes code and commits locally, (2) Workflow runs diff validation, (3) If clean, workflow pushes and creates PR. OR: Let the agent push, then a post-step reverts and force-pushes if needed.

**Recommended approach:** Let the agent do everything (fix, commit, push, PR create) since it needs to verify its own fix works. Then add a post-validation step that checks and comments on the PR if violations were found. Since the user decided "revert forbidden files, then create PR with only allowed changes," the validation should happen BEFORE the PR is created. This means the agent should be instructed (via prompt) to commit but NOT push, and a workflow step handles push + PR creation after validation.

**Alternative (simpler):** Let the agent push + create PR, then a validation step checks. If violations found, revert files, amend commit, force-push. The PR auto-updates. This is simpler but requires force-push permission.

## Code Examples

### Caller Workflow (per-repo)

```yaml
# Source: GitHub Actions docs - workflow_run + workflow_call
# File: .github/workflows/auto-fix-caller.yml (in each pilot repo)
name: Auto Fix
on:
  workflow_run:
    workflows: [CI]  # Replace with actual CI workflow name(s)
    types: [completed]
jobs:
  fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main
    with:
      app_id: "12345"
      failed_run_id: "${{ github.event.workflow_run.id }}"
      repository: "${{ github.repository }}"
    secrets:
      anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}"
      app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}"
```

### Flakiness Filter Step (in auto-fix.yml)

```yaml
# Source: GitHub REST API docs + actions/github-script
- name: Flakiness filter
  id: flaky
  if: steps.circuit.outputs.should_proceed == 'true'
  uses: actions/github-script@v7
  with:
    github-token: ${{ steps.app-token.outputs.token }}
    script: |
      const [owner, repoName] = '${{ inputs.repository }}'.split('/');
      const runId = parseInt('${{ inputs.failed_run_id }}');

      // Re-run only failed jobs
      await github.rest.actions.reRunWorkflowFailedJobs({
        owner, repo: repoName, run_id: runId
      });
      core.info(`Re-running failed jobs for run ${runId}`);

      // Poll until completion (15s intervals, 30min max)
      const maxWait = 30 * 60 * 1000;
      const start = Date.now();
      let conclusion = null;
      while (!conclusion && (Date.now() - start) < maxWait) {
        await new Promise(r => setTimeout(r, 15000));
        const { data: run } = await github.rest.actions.getWorkflowRun({
          owner, repo: repoName, run_id: runId
        });
        if (run.status === 'completed') {
          conclusion = run.conclusion;
        }
      }

      if (conclusion === 'success') {
        core.notice('Flaky failure detected -- passed on re-run, agent skipped');
        core.setOutput('is_flaky', 'true');
      } else {
        core.info(`Re-run concluded: ${conclusion ?? 'timeout'}`);
        core.setOutput('is_flaky', 'false');
      }
```

### Retry Guard Check (agent prompt instruction)

```markdown
## Before Fixing

Before implementing any fix, check if this failure has already been attempted:

```bash
ATTEMPT_COUNT=$(gh pr list --repo "$REPO" --label auto-fix --state all \
  --json headRefName \
  --jq '[.[] | select(.headRefName | startswith("auto-fix/"))] | length')
```

If ATTEMPT_COUNT >= 2, do NOT attempt a fix. Instead, create an escalation issue:

```bash
gh issue create --repo "$REPO" --label needs-human \
  --title "CI fix failed after 2 attempts: [brief description]" \
  --body "..."
```
```

### Human Escalation Issue Body Template

```markdown
## Auto-Fix Escalation

**Status:** 2 fix attempts failed -- needs human review

### Failure Summary
[Brief description of the CI failure]

### Fix Attempts
- Attempt 1: PR #[number] ([link])
- Attempt 2: PR #[number] ([link])

### Original CI Run
[Link to the original failed CI run]

### CI Failure Logs
<details>
<summary>Full sanitized CI logs</summary>

```
[Sanitized CI logs]
```

</details>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `direct_prompt` input | `prompt` input | claude-code-action v1 (2025) | Old `direct_prompt` and `override_prompt` are deprecated; use `prompt` |
| `Bash(command)` individual allowlisting | `Bash(prefix:*)` wildcard patterns | claude-code ~2025 | Can use `Bash(git:*)` instead of listing each git subcommand |
| `workflow_dispatch` returns 204 No Content | `workflow_dispatch` returns run ID (with `return_run_details`) | Feb 2026 | New for workflow_dispatch only -- re-run endpoints still don't return new IDs |
| Manual PAT for cross-org | `actions/create-github-app-token@v2` | 2025 | GitHub App tokens are more secure and manageable |

**Deprecated/outdated:**
- `direct_prompt` in claude-code-action: replaced by `prompt` input in v1
- `override_prompt` in claude-code-action: replaced by `--system-prompt` in `claude_args`

## Open Questions

1. **Agent environment token access for gh CLI**
   - What we know: Claude Code Action step should NOT have deployment/production tokens. But `gh pr create` needs a repo-scoped token.
   - What's unclear: Whether the action automatically inherits `GITHUB_TOKEN` or the app token, or if we need to explicitly set it in the action step's `env:` block.
   - Recommendation: Test by adding `env: GH_TOKEN: ${{ steps.app-token.outputs.token }}` to the Claude Code Action step. This is repo-scoped (not production), so it satisfies SECR-04.

2. **Checkout branch for workflow_run context**
   - What we know: `GITHUB_REF` in `workflow_run` context points to the DEFAULT branch, not the failed run's branch.
   - What's unclear: Whether we need to modify the existing checkout step in `auto-fix.yml` to use `github.event.workflow_run.head_branch`, or pass it as a new input.
   - Recommendation: Add a `head_branch` input to the reusable workflow, populated from `github.event.workflow_run.head_branch` by the caller. The checkout step then uses this ref.

3. **Diff validation: before or after PR creation**
   - What we know: User wants forbidden files reverted, then PR created with only allowed changes.
   - What's unclear: How to split agent actions (fix+commit) from push+PR without breaking the agent's self-verification loop.
   - Recommendation: Instruct the agent via prompt to fix, verify, commit, and push -- but NOT create the PR itself. A subsequent workflow step runs diff validation, reverts if needed, then creates the PR. This keeps the agent focused on fixing and the workflow responsible for compliance.
   - **Alternative:** Let the agent do everything, add a post-step that force-pushes corrections if needed. Simpler but requires force-push permission.

4. **repo-stack-map.json schema migration**
   - What we know: Current schema is `{"repo": "stack"}`. New schema needs `{defaults: {...}, repos: {...}}`.
   - What's unclear: Whether the schema change should be backward-compatible or a clean break.
   - Recommendation: Clean break since only auto-fix.yml references this file. Update the prompt-loading step (step 6) simultaneously.

## Sources

### Primary (HIGH confidence)
- Context7 `/anthropics/claude-code-action` -- allowedTools configuration, Bash command patterns, prompt input
- Context7 `/websites/github_en_actions` -- workflow_run event, conditional job execution, re-run failed jobs
- [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows) -- workflow_run constraints, chaining limits
- [GitHub CLI: gh run rerun](https://cli.github.com/manual/gh_run_rerun) -- command options, --failed flag
- [GitHub CLI: gh run watch](https://cli.github.com/manual/gh_run_watch) -- --exit-status flag, polling interval
- [GitHub CLI: gh pr list](https://cli.github.com/manual/gh_pr_list) -- label filter, JSON output, jq integration
- [GitHub CLI: gh issue create](https://cli.github.com/manual/gh_issue_create) -- label, body, title flags
- [GitHub REST API: Workflow Runs](https://docs.github.com/en/rest/actions/workflow-runs) -- rerun-failed-jobs endpoint, response schema
- [GitHub Changelog: Workflow dispatch returns run IDs](https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids/) -- Feb 2026 update

### Secondary (MEDIUM confidence)
- [Claude Code Action usage.md](https://github.com/anthropics/claude-code-action/blob/main/docs/usage.md) -- direct prompt usage patterns
- [Claude Code Action configuration.md](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md) -- tool allowlisting details
- [Claude Code Action custom-automations.md](https://github.com/anthropics/claude-code-action/blob/main/docs/custom-automations.md) -- non-PR automation patterns
- [GitHub Community Discussion #25287](https://github.com/orgs/community/discussions/25287) -- workflow_run context documentation
- [GitHub CLI Issue #9221](https://github.com/cli/cli/issues/9221) -- gh run rerun behavior when workflow not finished

### Tertiary (LOW confidence)
- Re-run mutating existing run ID (inferred from multiple community sources + API behavior, not explicitly documented by GitHub): Needs validation during implementation
- `Bash(git:*)` wildcard pattern support in allowedTools (confirmed by community examples but not in official claude-code-action docs): Test during Phase 2 implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All components already in use from Phase 1 or are standard GitHub Actions/CLI features
- Architecture: HIGH -- Patterns derived from official documentation with verified API behavior
- Pitfalls: HIGH -- Multiple sources confirm each pitfall, and Phase 1 experience validates workflow_run/checkout behavior
- Flakiness filter polling: MEDIUM -- Re-run mutation behavior inferred from community sources, needs testing
- allowedTools wildcard patterns: MEDIUM -- Community-confirmed but test during implementation

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days -- stable domain, GitHub Actions and Claude Code Action are GA)
