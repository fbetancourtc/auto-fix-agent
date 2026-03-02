---
phase: 02-core-fix-loop
plan: 03
subsystem: prompts
tags: [github-actions, pr-management, retry-guard, escalation, conventional-commits]

# Dependency graph
requires:
  - phase: 02-core-fix-loop/02-02
    provides: "Agent allowedTools with git/gh commands, GH_TOKEN env var, post-agent diff validation"
provides:
  - "Stack prompts with complete fix-loop instructions (git workflow, retry guard, escalation, PR description)"
  - "Workflow env vars (RUN_ID, HEAD_BRANCH, TARGET_REPO) passed to agent step"
  - "No-commit tracking step for counting failed attempts"
affects: [03-multi-repo-rollout, 04-observability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retry guard via gh pr list counting auto-fix labeled PRs"
    - "No-commit tracking via closed PR marker"
    - "Structured PR description template (Root Cause Analysis, Changes Made, Verification Results)"
    - "Escalation to needs-human GitHub Issue after 2 failed attempts"

key-files:
  created: []
  modified:
    - ".github/workflows/auto-fix.yml"
    - "prompts/typescript.md"
    - "prompts/python.md"
    - "prompts/kotlin.md"

key-decisions:
  - "No-commit tracking uses closed PR as lightweight marker rather than GitHub Actions cache or artifacts"
  - "Retry guard counts all auto-fix/ prefixed PRs (open + closed) to include both successful and failed attempts"

patterns-established:
  - "Identical workflow sections across all stack prompts -- Before You Start, Fix Workflow, Escalation"
  - "Environment variable indirection for agent context (RUN_ID, HEAD_BRANCH, TARGET_REPO)"

requirements-completed: [PRMG-01, PRMG-02, PRMG-03, PRMG-04, PRMG-05]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 2 Plan 3: PR Management Summary

**Stack prompts with complete git/PR workflow, 2-attempt retry guard via gh pr list, needs-human escalation, and structured PR descriptions with Root Cause Analysis sections**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T15:21:01Z
- **Completed:** 2026-03-02T15:23:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Wired RUN_ID, HEAD_BRANCH, and TARGET_REPO env vars from workflow inputs to the agent step
- Added no-commit tracking step that creates a closed PR marker when agent stops without committing, ensuring retry guard counts all attempts
- Updated all three stack prompts (TypeScript, Python, Kotlin) with identical fix-loop instructions: retry guard, branch creation, conventional commits, PR creation, and human escalation
- Structured PR description template enforces Root Cause Analysis, Changes Made, and Verification Results sections
- Human review gate enforced architecturally by omitting gh pr merge from allowedTools (PRMG-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add env vars and no-commit tracking** - `52a2662` (feat)
2. **Task 2: Update stack prompts with git workflow, retry guard, escalation** - `373940c` (feat)

## Files Created/Modified
- `.github/workflows/auto-fix.yml` - Added RUN_ID/HEAD_BRANCH/TARGET_REPO env vars to agent step, added track-attempt step for no-commit detection
- `prompts/typescript.md` - Added Before You Start, Fix Workflow, Escalation sections and updated Output section
- `prompts/python.md` - Added Before You Start, Fix Workflow, Escalation sections and updated Output section
- `prompts/kotlin.md` - Added Before You Start, Fix Workflow, Escalation sections and updated Output section

## Decisions Made
- Used closed PR as the no-commit tracking marker (lightweight, visible in PR history, countable by retry guard's gh pr list query)
- Retry guard counts ALL auto-fix/ prefixed PRs in any state (open, closed, merged) to capture both successful fixes and failed attempts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 (Core Fix Loop) is now complete: workflow triggers, agent tools, fix generation, and PR management are all wired up
- Ready for Phase 3: Multi-repo rollout with caller workflows and per-org configuration

## Self-Check: PASSED

All 4 modified files exist on disk. Both task commits (52a2662, 373940c) verified in git log.

---
*Phase: 02-core-fix-loop*
*Completed: 2026-03-02*
