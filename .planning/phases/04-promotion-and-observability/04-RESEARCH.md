# Phase 4: Promotion and Observability - Research

**Researched:** 2026-03-02
**Domain:** GitHub Actions workflow orchestration, API cost tracking, metrics aggregation
**Confidence:** HIGH

## Summary

Phase 4 adds two orthogonal capabilities to the existing auto-fix system: (1) a promotion pipeline that creates develop-to-qa and qa-to-main PRs when fix PRs merge, and (2) an observability layer that tracks success rates, cost-per-fix, and budget consumption across all repos.

The promotion pipeline follows the exact same reusable-workflow + thin-caller architecture already proven in Phases 2-3. A new `promote.yml` reusable workflow in auto-fix-agent gets triggered by thin `promote-caller.yml` files in each repo. The trigger is `pull_request: types: [closed]` with `if: github.event.pull_request.merged == true` -- a well-documented GitHub Actions pattern.

The observability layer is more novel. The `claude-code-action` does NOT natively output token usage counts. Its only action outputs are `execution_file`, `branch_name`, `github_token`, `structured_output`, and `session_id`. However, the underlying Claude Code CLI supports `--output-format json` which includes `total_cost_usd` and a `usage` object with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`. The recommended approach is to pass `--output-format json` via `claude_args` and parse the execution file or structured output to extract cost data. An alternative (simpler but less precise) approach is to use a hardcoded rate table as the user decided, which avoids needing to extract token data from the action at all -- the workflow can estimate cost from max-turns and average-tokens-per-turn, or parse the execution_file JSONL after the run.

**Primary recommendation:** Build `promote.yml` mirroring `auto-fix.yml` pattern, add a post-run metrics-collection step to the existing `auto-fix.yml`, store metrics in `metrics/runs.json`, and create a budget-check step that opens GitHub Issues at thresholds.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Per-fix promotion: each merged auto-fix PR immediately triggers a develop-to-qa PR creation
- Fix PRs always target develop (current behavior, no change)
- Central reusable workflow pattern: new `promote.yml` in auto-fix-agent, thin callers in each repo (mirrors auto-fix-caller.yml pattern)
- Claude audits repos during research to confirm develop-to-qa-to-main branch strategy exists per repo; repos without qa branch get documented for exclusion or setup
- Manual merge gate: the workflow creates the qa-to-main PR but never auto-merges -- human must click "Merge"
- CI must pass on qa branch before qa-to-main PR is merge-ready (branch protection)
- If reviewer declines: close the qa-to-main PR and add 'needs-human' label -- fix stays on develop/qa but doesn't reach main
- Approver: repo owner (just you for now)
- JSON files in auto-fix-agent repo (e.g., `metrics/runs.json`) -- updated by workflow after each run
- Success = agent created a fix PR (tracks agent capability regardless of merge decisions)
- Cost calculated via hardcoded rate table in `config/pricing.json` -- tokens x rate, manually updated when pricing changes
- GitHub Actions summary table per run for immediate visibility; raw JSON for aggregation
- GitHub Issue auto-created in auto-fix-agent when 50% or 80% thresholds hit, tagged 'budget-alert'
- At 100%: alert only -- auto-fix keeps running, you decide manually whether to pause
- Budget counter auto-resets on 1st of each month
- Aggregate budget across all repos ($200/month total), no per-repo limits

### Claude's Discretion
- Exact promotion workflow implementation details (reusable workflow inputs/outputs)
- How token usage is extracted from Claude Code Action output
- JSON schema for metrics/runs.json
- Whether to batch-update metrics or append per-run
- Branch protection rule configuration approach per org

### Deferred Ideas (OUT OF SCOPE)
- `@claude` interactive code review via PR comments -- separate capability
- Per-repo budget limits -- start with aggregate, add granularity if needed
- Slack/Teams notifications -- GitHub PR notifications suffice (PROJECT.md out-of-scope)
- Dashboard UI for metrics -- start with raw JSON + Actions summaries
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| Auto-create develop-to-qa PR when fix PR merges | Promotion caller triggers on `pull_request.closed` + merged condition, calls `promote.yml` reusable workflow which creates develop-to-qa PR via `gh pr create` | GitHub Actions `pull_request: types: [closed]` pattern verified via official docs; `gh pr create` for PR creation |
| Human approval gate for qa-to-main promotion | `promote.yml` creates qa-to-main PR but never auto-merges; branch protection requires CI pass; decline = close PR + 'needs-human' label | Manual merge gate enforced by never calling `gh pr merge`; `gh pr edit --add-label` for decline path |
| Success rate tracking per repo | Post-run step in `auto-fix.yml` appends run result to `metrics/runs.json`; success = fix PR was created (check via `gh pr list`) | Existing track-attempt step pattern already detects PR creation; extend with metrics append |
| Cost-per-fix tracking via token usage output | Parse `execution_file` output from claude-code-action or use `--output-format json` to extract `total_cost_usd` / token usage; fallback to hardcoded rate table estimate | Agent SDK provides `total_cost_usd` in JSON output; action exposes `execution_file` path |
| Budget alerts at 50%/80% of $200/month threshold | Budget-check step reads `metrics/runs.json`, sums month's costs, creates GitHub Issue via `gh issue create` when thresholds crossed | `gh issue create --label budget-alert` pattern verified; dedup via `gh issue list --label budget-alert` |
</phase_requirements>

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| GitHub Actions `workflow_call` | N/A (platform) | Reusable workflow for promotion logic | Already proven pattern in auto-fix.yml |
| GitHub Actions `pull_request` event | N/A (platform) | Trigger promotion on fix PR merge | Official pattern: `types: [closed]` + `merged == true` |
| `actions/create-github-app-token@v2` | v2 | Cross-org token for PR creation | Already used in auto-fix.yml |
| `actions/github-script@v7` | v7 | Inline JS for GitHub API calls | Already used for circuit breaker |
| `gh` CLI | Bundled in ubuntu-latest | Create PRs, issues, manage labels | Already used throughout auto-fix.yml |
| `jq` | Bundled in ubuntu-latest | JSON parsing and manipulation | Standard shell JSON tool |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| `actions/checkout@v4` | v4 | Checkout auto-fix-agent for scripts/config | Already in auto-fix.yml |
| `config/pricing.json` | New file | Hardcoded token rate table | Cost calculation per user decision |
| `metrics/runs.json` | New file | Run history with costs and outcomes | Metrics storage per user decision |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON file metrics | SQLite in repo | SQLite is overkill for append-only data; JSON is human-readable and git-diffable |
| Hardcoded pricing | Anthropic Usage API | API requires admin auth, adds complexity; hardcoded table is simpler and user-decided |
| GitHub Issues for alerts | Slack webhook | User explicitly deferred Slack; Issues integrate with existing notification flow |
| `execution_file` parsing | `--output-format json` via claude_args | execution_file is already available as action output; adding --output-format may conflict with action's internal processing |

## Architecture Patterns

### Recommended Project Structure
```
auto-fix-agent/
├── .github/workflows/
│   ├── auto-fix.yml                    # Existing -- add metrics step
│   ├── auto-fix-caller.example.yml     # Existing
│   ├── promote.yml                     # NEW -- reusable promotion workflow
│   └── promote-caller.example.yml      # NEW -- thin caller template
├── config/
│   ├── repo-stack-map.json             # Existing
│   └── pricing.json                    # NEW -- token rate table
├── metrics/
│   └── runs.json                       # NEW -- run history
├── scripts/
│   ├── sanitize-logs.sh                # Existing
│   ├── validate-diff.sh                # Existing
│   ├── record-metrics.sh              # NEW -- append run data to metrics
│   └── check-budget.sh               # NEW -- threshold check + alert
└── prompts/                            # Existing
```

### Pattern 1: Promotion Trigger via PR Merge Event
**What:** Thin caller in each repo triggers on auto-fix PR merge, calls central promote.yml
**When to use:** Every time an auto-fix PR is merged into develop
**Example:**
```yaml
# promote-caller.yml (in each repo)
name: Promote Fix
on:
  pull_request:
    types: [closed]
