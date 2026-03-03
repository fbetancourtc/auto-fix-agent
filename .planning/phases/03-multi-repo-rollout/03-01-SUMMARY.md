---
phase: 03-multi-repo-rollout
plan: 01
subsystem: prompts, docs
tags: [python, pytest, pydantic, ruff, onboarding, ci]

requires:
  - phase: 02-core-fix-loop
    provides: "TypeScript prompt pattern to mirror for Python depth"
provides:
  - "Expanded Python fix prompt with 24 patterns across 6 categories"
  - "ONBOARDING.md self-service enrollment guide for new repos"
affects: [03-02, 03-03]

tech-stack:
  added: []
  patterns: ["bold-keyword + multi-sentence guidance for prompt patterns"]

key-files:
  created: [ONBOARDING.md]
  modified: [prompts/python.md]

key-decisions:
  - "Kotlin prompt left unchanged per user decision -- expand when real failures surface"
  - "ONBOARDING.md placed at repo root for discoverability (not in .planning/)"

patterns-established:
  - "Prompt pattern format: H3 category > bold sub-pattern > multi-sentence guidance"

requirements-completed: [PYTHON-PROMPT, KOTLIN-PROMPT, ONBOARDING]

duration: 2min
completed: 2026-03-03
---

# Phase 3 Plan 1: Expand Python Prompt + Create ONBOARDING.md Summary

**Python fix prompt expanded from 4 bullets to 24 patterns across 6 categories (Import Errors, Dependencies, Fixtures, Async, Pydantic v2, Ruff), plus self-service ONBOARDING.md for repo enrollment**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T02:59:03Z
- **Completed:** 2026-03-03T03:01:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Python prompt now matches TypeScript prompt depth with 24 detailed sub-patterns
- ONBOARDING.md covers full enrollment lifecycle: secrets, registration, caller deployment, smoke test, troubleshooting
- Kotlin prompt verified unchanged (user decision honored)

## Task Commits

Each task was committed atomically:

1. **Task 1: Expand Python prompt with 6 failure pattern categories** - `a2215b1` (feat)
2. **Task 2: Create ONBOARDING.md with complete enrollment guide** - `b3217a5` (feat)

## Files Created/Modified
- `prompts/python.md` - Expanded Common Patterns from 4 bullets to 6 categories with 24 sub-patterns
- `ONBOARDING.md` - Complete repo enrollment guide with prerequisites, secrets, caller deployment, smoke test, troubleshooting

## Decisions Made
- Kotlin prompt left as-is per user decision (expand when real Kotlin CI failures surface)
- Placed ONBOARDING.md at repo root for maximum discoverability

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Python prompt ready for production use on all Python repos
- ONBOARDING.md ready for 03-02 (repo enrollment) and 03-03 (Liftitapp guide)
- No blockers for next plans

---
*Phase: 03-multi-repo-rollout*
*Completed: 2026-03-03*
