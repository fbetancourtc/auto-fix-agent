---
phase: 04-promotion-and-observability
plan: 01
subsystem: infra
tags: [github-actions, promotion, workflow-call, gh-cli, branching]

# Dependency graph
requires:
  - phase: 02-core-fix-loop
    provides: "auto-fix.yml reusable workflow pattern and auto-fix label convention"
  - phase: 03-multi-repo-rollout
    provides: "repo-stack-map.json with 15 repos and caller deployment pattern"
provides:
  - "promote.yml reusable workflow for develop->qa and qa->main PR creation"
  - "promote-caller.example.yml thin caller template for per-repo deployment"
  - "repo-stack-map.json promotion config (enabled/disabled per repo)"
affects: [04-02-observability, onboarding, activation-guides]

# Tech tracking
tech-stack:
  added: []
  patterns: [duplicate-PR-detection, manual-merge-gate, promotion-branch-config]

key-files:
  created:
    - .github/workflows/promote.yml
    - .github/workflows/promote-caller.example.yml
  modified:
    - config/repo-stack-map.json

key-decisions:
  - "promote.yml uses same actions/create-github-app-token@v2 pattern as auto-fix.yml for consistency"
  - "Liftitapp and LiftitFinOps repos default promotion.enabled=false pending admin and branch audit"
  - "qa->main PR is NEVER auto-merged -- human must click Merge (locked design decision)"

patterns-established:
  - "Duplicate PR detection: always check gh pr list before gh pr create to prevent duplicates"
  - "Manual merge gate: create PR but never call gh pr merge for production promotions"
  - "Promotion config in repo-stack-map.json: per-repo enabled flag documents deployment readiness"

requirements-completed:
  - "Auto-create develop->qa PR when fix PR merges"
  - "Human approval gate for qa->main promotion"

# Metrics
duration: 2min
completed: 2026-03-03
---

# Phase 4 Plan 1: Promotion Pipeline Summary

**Reusable GitHub Actions promotion workflow creating develop->qa and qa->main PRs with duplicate detection and human approval gate**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-03T04:24:39Z
- **Completed:** 2026-03-03T04:26:25Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Reusable promote.yml workflow with 3 steps: token generation, develop->qa PR, qa->main PR
- Promote-caller.example.yml thin caller triggered on merged auto-fix PRs (label-gated)
- repo-stack-map.json extended with promotion config (fbetancourtc enabled, Liftitapp/LiftitFinOps disabled)
- Duplicate PR detection prevents repeated PR creation on re-runs
- No auto-merge anywhere in the promotion flow -- human approval gate preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Create promote.yml reusable workflow and promote-caller template** - `b60b868` (feat)
2. **Task 2: Extend repo-stack-map.json with promotion configuration** - `a44d4a2` (feat)

## Files Created/Modified
- `.github/workflows/promote.yml` - Reusable promotion workflow with develop->qa and qa->main PR creation
- `.github/workflows/promote-caller.example.yml` - Thin caller template for per-repo deployment
- `config/repo-stack-map.json` - Extended with defaults.promotion and per-repo promotion.enabled overrides

## Decisions Made
- Used same actions/create-github-app-token@v2 pattern as auto-fix.yml for cross-org token consistency
- Liftitapp and LiftitFinOps repos default to promotion.enabled=false (pending admin and branch strategy audit)
- qa->main PR never auto-merged -- locked design decision, human must click Merge
- Caller only needs app_private_key secret (no anthropic_api_key since no AI involved in promotion)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Promotion workflow ready for deployment to fbetancourtc repos via promote-caller.yml
- Liftitapp repos need admin approval and branch audit before enabling promotion
- ONBOARDING.md should be updated to reference promote-caller.example.yml in activation steps
- Plan 04-02 (Observability) can proceed independently

---
*Phase: 04-promotion-and-observability*
*Completed: 2026-03-03*