jobs:
  promote:
    if: >-
      github.event.pull_request.merged == true &&
      contains(github.event.pull_request.labels.*.name, 'auto-fix')
    uses: fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main
    with:
      app_id: "2985828"
      repository: "${{ github.repository }}"
      merged_pr_number: "${{ github.event.pull_request.number }}"
      source_branch: "develop"
      target_branch: "qa"
    secrets:
      app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}"
```
Source: GitHub Actions official docs on `pull_request.closed` + `merged == true` pattern

### Pattern 2: Two-Stage Promotion (develop-to-qa, qa-to-main)
**What:** First PR: develop-to-qa (auto-created). Second PR: qa-to-main (auto-created but never auto-merged)
**When to use:** Every promotion cycle
**Example:**
```yaml
# Inside promote.yml reusable workflow
steps:
  - name: Create develop-to-qa PR
    env:
      GH_TOKEN: ${{ steps.app-token.outputs.token }}
    run: |
      # Check if develop has changes ahead of qa
      DIFF=$(gh api repos/${{ inputs.repository }}/compare/qa...develop --jq '.ahead_by')
      if [ "$DIFF" -gt 0 ]; then
        gh pr create --repo "${{ inputs.repository }}" \
          --base qa --head develop \
          --title "promote: merge develop into qa (fix PR #${{ inputs.merged_pr_number }})" \
          --label "auto-fix-promote" \
          --body "Automated promotion triggered by merged fix PR #${{ inputs.merged_pr_number }}"
      fi

  - name: Create qa-to-main PR (manual merge gate)
    env:
      GH_TOKEN: ${{ steps.app-token.outputs.token }}
    run: |
      # Only create if qa has changes ahead of main
      DIFF=$(gh api repos/${{ inputs.repository }}/compare/main...qa --jq '.ahead_by')
      if [ "$DIFF" -gt 0 ]; then
        EXISTING=$(gh pr list --repo "${{ inputs.repository }}" --base main --head qa --json number --jq '.[0].number')
        if [ -z "$EXISTING" ]; then
          gh pr create --repo "${{ inputs.repository }}" \
            --base main --head qa \
            --title "promote: qa to main (awaiting human approval)" \
            --label "auto-fix-promote" \
            --body "Human approval required. CI must pass before merge."
        fi
      fi
