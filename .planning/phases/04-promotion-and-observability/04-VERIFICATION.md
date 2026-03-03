---
phase: 04-promotion-and-observability
verified: 2026-03-03T05:00:00Z
status: passed
score: 15/15 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "If the reviewer declines, the qa->main PR is closed with a 'needs-human' label"
    - "GitHub Actions summary budget line reads monthly limit from pricing.json instead of hardcoding 200"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Trigger promote-caller.yml by merging an auto-fix PR into develop in a test repo"
    expected: "A develop->qa PR is created automatically in the target repo within seconds"
    why_human: "Requires GitHub Actions runner and a live target repo with develop and qa branches"
  - test: "Verify no duplicate develop->qa PR is created when the workflow is triggered twice"
    expected: "Second run logs 'develop->qa PR already exists (#N), skipping' and exits 0"
    why_human: "Requires two workflow runs against the same repo state"
  - test: "With reviewer logged in, request changes on a qa->main PR labeled 'auto-fix-promote'"
    expected: "PR is automatically closed and labeled 'needs-human' by the handle-decline job"
    why_human: "Requires a live GitHub Actions runner and a reviewer account with write access"
  - test: "Trigger a month where total spend exceeds 50% of the budget in metrics/runs.json"
    expected: "A GitHub Issue titled 'Budget 50% alert - YYYY-MM' is created with label 'budget-alert'"
    why_human: "Requires actual run data in metrics/runs.json and a live GitHub token"
---

# Phase 4: Promotion and Observability Verification Report

**Phase Goal:** Add develop->qa->main promotion flow with human approval gate, plus success rate tracking, cost-per-fix tracking via token usage, and budget alerts at 50%/80% of $200/month threshold.
**Verified:** 2026-03-03T05:00:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure plans 04-03 (decline handler + budget display fix)

## Goal Achievement

### Observable Truths

**From 04-01-PLAN.md must_haves (5 truths — previously 4/5 passed):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When an auto-fix PR merges into develop, a develop->qa PR is automatically created in that repo | VERIFIED | `promote-caller.example.yml` triggers on `pull_request.closed` with condition `merged==true && label==auto-fix`, calls `promote.yml` which runs `gh pr create --base "$QA" --head "$SOURCE"` at line 82 |
| 2 | A qa->main PR is automatically created but never auto-merged — human must click Merge | VERIFIED | `promote.yml` creates PR at line 126. Confirmed: grep for `gh pr merge` returns nothing in the file |
| 3 | If a develop->qa or qa->main PR already exists, no duplicate is created | VERIFIED | Lines 75-79 and 119-123 in `promote.yml` — both steps check `gh pr list` before `gh pr create` and exit with "skipping" message if PR exists |
| 4 | If the reviewer declines, the qa->main PR is closed with a 'needs-human' label | VERIFIED | `promote-caller.example.yml` now has a `handle-decline` job triggered on `pull_request_review: types: [submitted]`. Condition triple-gates on `changes_requested` + `auto-fix-promote` label + `base.ref == 'main'`. Calls `gh pr edit --add-label needs-human` then `gh pr close`. Committed 08f1360 |
| 5 | Repos without a qa branch are excluded from promotion (configurable via repo-stack-map.json) | VERIFIED | `config/repo-stack-map.json` — all 7 Liftitapp/LiftitFinOps repos have `"promotion": {"enabled": false}`. `promote.yml` also checks `ahead_by == 0` before creating PRs |

