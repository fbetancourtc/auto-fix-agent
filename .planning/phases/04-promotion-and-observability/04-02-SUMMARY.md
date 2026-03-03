---
phase: 04-promotion-and-observability
plan: 02
subsystem: observability
tags: [metrics, budget-alerts, cost-tracking, github-actions, jq, bash]

# Dependency graph
requires:
  - phase: 02-core-fix-loop
    provides: "auto-fix.yml workflow with Claude Code Action step producing execution_file output"
provides:
  - "Per-run cost tracking appended to metrics/runs.json"
  - "Success rate per repo derivable from runs.json outcome field"
  - "Budget alerts as GitHub Issues at 50%/80%/100% thresholds with dedup"
  - "GitHub Actions summary table with per-run metrics"
  - "Pricing rate table for Anthropic models"
affects: [future-dashboards, cost-optimization, budget-management]

# Tech tracking
tech-stack:
  added: [jq, awk]
  patterns: [two-strategy-cost-extraction, retry-push-loop, threshold-dedup-via-gh-issue-search]

key-files:
  created:
    - config/pricing.json
    - metrics/runs.json
    - scripts/record-metrics.sh
    - scripts/check-budget.sh
  modified:
    - .github/workflows/auto-fix.yml

key-decisions:
  - "Two-strategy cost extraction: execution_file parsing first, rate-table fallback second"
  - "No job-level concurrency for metrics -- retry-push-loop in script handles concurrent writes"
  - "Added token to central repo checkout step so record-metrics.sh can push metrics back"
  - "Budget thresholds read from config/pricing.json not hardcoded in scripts"

patterns-established:
  - "Metrics append pattern: jq append to JSON array + git push with pull-rebase retry"
  - "Budget alert dedup: gh issue list --search for threshold+month before creating"
  - "Metrics steps use if: always() with circuit breaker and flaky filter guards"

requirements-completed:
  - "Success rate tracking per repo"
  - "Cost-per-fix tracking via token usage output"
  - "Budget alerts at 50%/80% of $200/month threshold"

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 4 Plan 2: Observability Summary

**Per-run cost tracking with two-strategy extraction (execution_file + rate-table fallback), budget alerts via GitHub Issues at configurable thresholds, and GitHub Actions summary table**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T04:24:43Z
- **Completed:** 2026-03-03T04:27:20Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments
- Pricing rate table for Sonnet/Opus/Haiku with $200/month budget configuration
- record-metrics.sh with two-strategy cost extraction, metrics append, concurrent push handling, and GitHub Actions summary
- check-budget.sh with threshold loop, dedup via gh issue search, and configurable alert levels
- auto-fix.yml extended with fix outcome detection (step 11) and metrics recording (step 12), both using if: always() guards

## Task Commits

Each task was committed atomically:

1. **Task 1: Create pricing.json, metrics seed file, and record-metrics.sh script** - `485fc7c` (feat)
2. **Task 2: Create check-budget.sh and wire metrics steps into auto-fix.yml** - `00b9707` (feat)

## Files Created/Modified
- `config/pricing.json` - Anthropic model rate table with budget config ($200/mo, 50/80/100% thresholds)
- `metrics/runs.json` - Empty seed file for run history
- `scripts/record-metrics.sh` - Extracts cost, appends run entry, writes GitHub Actions summary, pushes metrics
- `scripts/check-budget.sh` - Checks monthly spend against thresholds, creates deduped GitHub Issues
- `.github/workflows/auto-fix.yml` - Added steps 11-12 (fix outcome + record metrics), sparse-checkout includes metrics/, central repo checkout gets token

## Decisions Made
- Two-strategy cost extraction: parse execution_file for total_cost_usd first, fall back to rate-table estimate using pricing.json. This handles both cases where claude-code-action provides cost data and where it does not.
- No job-level concurrency added to the workflow. The retry-push-loop in record-metrics.sh (3 attempts with pull-rebase) is sufficient for the expected volume of 1-5 runs per day.
- Added token to the central repo checkout step (step 2) so that record-metrics.sh can authenticate for git push back to the auto-fix-agent repo.
- Budget thresholds read dynamically from config/pricing.json rather than hardcoded, making them configurable without script changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added token to central repo checkout step**
- **Found during:** Task 2 (wiring metrics into auto-fix.yml)
- **Issue:** The central repo checkout (step 2) did not include a token, which means record-metrics.sh would fail trying to push metrics back to the repo (authentication required for git push)
- **Fix:** Added `token: ${{ steps.app-token.outputs.token }}` to the central repo checkout step
- **Files modified:** .github/workflows/auto-fix.yml
- **Verification:** YAML valid, token present in checkout step
- **Committed in:** 00b9707 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for metrics push functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Observability infrastructure complete: every auto-fix run will record cost and outcome
- Budget alerts will fire at configurable thresholds as GitHub Issues
- Success rate per repo derivable by filtering metrics/runs.json by repository and outcome fields
- Ready for dashboard visualization or additional analytics in future phases

## Self-Check: PASSED

All files exist, all commits verified (485fc7c, 00b9707).

---
*Phase: 04-promotion-and-observability*
*Completed: 2026-03-03*