```

### Pattern 3: Metrics Collection via Post-Run Step
**What:** After Claude Code Action runs, extract cost data and append to metrics JSON
**When to use:** After every auto-fix run (success or failure)
**Example:**
```yaml
# Added to auto-fix.yml after the agent step
- name: Record metrics
  if: always() && steps.circuit.outputs.should_proceed == 'true'
  env:
    GH_TOKEN: ${{ steps.app-token.outputs.token }}
    EXECUTION_FILE: ${{ steps.agent.outputs.execution_file }}
    TARGET_REPO: ${{ inputs.repository }}
    RUN_ID: ${{ inputs.failed_run_id }}
  run: |
    bash _auto-fix-scripts/scripts/record-metrics.sh
```

### Pattern 4: Budget Alert via GitHub Issue
**What:** Check monthly spend against thresholds, create issue if exceeded
**When to use:** After every metrics update
**Example:**
```bash
# scripts/check-budget.sh
MONTHLY_BUDGET=200
CURRENT_MONTH=$(date +%Y-%m)
TOTAL_COST=$(jq "[.runs[] | select(.month == \"$CURRENT_MONTH\") | .cost_usd] | add // 0" metrics/runs.json)

PCT=$(echo "$TOTAL_COST $MONTHLY_BUDGET" | awk '{printf "%.0f", ($1/$2)*100}')

for THRESHOLD in 50 80 100; do
  if [ "$PCT" -ge "$THRESHOLD" ]; then
    # Check if alert already exists for this threshold this month
    EXISTING=$(gh issue list --label "budget-alert" --search "Budget ${THRESHOLD}% ${CURRENT_MONTH}" --json number --jq '.[0].number')
    if [ -z "$EXISTING" ]; then
      gh issue create \
        --title "Budget ${THRESHOLD}% alert - ${CURRENT_MONTH}" \
        --label "budget-alert" \
        --body "Monthly auto-fix spend has reached ${THRESHOLD}% (\$${TOTAL_COST} of \$${MONTHLY_BUDGET}).

Action required: Review spending and decide whether to continue or pause auto-fix runs."
    fi
  fi
