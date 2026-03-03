---
status: complete
phase: 04-promotion-and-observability
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md]
started: 2026-03-03T05:00:00Z
updated: 2026-03-03T06:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. promote.yml workflow structure
expected: promote.yml is valid YAML with workflow_call trigger, inputs (app_id, repository, merged_pr_number, source_branch, qa_branch, main_branch), secrets (app_private_key), and 3 job steps
result: PASS
evidence: |
  - YAML syntax validated (python3 yaml.safe_load succeeds).
  - Trigger: `on: workflow_call` confirmed at line 4.
  - 6 inputs confirmed: app_id (required), repository (required), merged_pr_number (required), source_branch (optional, default "develop"), qa_branch (optional, default "qa"), main_branch (optional, default "main").
  - 1 secret confirmed: app_private_key (required).
  - 3 steps confirmed: (1) Generate token, (2) Create develop to qa PR, (3) Create qa to main PR (awaiting human approval).

### 2. Duplicate PR detection in promote.yml
expected: Both develop→qa and qa→main steps check for existing open PRs via `gh pr list` before calling `gh pr create`, preventing duplicate PRs on re-runs
result: PASS
evidence: |
  - develop→qa: `gh pr list` at line 75 checks --base "$QA" --head "$SOURCE" before `gh pr create` at line 82. Short-circuits with "already exists" message at line 77.
  - qa→main: `gh pr list` at line 119 checks --base "$MAIN" --head "$QA" before `gh pr create` at line 126. Short-circuits with "already exists" message at line 121.
  - Both sections early-exit (exit 0) when EXISTING_PR is non-empty.

### 3. Human approval gate preserved
expected: No `gh pr merge` command exists anywhere in promote.yml — qa→main PR is created but never auto-merged
result: PASS
evidence: |
  - grep for "gh pr merge" in promote.yml returns zero matches.
  - Step 3 comment at line 101 explicitly states: "Creates the PR but NEVER merges it -- human must click Merge."
  - PR body at line 135-136 states: "Action required: A human must review and merge this PR. This PR will NOT be auto-merged."

### 4. promote-caller.example.yml wiring
expected: Caller triggers on `pull_request.closed`, gates on `merged == true` + `auto-fix` label, and calls `promote.yml@main` with correct inputs/secrets
result: PASS
evidence: |
  - YAML syntax validated.
  - Trigger: `pull_request: types: [closed]` at lines 6-7.
  - Promote job condition at lines 12-14: `github.event.pull_request.merged == true && contains(github.event.pull_request.labels.*.name, 'auto-fix')`.
  - Uses reference at line 15: `fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main`.
  - Inputs pass app_id, repository, merged_pr_number. Secrets pass app_private_key.

### 5. Repo-stack-map promotion config
expected: config/repo-stack-map.json has `defaults.promotion` with enabled/source_branch/qa_branch/main_branch. fbetancourtc repos inherit default (enabled). Liftitapp/LiftitFinOps repos have `promotion.enabled: false`
result: PASS
evidence: |
  - JSON syntax validated.
  - defaults.promotion at lines 12-17: enabled=true, source_branch="develop", qa_branch="qa", main_branch="main".
  - All 7 Liftitapp repos explicitly set promotion.enabled=false (lines 24-29).
  - LiftitFinOps/conciliacion-averias sets promotion.enabled=false (line 38).
  - All 7 fbetancourtc repos have no promotion override, inheriting default enabled=true (lines 31-37).

### 6. pricing.json rate table
expected: config/pricing.json has model rates for claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5 with input/output/cache rates, estimated_tokens_per_run, and budget config ($200/mo, thresholds [50,80,100])
result: PASS
evidence: |
  - JSON syntax validated.
  - 3 models present: claude-sonnet-4-6 (input=3.00, output=15.00, cache_read=0.30, cache_write=3.75), claude-opus-4-6 (input=5.00, output=25.00, cache_read=0.50, cache_write=6.25), claude-haiku-4-5 (input=1.00, output=5.00, cache_read=0.10, cache_write=1.25).
  - estimated_tokens_per_run: input=50000, output=10000 (lines 25-28).
  - budget: monthly_limit_usd=200, alert_thresholds_pct=[50, 80, 100] (lines 28-30).

### 7. record-metrics.sh two-strategy cost extraction
expected: Script has Strategy 1 (parse execution_file for total_cost_usd) and Strategy 2 (fallback to pricing.json rate table estimate). Both strategies produce COST, INPUT_TOKENS, OUTPUT_TOKENS values
result: PASS
evidence: |
  - Bash syntax validated (bash -n passes).
  - Strategy 1 at lines 24-33: checks EXECUTION_FILE exists, parses total_cost_usd via `jq -r '.total_cost_usd'` from tail -1 of execution file. Extracts input_tokens, output_tokens, cache_read, cache_write from .usage fields.
  - Strategy 2 at lines 36-45: fallback when COST is empty/null. Reads input_per_mtok and output_per_mtok from pricing.json for the current MODEL. Uses estimated_tokens_per_run values. Calculates cost via awk formula.
  - Both strategies set COST, INPUT_TOKENS, OUTPUT_TOKENS.