**From 04-02-PLAN.md must_haves (7 truths — all previously passed):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | After every auto-fix run, a metrics entry is appended to metrics/runs.json with repo, outcome, cost, and timestamp | VERIFIED | `scripts/record-metrics.sh` lines 59-82 build entry with `id, timestamp, month, repository, outcome, cost_usd, tokens, model` and append via `jq --argjson entry`. Wired in `auto-fix.yml` step 12 |
| 7 | Success rate per repo is derivable from metrics/runs.json (outcome field: fix_pr_created vs no_fix) | VERIFIED | `record-metrics.sh` lines 53-57 set `OUTCOME="fix_pr_created"` or `OUTCOME="no_fix"` based on `FIX_PR_CREATED` env var. Entry structure has `repository` and `outcome` fields confirmed |
| 8 | Cost per fix is calculated using config/pricing.json rate table with execution_file parsing fallback | VERIFIED | `record-metrics.sh` Strategy 1 (lines 25-33): parses `EXECUTION_FILE` for `total_cost_usd`. Strategy 2 (lines 36-45): reads `PRICING_FILE` rate table using `jq` and calculates via `awk`. `pricing.json` has sonnet/opus/haiku rates confirmed |
| 9 | A GitHub Issue tagged 'budget-alert' is created when monthly spend crosses 50%, 80%, or 100% of $200 | VERIFIED | `check-budget.sh` reads thresholds from `pricing.json` (`alert_thresholds_pct: [50, 80, 100]`), iterates each threshold, calls `gh issue create --label "budget-alert"` when PCT >= THRESHOLD |
| 10 | Budget alerts are not duplicated (dedup by threshold + month) | VERIFIED | `check-budget.sh` lines 26-28 check `gh issue list --repo "$CENTRAL_REPO" --label "budget-alert" --search "Budget ${THRESHOLD}% ${CURRENT_MONTH}"` before creating |
| 11 | Monthly budget resets automatically (filter by month key, no explicit reset) | VERIFIED | `check-budget.sh` line 16 and `record-metrics.sh` line 107 both use `select(.month == "$CURRENT_MONTH")` in jq filter — month key computed fresh via `date -u +%Y-%m` |
| 12 | GitHub Actions summary table shows per-run metrics (repo, outcome, cost, monthly spend) | VERIFIED | `record-metrics.sh` lines 110-121 write a markdown table to `$GITHUB_STEP_SUMMARY` with Repository, Outcome, Cost, Input Tokens, Output Tokens, Monthly Spend, Budget Used rows |

**From 04-03-PLAN.md must_haves (3 new gap-closure truths):**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 13 | If a reviewer requests changes on a qa->main PR labeled 'auto-fix-promote', the PR is closed and a 'needs-human' label is added | VERIFIED | `handle-decline` job confirmed in `promote-caller.example.yml`. All three guards present: `changes_requested` + `auto-fix-promote` label + `base.ref == 'main'`. Steps call `gh pr edit --add-label needs-human` then `gh pr close` |
| 14 | The decline handler only fires on PRs targeting main (not develop->qa PRs) | VERIFIED | Job condition includes `github.event.pull_request.base.ref == 'main'` — confirmed by YAML parse. The promote job's `merged == true` guard also prevents it firing on review events |
| 15 | The GitHub Actions summary budget line reads the monthly limit from pricing.json instead of hardcoding 200 | VERIFIED | `record-metrics.sh` line 105: `PRICING_FILE="${PRICING_FILE:-_auto-fix-scripts/config/pricing.json}"`, line 106: `MONTHLY_BUDGET=$(jq -r '.budget.monthly_limit_usd' "$PRICING_FILE")`. Lines 108 and 119 use `$MONTHLY_BUDGET`. No literal `200` remains in budget calculation or summary table. Committed 79e7293 |