done
```

### Anti-Patterns to Avoid
- **Auto-merging qa-to-main PRs:** The user explicitly requires human approval. Never add `gh pr merge` for the qa-to-main step.
- **Storing metrics in each repo:** Metrics belong in the central auto-fix-agent repo. Per-repo metrics fragment visibility and complicate budget tracking.
- **Parsing Claude Code Action logs for token counts:** Logs are not structured. Use the `execution_file` output or `--output-format json` instead.
- **Using `secrets: inherit` in callers:** Already known to fail silently cross-org. Callers must explicitly pass secrets.
- **Creating duplicate PRs:** Always check for existing open PRs before creating new ones (develop-to-qa and qa-to-main).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PR creation | Custom GitHub API calls | `gh pr create` CLI | Handles auth, formatting, error messages automatically |
| Issue creation for alerts | REST API with curl | `gh issue create` CLI | Simpler, auth from GH_TOKEN, handles edge cases |
| JSON manipulation | Custom bash string manipulation | `jq` | Robust JSON parsing, avoids shell injection in JSON values |
| Cross-org authentication | Manual PAT management | `actions/create-github-app-token@v2` | Already proven in auto-fix.yml, rotates automatically |
| PR merge detection | Webhook parsing | `pull_request: types: [closed]` + `merged == true` | Official GitHub Actions pattern, reliable |
| Budget month boundaries | Custom date logic | `date +%Y-%m` for month key | Standard POSIX, avoids timezone bugs |

**Key insight:** The existing auto-fix.yml already solves the hardest problems (cross-org auth, circuit breakers, retry guards). Phase 4 adds orchestration on top of proven patterns.

## Common Pitfalls

### Pitfall 1: Race Condition on develop-to-qa PR
**What goes wrong:** Multiple auto-fix PRs merge in quick succession, each triggering a promote-caller. Multiple develop-to-qa PRs get created simultaneously.
**Why it happens:** `pull_request.closed` events fire independently with no mutual exclusion.
**How to avoid:** Before creating a develop-to-qa PR, check if one already exists: `gh pr list --base qa --head develop`. If one exists, skip creation (the existing PR already captures the latest develop state).
**Warning signs:** Duplicate PRs with "promote:" prefix in the same repo.

### Pitfall 2: Stale qa-to-main PR After New Fixes
**What goes wrong:** A qa-to-main PR is created, but then more fixes merge into develop and get promoted to qa. The existing qa-to-main PR is now stale.
**Why it happens:** The qa-to-main PR was created from an earlier qa state.
**How to avoid:** Don't create a new qa-to-main PR if one already exists. The existing open PR automatically reflects the latest qa branch state because GitHub PRs track the head branch dynamically.
**Warning signs:** Multiple open qa-to-main PRs for the same repo.

### Pitfall 3: Metrics File Corruption from Concurrent Writes
**What goes wrong:** Two workflows running simultaneously both try to update metrics/runs.json, causing a git conflict or data loss.
**Why it happens:** GitHub Actions runs are concurrent by default.
**How to avoid:** Use `concurrency` groups in the metrics-update job to serialize writes. Alternatively, use append-only files (one JSON line per run in a JSONL format) or atomic git operations (checkout, update, commit, push with retry on conflict).
**Warning signs:** Push failures on the auto-fix-agent repo, corrupted JSON files.

### Pitfall 4: execution_file Output May Not Contain Cost Data
**What goes wrong:** The `execution_file` output from claude-code-action may be a path to a JSONL file, but its contents and format are not documented.
**Why it happens:** The action's documentation only describes `structured_output`, `branch_name`, `session_id`, and `execution_file` without detailing the execution file's internal format.
**How to avoid:** Two strategies: (1) Attempt to parse `execution_file` for a `total_cost_usd` field and fall back gracefully if not found. (2) Use the hardcoded rate table approach (user decision) where token counts are estimated or extracted from the last line of JSON output. The rate-table approach is simpler and more reliable since it doesn't depend on undocumented action internals.
**Warning signs:** Missing or null cost data in metrics/runs.json.

### Pitfall 5: Budget Reset Timing
**What goes wrong:** Runs near month boundaries get counted in the wrong month, or the reset logic has off-by-one errors.
**Why it happens:** UTC vs local timezone differences, or using day-of-month checks instead of month keys.
**How to avoid:** Use `date -u +%Y-%m` (UTC) consistently for the month key in metrics/runs.json. The budget is simply the sum of all runs where `month == current_month`. No explicit "reset" needed -- each month is a separate filter.
**Warning signs:** Alerts firing on the 1st of the month for last month's spend.

### Pitfall 6: Repos Without qa Branch
**What goes wrong:** Promotion workflow tries to create develop-to-qa PR but qa branch doesn't exist.
**Why it happens:** Not all 14 repos may have the develop-to-qa-to-main branching strategy.
**How to avoid:** User decision: audit repos during implementation to confirm branch strategy. Add a `branches` field to `config/repo-stack-map.json` (e.g., `"branches": {"promote": true, "qa": "qa", "main": "main"}`). Promotion caller only triggers if repo is configured for promotion.
**Warning signs:** `gh pr create` failures with "base branch not found".

## Code Examples

### Extracting Cost from Claude Code Execution

Strategy 1: Parse execution_file (attempt, may not work):
```bash
# The execution_file is a path to a file containing run output
EXEC_FILE="${{ steps.agent.outputs.execution_file }}"
if [ -f "$EXEC_FILE" ]; then
  # Try to extract total_cost_usd from the last JSON line (result message)
  COST=$(tail -1 "$EXEC_FILE" | jq -r '.total_cost_usd // empty' 2>/dev/null)
  INPUT_TOKENS=$(tail -1 "$EXEC_FILE" | jq -r '.usage.input_tokens // 0' 2>/dev/null)
  OUTPUT_TOKENS=$(tail -1 "$EXEC_FILE" | jq -r '.usage.output_tokens // 0' 2>/dev/null)
