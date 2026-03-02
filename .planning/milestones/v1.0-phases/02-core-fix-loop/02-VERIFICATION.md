---
phase: 02-core-fix-loop
verified: 2026-03-02T11:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 2: Core Fix Loop Verification Report

**Phase Goal:** When CI fails on a single TypeScript repo, the agent automatically retrieves logs, diagnoses the failure, implements a source-code-only fix, and opens a labeled PR with retry guard and human escalation.
**Verified:** 2026-03-02
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | workflow_run trigger fires on CI failure; caller passes head_branch of the failing branch | VERIFIED | `auto-fix-caller.example.yml` uses `workflow_run` + `github.event.workflow_run.head_branch`; `auto-fix.yml` step 3 uses `ref: ${{ inputs.head_branch }}` |
| 2 | Flakiness filter re-runs failed jobs once and skips agent if re-run passes, with annotation | VERIFIED | Step 5 in `auto-fix.yml`: `reRunWorkflowFailedJobs`, polling loop, `core.notice()` on success, `is_flaky` output gates all downstream steps (7 references) |
| 3 | CI failure logs are retrieved and sanitized before agent runs | VERIFIED | Step 6: `gh run view "$RUN_ID" --log-failed` piped through `sanitize-logs.sh`; gated by flakiness check |
| 4 | Agent has git write access and gh CLI access for branch/PR/issue operations | VERIFIED | Step 8 allowedTools includes: `git checkout -b:*`, `git add:*`, `git commit:*`, `git push:*`, `gh pr create:*`, `gh pr list:*`, `gh issue create:*`; `GH_TOKEN` env var set |
| 5 | Agent scope restricted to source directories; forbidden files reverted post-run | VERIFIED | `validate-diff.sh` (80 lines) checks changed files against `allowed_dirs` from `repo-stack-map.json`, reverts violations with `git checkout HEAD --`; step 9 in workflow calls it and force-pushes corrections |
| 6 | Agent creates a PR with structured description (Root Cause Analysis, Changes Made, Verification Results) targeting develop with auto-fix label | VERIFIED | All three prompts contain `gh pr create --base develop --label "auto-fix"` with PR body template containing all three required sections |
| 7 | Retry guard limits to 2 fix attempts per failure | VERIFIED | All three prompts contain `ATTEMPT_COUNT=$(gh pr list ...)` check: if `>= 2`, skip to escalation |
| 8 | After 2 failed attempts, agent creates a needs-human escalation issue with prior PRs and CI logs | VERIFIED | All three prompts contain `gh issue create --label "needs-human"` with `$PREV_PRS` links and `$CI_LOGS` embedded in issue body |
| 9 | No auto-merge — human review gate enforced architecturally | VERIFIED | `gh pr merge` absent from `allowedTools` in `auto-fix.yml` (grep confirms 0 matches); absent from all prompts |
| 10 | Failed no-commit attempts are counted by retry guard via closed tracking PR | VERIFIED | Step 10 in `auto-fix.yml`: creates empty-commit branch + PR with `auto-fix` label, immediately closes it; retry guard counts all-state PRs |
| 11 | Caller workflow is under 15 YAML lines and demonstrates complete workflow_run pattern | VERIFIED | 15 YAML lines (excluding comments/blanks); passes YAML validation; includes all 4 inputs and secrets in flow style |
| 12 | repo-stack-map.json uses new defaults/{stack}/allowed_dirs + repos/{repo}/stack schema | VERIFIED | 15 repos, 3 stacks (typescript, python, kotlin), defaults block present; liftit-control-de-asistencia has per-repo override |
| 13 | Workflow passes RUN_ID, HEAD_BRANCH, TARGET_REPO env vars to agent for branch naming and retry correlation | VERIFIED | Step 8 env block: `RUN_ID: ${{ inputs.failed_run_id }}`, `HEAD_BRANCH: ${{ inputs.head_branch }}`, `TARGET_REPO: ${{ inputs.repository }}` |
| 14 | Prompt-loading step reads from new config schema (repos[repo].stack) | VERIFIED | Step 7: `jq -r --arg repo "$TARGET_REPO" '.repos[$repo].stack // "typescript"'` |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/auto-fix.yml` | 10-step reusable workflow with flakiness filter, agent git/gh tools, diff validation, and no-commit tracking | VERIFIED | 327 lines; valid YAML; all 10 steps present with correct step ordering and gating conditions |
| `.github/workflows/auto-fix-caller.example.yml` | Thin caller <= 15 YAML lines with workflow_run trigger | VERIFIED | 15 YAML lines exactly (flow-style secrets); passes YAML validation; all 4 inputs wired |
| `config/repo-stack-map.json` | New schema: defaults.{stack}.allowed_dirs + repos.{repo}.stack | VERIFIED | 15 repos across 3 stacks; defaults block with allowed_dirs arrays; per-repo override on kotlin monorepo |
| `scripts/validate-diff.sh` | Post-agent diff validation script checking git diff against allowed_dirs | VERIFIED | 80 lines; executable; reads allowed_dirs from config with stack fallback; reverts violations; `::warning::` annotations |
| `prompts/typescript.md` | Complete prompt with retry guard, git/PR workflow, escalation (>= 80 lines) | VERIFIED | 186 lines; all required sections present |
| `prompts/python.md` | Complete prompt with retry guard, git/PR workflow, escalation (>= 50 lines) | VERIFIED | 166 lines; all required sections present |
| `prompts/kotlin.md` | Complete prompt with retry guard, git/PR workflow, escalation (>= 50 lines) | VERIFIED | 166 lines; all required sections present |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `auto-fix-caller.example.yml` | `auto-fix.yml` | `uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main` with head_branch input | VERIFIED | Pattern found; all 4 inputs passed including head_branch |
| `auto-fix.yml` step 5 | `actions/github-script@v7` | `reRunWorkflowFailedJobs` REST API + poll loop | VERIFIED | `reRunWorkflowFailedJobs` call present; polling loop to `getWorkflowRun` until completion |
| `auto-fix.yml` step 3 | `actions/checkout@v4` | `ref: ${{ inputs.head_branch }}` | VERIFIED | Checkout of failing repo uses head_branch input |
| `auto-fix.yml` step 9 | `scripts/validate-diff.sh` | Post-agent step calls script with repo and config path | VERIFIED | `bash _auto-fix-scripts/scripts/validate-diff.sh "$TARGET_REPO" _auto-fix-scripts/config/repo-stack-map.json` |
| `auto-fix.yml` step 7 | `config/repo-stack-map.json` | jq reads `.repos[$repo].stack` from new schema | VERIFIED | `jq -r --arg repo "$TARGET_REPO" '.repos[$repo].stack // "typescript"'` |
| `scripts/validate-diff.sh` | `config/repo-stack-map.json` | Reads `allowed_dirs` with stack default fallback | VERIFIED | `.repos[$repo].allowed_dirs` with fallback to `.defaults[$stack].allowed_dirs[]` |
| `prompts/typescript.md` | `gh pr list` | Retry guard counts auto-fix PRs before fixing | VERIFIED | `ATTEMPT_COUNT=$(gh pr list --repo "$TARGET_REPO" --label auto-fix --state all ...)` |
| `prompts/typescript.md` | `gh pr create` | Agent creates PR with structured description | VERIFIED | Full `gh pr create` command with `--base develop --label "auto-fix"` and PR body template |
| `prompts/typescript.md` | `gh issue create` | Escalation creates needs-human issue after 2 failures | VERIFIED | `gh issue create --label "needs-human"` with prior PR links and CI logs |
| `auto-fix.yml` step 8 | `prompts/*.md` | Workflow env vars (RUN_ID, HEAD_BRANCH, TARGET_REPO) available to agent | VERIFIED | All three env vars set in step 8 env block from inputs |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CIFD-01 | 02-01 | workflow_run trigger fires automatically when CI fails | SATISFIED | `auto-fix-caller.example.yml`: `workflow_run` with `types: [completed]` + `if: github.event.workflow_run.conclusion == 'failure'` |
| CIFD-02 | 02-02 | CI failure logs retrieved via gh run view --log-failed and injected into agent context (last 500 lines) | SATISFIED | Step 6: `gh run view "$RUN_ID" --repo "$REPO" --log-failed` piped through `sanitize-logs.sh` to `/tmp/ci-logs.txt`; prompt-loading step concatenates logs to agent prompt |
| CIFD-03 | 02-01 | Flakiness filter re-runs failed CI once before invoking agent | SATISFIED | Step 5: `reRunWorkflowFailedJobs` + polling loop; `is_flaky` output gates all downstream steps |
| CIFD-04 | 02-01 | Thin caller workflow (max 15 lines) for each repo to opt in | SATISFIED | `auto-fix-caller.example.yml`: exactly 15 YAML lines (flow-style secrets), complete workflow_run pattern |
| FIXG-01 | 02-02 | Claude Code Action analyzes failure logs, searches codebase, and implements fix | SATISFIED | Step 8: `anthropics/claude-code-action@v1` with prompt (logs + instructions), `--max-turns 10`, full tool set |
| FIXG-02 | 02-02 | Agent scope restricted to source code only | SATISFIED | `allowed_dirs` in `repo-stack-map.json`; `validate-diff.sh` enforces; prompts include NEVER modify constraints |
| FIXG-03 | 02-02 | Post-run file diff validation fails/reverts forbidden file modifications | SATISFIED | Step 9: runs `validate-diff.sh`; if violations, reverts and force-pushes; if all forbidden, closes PR |
| FIXG-04 | 02-02 | TypeScript stack-specific fix prompt with Next.js, vitest, ESLint context | SATISFIED | `prompts/typescript.md`: Framework (Next.js), Testing (Vitest), Linting (ESLint), Type checking (TypeScript strict) all present |
| PRMG-01 | 02-03 | Auto-created fix PR with auto-fix label | SATISFIED | Prompts instruct `gh pr create --label "auto-fix"`; step 10 creates tracking closed PR with same label |
| PRMG-02 | 02-03 | PR description includes root cause analysis, what changed, how it was tested | SATISFIED | All prompts contain PR body template with Root Cause Analysis, Changes Made, Verification Results sections |
| PRMG-03 | 02-03 | Retry guard limits to max 2 fix attempts per failure | SATISFIED | All prompts: `ATTEMPT_COUNT >= 2` → skip to escalation; step 10 ensures no-commit attempts are counted |
| PRMG-04 | 02-03 | On retry exhaustion, create GitHub Issue labeled needs-human with failure context and links to both attempt PRs | SATISFIED | All prompts: `gh issue create --label "needs-human"` with `$PREV_PRS` links and embedded `$CI_LOGS` |
| PRMG-05 | 02-03 | Human review gate — no auto-merge of fix PRs | SATISFIED | `gh pr merge` absent from `allowedTools` in `auto-fix.yml` (verified by grep); absent from all stack prompts |

**All 13 Phase 2 requirement IDs satisfied.**

No orphaned requirements detected for Phase 2 (REQUIREMENTS.md traceability table maps all 13 IDs to Phase 2 and marks them Complete).

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `prompts/kotlin.md` | 158 | `<!-- TODO: Expand with project-specific patterns in Phase 3 -->` | Info | Deferred to Phase 3; does not affect current functionality — common patterns section is present and functional |
| `prompts/python.md` | 158 | `<!-- TODO: Expand with project-specific patterns in Phase 3 -->` | Info | Same as above |

No blockers or warnings detected. The TODO comments in python.md and kotlin.md are documentation notes for Phase 3 expansion, not implementation stubs. Core functionality (retry guard, git workflow, escalation, PR creation) is fully implemented in all three prompts.

---

### Human Verification Required

None required. All must-haves are verifiable from the codebase directly. The following aspects would benefit from a live test but do not block verification:

1. **Flakiness filter polling behavior**
   - Test: Trigger a known flaky CI failure and observe whether the agent is skipped
   - Why human: Requires actual GitHub Actions execution; cannot simulate polling loop locally

2. **Retry guard counting accuracy across runs**
   - Test: Confirm `gh pr list --label auto-fix --state all` correctly counts across multiple run IDs
   - Why human: Requires actual GitHub API state with prior auto-fix PRs

These are operational concerns for Phase 3 pilot testing, not verification blockers.

---

### Gaps Summary

No gaps found. All 14 observable truths are verified, all 7 artifacts are substantive and wired, all 10 key links are connected, and all 13 requirement IDs claimed by Phase 2 plans are satisfied with direct code evidence.

The phase goal is fully achieved: CI failure detection (flakiness filter, head_branch, log retrieval), fix generation (agent with git/gh tools, source-only scope, diff validation), and PR management (labeled PRs, retry guard, needs-human escalation, human review gate) are all implemented and wired together in a 10-step workflow.

---

## Commit Verification

All 6 task commits documented in summaries are present in git history:
- `0977a7c` — feat(02-01): add head_branch input and flakiness filter
- `c7e7a5a` — feat(02-01): create example caller workflow
- `fe97bfb` — feat(02-02): restructure config schema and create diff validation script
- `a037526` — feat(02-02): extend workflow with agent git/gh capabilities and diff validation
- `52a2662` — feat(02-03): add env vars and no-commit tracking to auto-fix workflow
- `373940c` — feat(02-03): add git workflow, retry guard, and escalation to all stack prompts

---

_Verified: 2026-03-02_
_Verifier: Claude (gsd-verifier)_
