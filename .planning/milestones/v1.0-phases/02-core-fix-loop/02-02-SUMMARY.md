---
phase: 02-core-fix-loop
plan: 02
subsystem: infra
tags: [github-actions, diff-validation, allowed-dirs, git-tools, gh-cli, config-schema]

requires:
  - phase: 02-core-fix-loop
    provides: "head_branch input, flakiness filter, 8-step workflow from Plan 02-01"
provides:
  - "Restructured repo-stack-map.json with defaults.{stack}.allowed_dirs and repos.{repo}.stack schema"
  - "validate-diff.sh script for post-agent diff validation against allowed directories"
  - "Extended Claude Code Action step with git write + gh CLI allowedTools and GH_TOKEN env"
  - "Post-agent diff validation workflow step that reverts forbidden files and force-pushes corrections"
affects: [02-core-fix-loop, 03-multi-repo-rollout]

tech-stack:
  added: []
  patterns:
    - "Config schema: defaults.{stack}.allowed_dirs with per-repo override fallback"
    - "Post-agent validation pattern: agent pushes freely, workflow validates and corrects"
    - "Diff validation via central script called from workflow step (follows sanitize-logs.sh pattern)"

key-files:
  created:
    - "scripts/validate-diff.sh"
  modified:
    - "config/repo-stack-map.json"
    - ".github/workflows/auto-fix.yml"

key-decisions:
  - "Agent receives GH_TOKEN (repo-scoped app token) for gh CLI -- NOT production secrets (satisfies SECR-04)"
  - "Post-agent validation pattern: agent pushes and creates PR freely, workflow validates and corrects after"
  - "validate-diff.sh as central script following sanitize-logs.sh convention"
  - "force-with-lease for safe force-push after amending forbidden file reverts"

patterns-established:
  - "Config DRY: allowed_dirs used by both prompt constraints and post-run validation from same source"
  - "Post-agent validation: workflow step checks, reverts, amends, force-pushes; PR auto-updates"

requirements-completed: [CIFD-02, FIXG-01, FIXG-02, FIXG-03, FIXG-04]

duration: 2min
completed: 2026-03-02
---

# Phase 2 Plan 02: Fix Generation Summary

**Config schema with allowed_dirs, validate-diff.sh for post-agent scope enforcement, extended workflow with agent git/gh capabilities and post-agent diff validation step**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-02T15:15:44Z
- **Completed:** 2026-03-02T15:17:58Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Restructured repo-stack-map.json from flat `{repo: stack}` to `{defaults, repos}` schema with stack-level `allowed_dirs` defaults and per-repo overrides (15 repos, 3 stacks)
- Created validate-diff.sh that checks git diff against allowed_dirs, reverts forbidden files, and uses ::warning:: for GitHub Actions annotations
- Extended Claude Code Action step with git write operations (checkout -b, add, commit, push) and gh CLI commands (pr create, pr list, issue create) plus GH_TOKEN env var
- Added post-agent diff validation step that runs validate-diff.sh, reverts forbidden files if any, amends commit, and force-pushes corrections (PR auto-updates)

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure repo-stack-map.json and create validate-diff.sh** - `fe97bfb` (feat)
2. **Task 2: Extend auto-fix.yml with agent capabilities and post-agent diff validation** - `a037526` (feat)

## Files Created/Modified
- `config/repo-stack-map.json` - Restructured from flat map to defaults/repos schema with allowed_dirs
- `scripts/validate-diff.sh` - Post-agent diff validation script (checks changed files against allowed directories, reverts forbidden ones)
- `.github/workflows/auto-fix.yml` - Extended with issues:write permission, new config schema read, agent git/gh allowedTools, GH_TOKEN env, and post-agent diff validation step

## Decisions Made
- **GH_TOKEN for agent:** The repo-scoped GitHub App installation token is passed to the Claude Code Action step via env block. This is needed for `gh pr create`, `gh pr list` (retry guard), and `gh issue create` (escalation). It is NOT a production secret or deployment trigger -- satisfies SECR-04.
- **Post-agent validation pattern:** The agent pushes and creates PRs freely. A workflow step after the agent validates the diff and corrects if needed. This is simpler than pre-validation and lets the agent work naturally.
- **force-with-lease:** Used for safe force-push when amending the agent's commit to exclude reverted forbidden files. Protects against race conditions.
- **Central script pattern:** validate-diff.sh follows the same convention as sanitize-logs.sh -- standalone script in scripts/ called from workflow.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Workflow now has 9 steps (was 8) with full agent git/gh capabilities and post-agent diff validation
- Agent can create branches, commit, push, and open PRs with structured descriptions
- Post-agent validation ensures forbidden file modifications are reverted automatically
- Config schema supports stack-level defaults with per-repo overrides for allowed_dirs
- Plan 02-03 (PR management) can now add prompt updates with retry guard, human escalation, and git workflow instructions
- Liftitapp org secrets still pending admin action (from Phase 1)

## Self-Check: PASSED

- [x] `config/repo-stack-map.json` exists
- [x] `scripts/validate-diff.sh` exists
- [x] `.github/workflows/auto-fix.yml` exists
- [x] `.planning/phases/02-core-fix-loop/02-02-SUMMARY.md` exists
- [x] Commit `fe97bfb` (Task 1) exists
- [x] Commit `a037526` (Task 2) exists

---
*Phase: 02-core-fix-loop*
*Completed: 2026-03-02*