fi
```

Strategy 2: Hardcoded rate table estimate (user-decided, reliable):
```bash
# config/pricing.json
# {
#   "default_model": "claude-sonnet-4-6",
#   "models": {
#     "claude-sonnet-4-6": {
#       "input_per_mtok": 3.00,
#       "output_per_mtok": 15.00,
#       "cache_read_per_mtok": 0.30,
#       "cache_write_per_mtok": 3.75
#     }
#   },
#   "estimated_tokens_per_run": {
#     "input": 50000,
#     "output": 10000
#   }
# }

# If execution_file parsing fails, use estimate
if [ -z "$COST" ] || [ "$COST" = "null" ]; then
  PRICING=$(cat _auto-fix-scripts/config/pricing.json)
  INPUT_RATE=$(echo "$PRICING" | jq -r '.models["claude-sonnet-4-6"].input_per_mtok')
  OUTPUT_RATE=$(echo "$PRICING" | jq -r '.models["claude-sonnet-4-6"].output_per_mtok')
  EST_INPUT=$(echo "$PRICING" | jq -r '.estimated_tokens_per_run.input')
  EST_OUTPUT=$(echo "$PRICING" | jq -r '.estimated_tokens_per_run.output')
  COST=$(echo "$EST_INPUT $INPUT_RATE $EST_OUTPUT $OUTPUT_RATE" | awk '{printf "%.4f", ($1/1000000)*$2 + ($3/1000000)*$4}')
fi
```

### Metrics JSON Schema
```json
{
  "runs": [
    {
      "id": "run_20260302_143022",
      "timestamp": "2026-03-02T14:30:22Z",
      "month": "2026-03",
      "repository": "fbetancourtc/laundry-operating-dash",
      "failed_run_id": "12345678",
      "branch": "develop",
      "outcome": "fix_pr_created",
      "fix_pr_number": 42,
      "cost_usd": 1.25,
      "tokens": {
        "input": 45000,
        "output": 8500,
        "cache_read": 12000,
        "cache_write": 3000
      },
      "model": "claude-sonnet-4-6",
      "duration_seconds": 120
    }
  ],
  "budget": {
    "monthly_limit_usd": 200,
    "alert_thresholds_pct": [50, 80, 100]
  }
}
```

### GitHub Actions Summary Table
```bash
# Append to $GITHUB_STEP_SUMMARY for per-run visibility
cat >> "$GITHUB_STEP_SUMMARY" << EOF
## Auto-Fix Run Metrics

| Metric | Value |
|--------|-------|
| Repository | $TARGET_REPO |
| Outcome | $OUTCOME |
| Cost | \$$COST |
| Input Tokens | $INPUT_TOKENS |
| Output Tokens | $OUTPUT_TOKENS |
| Duration | ${DURATION}s |
| Monthly Spend | \$$MONTHLY_TOTAL / \$200 |
| Budget Used | ${BUDGET_PCT}% |
EOF
```

### Concurrency Control for Metrics Updates
```yaml
# In auto-fix.yml, add concurrency to the metrics job or step
# to prevent concurrent writes to metrics/runs.json
concurrency:
  group: metrics-update
  cancel-in-progress: false