### 8. record-metrics.sh metrics append and push
expected: Script builds JSON entry with jq (id, timestamp, month, repository, outcome, cost_usd, tokens, model), appends to runs.json, and pushes with retry loop (3 attempts with pull-rebase)
result: PASS
evidence: |
  - JSON entry built via `jq -n` at lines 59-82 with fields: id, timestamp, month, repository, failed_run_id, outcome, cost_usd, tokens (input, output, cache_read, cache_write), model.
  - Append at lines 87-88: `jq --argjson entry "$NEW_ENTRY" '.runs += [$entry]'` writes to temp file then mv.
  - Retry push loop at lines 97-100: `for i in 1 2 3; do git push && break; git pull --rebase; done`.

### 9. record-metrics.sh GitHub Actions summary
expected: Script writes a markdown table to $GITHUB_STEP_SUMMARY with Repository, Outcome, Cost, Input Tokens, Output Tokens, Monthly Spend, Budget Used. Budget reads from pricing.json (not hardcoded)
result: PASS
evidence: |
  - GITHUB_STEP_SUMMARY write at line 110: `cat >> "$GITHUB_STEP_SUMMARY" << SUMMARY_EOF`.
  - Markdown table at lines 111-121 includes columns: Repository, Outcome, Cost, Input Tokens, Output Tokens, Monthly Spend, Budget Used.
  - Budget reads from pricing.json at line 106: `MONTHLY_BUDGET=$(jq -r '.budget.monthly_limit_usd' "$PRICING_FILE")`.
  - grep for hardcoded "200" returns zero matches in record-metrics.sh. Budget is fully dynamic.

### 10. check-budget.sh threshold alerts
expected: Script reads thresholds from pricing.json, checks monthly spend percentage, creates GitHub Issues with `budget-alert` label when threshold crossed, and deduplicates via `gh issue list --search`
result: PASS
evidence: |
  - Bash syntax validated.
  - Threshold loop at line 23: `for THRESHOLD in $(jq -r '.budget.alert_thresholds_pct[]' "$PRICING_FILE")`.
  - Monthly budget read at line 14: `jq -r '.budget.monthly_limit_usd'`.
  - Dedup at lines 26-28: `gh issue list --repo "$CENTRAL_REPO" --label "budget-alert" --search "Budget ${THRESHOLD}% ${CURRENT_MONTH}"`.
  - Issue creation at lines 36-51: `gh issue create --repo "$CENTRAL_REPO" --title "Budget ${THRESHOLD}% alert - ${CURRENT_MONTH}" --label "budget-alert"`.

### 11. auto-fix.yml metrics wiring
expected: Steps 11 (fix outcome detection) and 12 (record metrics + check budget) exist with `if: always()` guards and circuit breaker + flaky filter conditions. Step 12 calls both record-metrics.sh and check-budget.sh
result: PASS
evidence: |
  - Step 11 "Determine fix outcome" at YAML line 339 (array index 10). Condition at line 341: `if: always() && steps.circuit.outputs.should_proceed == 'true' && steps.flaky.outputs.is_flaky != 'true'`.
  - Step 12 "Record metrics" at YAML line 355 (array index 11). Condition at line 357: `if: always() && steps.circuit.outputs.should_proceed == 'true' && steps.flaky.outputs.is_flaky != 'true'`.
  - Step 12 run block calls both scripts at lines 366-367: `bash _auto-fix-scripts/scripts/record-metrics.sh` and `bash _auto-fix-scripts/scripts/check-budget.sh`.

### 12. Reviewer decline handler
expected: promote-caller.example.yml has `pull_request_review` trigger and `handle-decline` job with triple-gate condition (changes_requested + auto-fix-promote label + base.ref == main). Job closes PR and adds `needs-human` label
result: PASS
evidence: |
  - pull_request_review trigger at lines 8-9: `pull_request_review: types: [submitted]`.
  - handle-decline job at line 23 with triple-gate condition at lines 25-28: (1) `github.event.review.state == 'changes_requested'`, (2) `contains(github.event.pull_request.labels.*.name, 'auto-fix-promote')`, (3) `github.event.pull_request.base.ref == 'main'`.
  - Step at line 35 "Close PR and add needs-human label": adds label via `gh pr edit --add-label "needs-human"` (line 42), closes via `gh pr close` with comment (line 43).

### 13. End-to-end promotion flow (live GitHub)
expected: Merging an auto-fix PR into develop triggers promote-caller, which creates a develop→qa PR and qa→main PR automatically
result: SKIP
reason: Requires live GitHub Actions environment -- cannot be validated locally.

### 14. Budget alert issue creation (live GitHub)
expected: When monthly spend crosses 50% of $200, a GitHub Issue titled "Budget 50% alert - YYYY-MM" with label budget-alert is created. Second run does not duplicate
result: SKIP
reason: Requires live GitHub Actions environment -- cannot be validated locally.

## Summary

total: 14
passed: 12
issues: 0
pending: 0
skipped: 2

## Gaps

[none identified]
