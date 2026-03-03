---
phase: quick-2
plan: 01
subsystem: infra
tags: [github-api, caller-workflows, deployment, ci-cd]

requires:
  - phase: 03-multi-repo-rollout
    provides: repo-stack-map.json with all 15 repos, auto-fix-caller.example.yml template
  - phase: 04-promotion-and-observability
    provides: promote-caller.example.yml template, promotion config in repo-stack-map.json
provides:
  - auto-fix-caller.yml deployed to 12 of 15 repos (5 newly deployed Liftitapp repos)
  - promote-caller.yml deployed to all 7 fbetancourtc repos (3 newly deployed)
  - Reusable deploy-callers.sh script for future repo onboarding
affects: [onboarding, multi-repo-rollout]

tech-stack:
  added: []
  patterns: [github-contents-api-deployment, ci-workflow-name-discovery-heuristic]

key-files:
  created:
    - scripts/deploy-callers.sh
  modified: []

key-decisions:
  - "geocoding-liftit-api blocked by read-only access -- logged as deferred item for admin action"
  - "Fixed jq alternative operator bug in deploy-callers.sh: jq // treats false as falsy, used explicit has() check instead"

patterns-established:
  - "GitHub Contents API PUT for deploying workflow files to remote repos"
  - "CI workflow name discovery heuristic: include CI/Build/Test/Pipeline/Checks, exclude Deploy/Release/CD/E2E"

requirements-completed: [CALLER-DEPLOY-LIFTITAPP, PROMOTE-CALLER-REMAINING]

duration: 6min
completed: 2026-03-03
---

# Quick Task 2: Deploy Caller Workflows to Liftitapp and Remaining Repos Summary

**Deployed auto-fix-caller.yml to 5 Liftitapp repos with customized CI workflow names, promote-caller.yml to 3 remaining fbetancourtc repos, and created reusable deploy-callers.sh script**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-03T13:28:12Z
- **Completed:** 2026-03-03T13:34:38Z
- **Tasks:** 3
- **Files modified:** 1 (local), 8 (remote repos)

## Accomplishments

- Deployed auto-fix-caller.yml to 5 Liftitapp repos with correct per-repo CI workflow names (liftit-control-de-asistencia, geocoding-enterprise, conciliacion-recaudo-liftit, liftit-ai-system, liftit-cargo-receptor-de-cumplidos)
- Deployed promote-caller.yml to 3 remaining fbetancourtc repos (lavandarosa-platform, laundry-cleaning-staff, laundry-admin-dash) -- all 7 fbetancourtc repos now have full coverage
- Created scripts/deploy-callers.sh with --dry-run support, CI workflow name discovery, and summary table output
- Correctly skipped averias-marketplace (no CI workflows) and Liftitapp/LiftitFinOps repos for promote-caller (promotion.enabled=false)

## Task Commits

Each task was committed atomically:

1. **Task 1: Deploy auto-fix-caller.yml to Liftitapp repos** - No local commit (remote-only deployments via GitHub Contents API)
   - Remote commits: c5cae69 (liftit-control-de-asistencia), fa0fe1d (geocoding-enterprise), 07e10bc (conciliacion-recaudo-liftit), 904ce69 (liftit-ai-system), a13a656 (liftit-cargo-receptor-de-cumplidos)
2. **Task 2: Deploy promote-caller.yml to 3 fbetancourtc repos** - No local commit (remote-only deployments)
   - Remote commits: 8f58488 (lavandarosa-platform), 76588d5 (laundry-cleaning-staff), 816be35 (laundry-admin-dash)
3. **Task 3: Create deploy-callers.sh** - `892ffd4` (feat)

## Files Created/Modified

- `scripts/deploy-callers.sh` - Reusable deployment script for caller workflows; reads repo-stack-map.json, discovers CI workflow names, deploys both caller types with --dry-run support
- Remote: `.github/workflows/auto-fix-caller.yml` deployed to 5 Liftitapp repos
- Remote: `.github/workflows/promote-caller.yml` deployed to 3 fbetancourtc repos

## Decisions Made

- **geocoding-liftit-api deferred:** Current GitHub token has read-only access to this repo (push=false). Needs Liftitapp org admin to grant write access. Logged as deferred item.
- **jq false-as-falsy fix:** The `//` alternative operator in jq treats `false` as falsy and falls through. Fixed deploy-callers.sh to use explicit `has("enabled")` check instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed jq alternative operator treating false as falsy in deploy-callers.sh**
- **Found during:** Task 3 (deploy-callers.sh creation)
- **Issue:** `jq '.promotion.enabled // "null"'` returns `"null"` when enabled is `false`, because jq's `//` operator treats `false` the same as `null`
- **Fix:** Changed to `jq 'if .promotion | has("enabled") then .promotion.enabled | tostring else "null" end'`
- **Files modified:** scripts/deploy-callers.sh
- **Verification:** dry-run correctly shows Liftitapp repos as "SKIP (disabled)" instead of "WOULD DEPLOY"
- **Committed in:** 892ffd4

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correctness of promotion.enabled logic. No scope creep.

## Issues Encountered

- **Liftitapp/geocoding-liftit-api:** No push access (permissions: pull=true, push=false). The GitHub Contents API returns 404 on PUT. This repo needs admin to grant write access before auto-fix-caller.yml can be deployed. Logged as deferred item.

## Deferred Items

- **geocoding-liftit-api deployment:** Needs Liftitapp org admin to grant push access to fbetancourtc, then re-run `bash scripts/deploy-callers.sh` to deploy auto-fix-caller.yml with `workflows: ["Geocoding CI"]`

## Coverage Summary

| Category | Total | Deployed | Skipped | Reason |
|----------|-------|----------|---------|--------|
| auto-fix-caller.yml (all repos) | 15 | 13 | 2 | averias-marketplace (no CI), geocoding-liftit-api (no push access) |
| promote-caller.yml (fbetancourtc only) | 7 | 7 | 0 | All fbetancourtc repos complete |
| promote-caller.yml (Liftitapp/LiftitFinOps) | 8 | 0 | 8 | promotion.enabled=false (correct) |

## User Setup Required

None - no external service configuration required. All deployments were made via GitHub API.

## Next Steps

- Liftitapp org admin grants push access to geocoding-liftit-api, then run `bash scripts/deploy-callers.sh` to deploy the remaining caller
- averias-marketplace needs CI workflow setup before auto-fix can be activated
- Liftitapp org secrets (ANTHROPIC_API_KEY, AUTO_FIX_APP_PRIVATE_KEY) must be set by admin for callers to function

---
*Quick Task: quick-2*
*Completed: 2026-03-03*