```
Source: GitHub Actions concurrency documentation

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Sonnet 3.7 pricing ($3/$15 MTok) | Claude Sonnet 4.6 pricing ($3/$15 MTok) | 2025-2026 | Same price tier, but Sonnet 4.x models available |
| No execution_file output | claude-code-action exposes execution_file path | 2025 | Potential path to real token data extraction |
| Manual cost tracking | Agent SDK provides total_cost_usd | 2025-2026 | SDK-level cost tracking available for programmatic usage |

**Deprecated/outdated:**
- Claude Sonnet 3.7: deprecated, pricing was same as current Sonnet 4.x ($3/$15 MTok)
- Claude Opus 3: deprecated, replaced by Opus 4.x series

## Current Anthropic Pricing Reference (for config/pricing.json)

| Model | Input/MTok | Output/MTok | Cache Read/MTok | Cache Write (5m)/MTok |
|-------|-----------|-------------|-----------------|----------------------|
| Claude Opus 4.6 | $5.00 | $25.00 | $0.50 | $6.25 |
| Claude Sonnet 4.6 | $3.00 | $15.00 | $0.30 | $3.75 |
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 | $1.25 |

Source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-03-02)

## Open Questions

1. **execution_file content format**
   - What we know: The `claude-code-action` exposes an `execution_file` output (path to a file). The underlying Claude Code CLI produces JSONL with `total_cost_usd` and `usage` when invoked with `--output-format json`.
   - What's unclear: Whether the action's `execution_file` contains this same data, or whether it's a different format. The action documentation does not describe the file's contents.
   - Recommendation: Implement a two-strategy approach: try parsing `execution_file` for cost data first, fall back to the hardcoded rate table estimate. The rate-table approach is the user's decided path and should work regardless.

2. **Concurrency on metrics/runs.json**
   - What we know: GitHub Actions `concurrency` groups can serialize jobs. JSONL (one line per run) is more append-friendly than a single JSON object.
   - What's unclear: Whether git push conflicts will occur if two repos trigger auto-fix simultaneously and both try to update metrics in the central repo.
   - Recommendation: Use `concurrency: { group: metrics-update, cancel-in-progress: false }` to queue metric writes. Additionally, use a retry loop on `git push` (pull, rebase, push) to handle races.

3. **Which repos have qa branches**
   - What we know: User decided to audit repos during research. The 14 repos are listed in config/repo-stack-map.json.
   - What's unclear: Which repos actually have develop-to-qa-to-main branching vs simpler strategies.
   - Recommendation: Add a `promotion` config field to repo-stack-map.json (e.g., `"promotion": { "enabled": true, "qa_branch": "qa" }`). Audit during implementation Wave 0 or 1. Repos without qa branch are excluded from promotion but still get metrics tracking.

## Sources

### Primary (HIGH confidence)
- GitHub Actions official docs - `pull_request: types: [closed]` + `merged == true` pattern (Context7 /websites/github_en_actions)
- GitHub Actions official docs - `on.workflow_call.outputs` for reusable workflow data passing (Context7 /websites/github_en_actions)
- Anthropic pricing page - exact model pricing table (https://platform.claude.com/docs/en/about-claude/pricing, fetched 2026-03-02)
- Claude Agent SDK cost tracking docs - `total_cost_usd`, `usage` object structure (https://platform.claude.com/docs/en/agent-sdk/cost-tracking)
- Claude Code CLI reference - `--output-format json` flag, `--max-budget-usd` flag (https://code.claude.com/docs/en/cli-reference)
- Existing `auto-fix.yml` - proven patterns for reusable workflow, circuit breaker, cross-org tokens

### Secondary (MEDIUM confidence)
- claude-code-action `action.yml` - outputs include `execution_file`, `structured_output`, `session_id`, `branch_name`, `github_token` (https://github.com/anthropics/claude-code-action/blob/main/action.yml)
- Claude Code costs documentation - `/cost` command shows `total_cost_usd` per session (https://code.claude.com/docs/en/costs)
- ccusage tool documentation - JSONL format with `totalCost`, token breakdowns (https://ccusage.com/guide/json-output)

### Tertiary (LOW confidence)
- WebSearch results suggesting `--output-format json` output includes `total_cost_usd`, `usage`, `duration_ms`, `num_turns`, `session_id` fields -- needs validation with actual claude-code-action run

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all components already proven in existing auto-fix.yml or are standard GitHub Actions patterns
- Architecture: HIGH - promotion pattern mirrors existing caller architecture; metrics is straightforward JSON append
- Pitfalls: HIGH - concurrency, race conditions, missing branches are well-understood problems with known solutions
- Cost extraction: MEDIUM - execution_file format undocumented; hardcoded rate table is reliable fallback per user decision

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days -- pricing and action outputs are relatively stable)
