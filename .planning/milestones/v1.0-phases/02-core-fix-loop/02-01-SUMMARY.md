---
phase: 02-core-fix-loop
plan: 01
subsystem: infra
tags: [github-actions, workflow-run, flakiness-filter, ci-detection]

requires:
  - phase: 01-infrastructure-and-security-guardrails
    provides: "Reusable auto-fix.yml workflow with circuit breaker, log sanitization, prompt loading, and Claude Code Action"
provides:
  - "head_branch input on auto-fix.yml for correct branch checkout"
  - "Flakiness filter step that re-runs failed jobs and skips agent on transient failures"
  - "Example caller workflow for repos to opt into auto-fix via workflow_run trigger"
affects: [02-core-fix-loop, 03-multi-repo-rollout]

tech-stack:
  added: []
  patterns:
    - "Flakiness filter via actions/github-script polling reRunWorkflowFailedJobs on same run_id"
    - "Flow-style YAML secrets to meet 15-line caller limit with 4 inputs"

key-files:
  created:
    - ".github/workflows/auto-fix-caller.example.yml"
  modified:
    - ".github/workflows/auto-fix.yml"

key-decisions:
  - "No hard cap on flakiness poll -- rely on GitHub's job timeout-minutes as the cap (user decision)"
  - "Secrets in flow-style YAML to keep caller at exactly 15 lines with 4 inputs (head_branch added a 4th)"

patterns-established:
  - "Caller workflow pattern: workflow_run trigger + single uses: call with inputs/secrets"
  - "Conditional step gating: circuit breaker AND flakiness filter both must pass for downstream steps"

requirements-completed: [CIFD-01, CIFD-03, CIFD-04]

duration: 3min
completed: 2026-03-02
---

# Phase 2 Plan 01: CI Failure Detection Summary

**head_branch input for correct branch checkout, flakiness filter re-running failed jobs via REST API polling, and 15-line caller workflow example using workflow_run trigger**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T15:08:01Z
- **Completed:** 2026-03-02T15:11:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `head_branch` input to `auto-fix.yml` so the agent checks out the branch where CI actually failed, not the default branch
- Inserted flakiness filter step that re-runs failed jobs via `reRunWorkflowFailedJobs` REST API, polls completion, and skips the agent if the re-run passes (with `core.notice()` annotation)
- Created example caller workflow at 15 YAML lines demonstrating the complete `workflow_run` trigger pattern for any repo to opt in

## Task Commits

Each task was committed atomically:

1. **Task 1: Add head_branch input and flakiness filter to auto-fix.yml** - `0977a7c` (feat)
2. **Task 2: Create example caller workflow for pilot repos** - `c7e7a5a` (feat)

## Files Created/Modified
- `.github/workflows/auto-fix.yml` - Extended with head_branch input, ref on checkout, flakiness filter step, updated if conditions on all downstream steps
- `.github/workflows/auto-fix-caller.example.yml` - New thin caller workflow example for repos to copy and customize

## Decisions Made
- **No polling hard cap:** The flakiness filter polls without a time limit, relying on GitHub's own `timeout-minutes` on the job as the cap. This was a locked user decision from CONTEXT.md.
- **Flow-style secrets in caller:** Used YAML flow syntax for `secrets:` block to fit within the 15-line CIFD-04 limit. The plan's original example code was 17 lines because `head_branch` (a 4th input) wasn't accounted for in the 12-line estimate from CIFD-04. Flow-style secrets saved 2 lines.
- **Step renumbering:** Steps renumbered 1-8 (was 1-7) to account for the new flakiness filter at position 5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Compacted caller workflow to meet 15-line limit**
- **Found during:** Task 2 (Create example caller workflow)
- **Issue:** The plan's own code example produced 17 YAML lines (4 inputs + 2 secrets expanded), exceeding the CIFD-04 limit of 15 lines. The 4th input `head_branch` was not accounted for in the original 12-line estimate.
- **Fix:** Used YAML flow-style syntax for the `secrets:` block, reducing 3 lines (key: secrets, two children) to 1 line. Result: exactly 15 YAML lines.
- **Files modified:** `.github/workflows/auto-fix-caller.example.yml`
- **Verification:** `grep -v "^#" | grep -v "^$" | wc -l` = 15, YAML validation passes
- **Committed in:** c7e7a5a

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to meet CIFD-04 requirement. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `auto-fix.yml` now has 8 steps (was 7) with flakiness filter gating all downstream steps
- Caller workflow example ready for repos to copy -- must be merged to default branch to trigger
- Plan 02-02 (fix generation) can extend the workflow with additional steps after step 8
- Plan 02-03 (PR management) can add agent env vars and prompt updates for git/PR operations
- Liftitapp org secrets still pending admin action (from Phase 1)

## Self-Check: PASSED

- [x] `.github/workflows/auto-fix.yml` exists
- [x] `.github/workflows/auto-fix-caller.example.yml` exists
- [x] `.planning/phases/02-core-fix-loop/02-01-SUMMARY.md` exists
- [x] Commit `0977a7c` (Task 1) exists
- [x] Commit `c7e7a5a` (Task 2) exists

---
*Phase: 02-core-fix-loop*
*Completed: 2026-03-02*