**Score: 15/15 truths verified**

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/promote.yml` | Reusable promotion workflow — creates develop->qa PR and qa->main PR | VERIFIED | Exists, 142 lines, valid YAML, `on: workflow_call` trigger, 3 steps: token + two PR creation steps with duplicate detection. No `gh pr merge` present |
| `.github/workflows/promote-caller.example.yml` | Thin caller template with promotion trigger and decline handler | VERIFIED | Exists, 45 lines, valid YAML. Has both `pull_request` and `pull_request_review` triggers. Jobs: `promote` + `handle-decline`. Decline handler has all required patterns: `needs-human`, `gh pr close`, `gh pr edit --add-label` |
| `config/repo-stack-map.json` | Repo config extended with promotion branch info | VERIFIED | Contains `defaults.promotion` with `enabled/source_branch/qa_branch/main_branch`. 7 Liftitapp/LiftitFinOps repos have `promotion.enabled=false`. 7 fbetancourtc repos inherit default (enabled). Valid JSON |
| `scripts/record-metrics.sh` | Appends run data to metrics/runs.json, writes GitHub Actions summary | VERIFIED | Exists, 121 lines, executable (-rwxr-xr-x). Two-strategy cost extraction. Retry push loop. Writes to `$GITHUB_STEP_SUMMARY`. Budget reads from `pricing.json` via `MONTHLY_BUDGET`. Syntax: OK |
| `scripts/check-budget.sh` | Checks monthly spend against thresholds, creates GitHub Issues | VERIFIED | Exists, 57 lines, executable (-rwxr-xr-x). Reads thresholds from `pricing.json`. Dedup logic present. Syntax: OK |
| `config/pricing.json` | Hardcoded token rate table for cost estimation | VERIFIED | Exists, valid JSON. Has `claude-sonnet-4-6/claude-opus-4-6/claude-haiku-4-5` rates. `budget.monthly_limit_usd: 200`. `alert_thresholds_pct: [50, 80, 100]` |
| `metrics/runs.json` | Run history seed file | VERIFIED | Exists, valid JSON, `{"runs": []}` seed structure |
| `.github/workflows/auto-fix.yml` | Updated workflow with metrics recording step | VERIFIED | Steps 11 and 12 added. Step 12 calls both `record-metrics.sh` and `check-budget.sh`. Sparse-checkout includes `metrics/` directory |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `promote-caller.example.yml` | `promote.yml` | `uses: fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main` on `pull_request.closed + merged==true + label auto-fix` | WIRED | Line 15: `uses: fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main`. Trigger and condition confirmed |
| `promote.yml` | Target repo (develop->qa PR) | `gh pr create --base "$QA" --head "$SOURCE"` | WIRED | Lines 75-98: `gh pr list` check then `gh pr create --repo "$REPO" --base "$QA" --head "$SOURCE"` |
| `promote.yml` | Target repo (qa->main PR) | `gh pr create --base "$MAIN" --head "$QA"` | WIRED | Lines 119-141: `gh pr list` check then `gh pr create --repo "$REPO" --base "$MAIN" --head "$QA"` |
| `promote-caller.example.yml (handle-decline)` | qa->main PR in target repo | `gh pr close + gh pr edit --add-label needs-human` | WIRED | Step run block: `gh pr edit "$PR_NUMBER" --repo "$REPO" --add-label "needs-human"` then `gh pr close "$PR_NUMBER" --repo "$REPO"` |
| `auto-fix.yml` | `scripts/record-metrics.sh` | `bash _auto-fix-scripts/scripts/record-metrics.sh` | WIRED | Step 12 `run:` block |
| `scripts/record-metrics.sh` | `metrics/runs.json` | `jq append to runs array` | WIRED | Lines 86-88: `METRICS_FILE` path then `jq --argjson entry "$NEW_ENTRY" '.runs += [$entry]'` |
| `scripts/record-metrics.sh` | `config/pricing.json` | `jq .budget.monthly_limit_usd` | WIRED | Line 105: `PRICING_FILE` with bash default substitution. Line 106: `MONTHLY_BUDGET=$(jq -r '.budget.monthly_limit_usd' "$PRICING_FILE")` |
| `scripts/check-budget.sh` | GitHub Issues | `gh issue create --label budget-alert` | WIRED | Line 36: `gh issue create --repo "$CENTRAL_REPO" --label "budget-alert"` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| Auto-create develop->qa PR when fix PR merges | 04-01 | Promotion caller triggers on merged auto-fix PRs, creates develop->qa PR | SATISFIED | `promote-caller.example.yml` + `promote.yml` step 2 |
| Human approval gate for qa->main promotion | 04-01, 04-03 | qa->main PR created but never auto-merged; reviewer decline closes PR with needs-human label | SATISFIED | `promote.yml` step 3 (no `gh pr merge`); `promote-caller.example.yml` handle-decline job |
| Success rate tracking per repo | 04-02 | outcome field in runs.json distinguishes fix_pr_created vs no_fix per repo | SATISFIED | `record-metrics.sh` outcome logic + `repository` field in JSON entry |
| Cost-per-fix tracking via token usage output | 04-02 | Two-strategy extraction: execution_file first, rate-table fallback | SATISFIED | `record-metrics.sh` Strategy 1 + Strategy 2 with `pricing.json` |
| Budget alerts at 50%/80% of $200/month threshold | 04-02 | GitHub Issues created at 50%, 80%, 100% thresholds with dedup | SATISFIED | `check-budget.sh` threshold loop + dedup logic; `pricing.json` has `[50, 80, 100]` |

All 5 requirement IDs satisfied. ROADMAP.md was updated to mark all three plans complete (commits c188da7 and 904d809).

### Anti-Patterns Found

No anti-patterns found. The previous warning (hardcoded `200` in `record-metrics.sh`) was resolved in commit 79e7293. No TODO/FIXME/placeholder comments exist in any phase 4 artifacts. No stub implementations found.

### Human Verification Required

#### 1. Develop->QA Promotion End-to-End

**Test:** In a repo with develop and qa branches, merge a PR labeled `auto-fix` into develop. Ensure `promote-caller.yml` is installed on that repo.
**Expected:** A PR is automatically created from develop to qa within seconds of the merge completing, titled "promote: merge develop into qa (fix PR #N)".
**Why human:** Requires GitHub Actions runner, a live repo with proper branch structure, and the promote-caller.yml installed in the target repo.

#### 2. Duplicate PR Prevention

**Test:** Trigger the promote-caller twice for the same develop-to-qa state (e.g., by re-running the workflow or manually dispatching it while a develop->qa PR is already open).
**Expected:** Second run logs "develop->qa PR already exists (#N), skipping" and exits 0 without creating a duplicate PR.
**Why human:** Requires controlling workflow trigger timing against live GitHub API state.

#### 3. Reviewer Decline — End-to-End

**Test:** With a qa->main PR open and labeled `auto-fix-promote`, have a reviewer submit a review with "Request changes".
**Expected:** The `handle-decline` job fires within seconds, closes the PR, and adds the `needs-human` label with an explanatory comment.
**Why human:** Requires a live GitHub Actions runner and a second GitHub account with repository write access to submit a review.

#### 4. Budget Alert GitHub Issue Creation

**Test:** Seed `metrics/runs.json` with run entries totaling more than $100 in the current month. Run `check-budget.sh` with a valid `GH_TOKEN` and `CENTRAL_REPO` pointing to a test repo.
**Expected:** A GitHub Issue titled "Budget 50% alert - YYYY-MM" with label `budget-alert` appears in the central repo. A second run creates no duplicate.
**Why human:** Requires a valid GitHub token and real `gh` CLI execution against a live repo.

### Re-Verification Summary

**Gap status from previous verification:**

| Gap | Previous Status | Now |
|-----|----------------|-----|
| Truth 4: "If the reviewer declines, the qa->main PR is closed with a 'needs-human' label" | FAILED | CLOSED — `handle-decline` job added to `promote-caller.example.yml` (commit 08f1360) |
| Anti-pattern: hardcoded `200` in record-metrics.sh summary | Warning | RESOLVED — `MONTHLY_BUDGET` read from `pricing.json` (commit 79e7293) |

**Regression check:** All 11 previously passing truths (1-3, 5-12) re-verified against actual file contents. No regressions detected.

**ROADMAP.md updated:** All three phase 4 plans now checked (`[x]`), confirming documentation matches implementation.

---

_Verified: 2026-03-03T05:00:00Z_
_Verifier: Claude (gsd-verifier)_
_Mode: Re-verification after gap closure (04-03)_
