---
phase: 03-multi-repo-rollout
plan: 03
subsystem: docs, ci
tags: [liftitapp, github-app, caller-workflow, activation-guide]

requires:
  - phase: 03-multi-repo-rollout
    provides: "ONBOARDING.md enrollment guide and caller template pattern"
provides:
  - "Liftitapp activation guide with audited CI workflow names for 7 repos"
  - "Copy-paste deploy commands for 6 repos ready for immediate activation"
affects: []

tech-stack:
  added: []
  patterns: ["per-repo caller YAML with discovered CI workflow names and correct default branches"]

key-files:
  created: [.planning/phases/03-multi-repo-rollout/liftitapp-activation.md]
  modified: []

key-decisions:
  - "Included all 7 Liftitapp repos from repo-stack-map.json (plan said 6, map has 7)"
  - "averias-marketplace flagged as needing CI setup before auto-fix activation (no workflows exist)"
  - "liftit-ai-system: selected Pull Request Checks + E2E Tests as CI triggers (excluded deployment pipelines)"

patterns-established:
  - "Activation guide pattern: per-repo section with workflow names, caller YAML, deploy command"

requirements-completed: [ENROLLMENT]

duration: 4min
completed: 2026-03-03
---

# Phase 3 Plan 3: Liftitapp Activation Guide Summary

**Audited CI workflows across 7 Liftitapp repos and created copy-paste activation guide with per-repo caller YAML, deploy commands, and checklist for 5-minute enrollment after admin approves GitHub App**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-03T03:17:58Z
- **Completed:** 2026-03-03T03:21:55Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Audited CI workflow names and default branches for all 7 Liftitapp repos via GitHub API
- Created comprehensive activation guide with exact caller YAML content per repo
- Included `gh api` deploy commands targeting each repo's correct default branch
- Identified averias-marketplace has no CI workflows (needs setup before auto-fix)
- Documented varying default branches: main (3), develop (2), master (1), production (1)

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit Liftitapp repos and prepare activation documentation** - `c94098a` (docs)

## Files Created/Modified
- `.planning/phases/03-multi-repo-rollout/liftitapp-activation.md` - Complete activation guide with per-repo caller configs, deploy commands, and activation checklist

## Decisions Made
- Included 7 repos (not 6 as plan title stated) since repo-stack-map.json lists 7 Liftitapp repos
- Flagged averias-marketplace as requiring CI setup before auto-fix can be activated (no .github/workflows directory)
- Selected "Pull Request Checks" and "E2E Tests" as CI triggers for liftit-ai-system (excluded deployment/production pipelines)
- No additional allowed_dirs overrides needed -- only liftit-control-de-asistencia has custom dirs (already in repo-stack-map.json)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Included 7th repo (liftit-cargo-receptor-de-cumplidos)**
- **Found during:** Task 1 (repo audit)
- **Issue:** Plan title says "6 Liftitapp repos" but repo-stack-map.json lists 7 including liftit-cargo-receptor-de-cumplidos
- **Fix:** Included all 7 repos in the activation guide for completeness
- **Files modified:** liftitapp-activation.md
- **Verification:** All 7 repo names present in activation guide
- **Committed in:** c94098a

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Ensures no Liftitapp repo is left out. No scope creep.

## Issues Encountered
- averias-marketplace has no `.github/workflows/` directory at all -- noted in activation guide as needing CI setup first

## User Setup Required
None -- no external service configuration required. Activation is blocked on Liftitapp admin approving GitHub App installation.

## Next Phase Readiness
- All Liftitapp repos documented and ready for activation when admin approves
- Phase 3 complete -- all 3 plans executed (Python prompt, enrollment, Liftitapp prep)
- No blockers for Phase 4 (promotion pipelines and observability)

## Self-Check: PASSED

- liftitapp-activation.md: FOUND
- 03-03-SUMMARY.md: FOUND
- Commit c94098a: FOUND

---
*Phase: 03-multi-repo-rollout*
*Completed: 2026-03-03*
