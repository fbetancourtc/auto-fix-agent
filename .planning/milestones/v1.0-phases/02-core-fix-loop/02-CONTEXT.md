# Phase 2: Core Fix Loop - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

When CI fails on a monitored repo, the agent automatically retrieves logs, diagnoses the failure, implements a source-code-only fix, and opens a labeled PR targeting develop — with a flakiness filter, retry guard (max 2 attempts), and human escalation. Validated end-to-end on `Liftitapp/liftit-control-de-asistencia` and all platform apps. Multi-repo rollout and promotion pipelines are separate phases.

</domain>

<decisions>
## Implementation Decisions

### CI Trigger & Caller Workflow
- Monitor ALL CI workflows on each repo (any `workflow_run` failure triggers the agent)
- Fire on ALL branches, not just default branch — feature branch failures are also fixed
- Caller workflow stays under 15 lines (CIFD-04)
- Each failure triggers independently — no batching/debouncing of concurrent failures

### Flakiness Filter
- Re-run the exact failed job once before invoking the agent
- Wait up to the job's own timeout-minutes setting — no extra hard cap
- If the re-run passes, skip the agent and add a workflow annotation: "Flaky failure detected — passed on re-run, agent skipped"

### Fix Branch & Commit
- Branch naming: `auto-fix/{run-id}` (e.g., `auto-fix/12345678`)
- Agent uses git directly (checkout -b, add, commit, push) — added to allowedTools
- Commit messages follow conventional commits format (e.g., `fix(auth): resolve null pointer in login handler`)

### PR Creation & Format
- Agent creates PR itself via `gh pr create` (already in allowedTools)
- PR always targets the `develop` branch (develop→QA→main promotion is Phase 4)
- Apply `auto-fix` label only — existing CODEOWNERS/branch protection handles reviewer assignment
- Structured PR description with sections: Root Cause Analysis, Changes Made, Verification Results
- Agent also gets `gh pr list` access for retry guard checks

### Retry Guard
- Agent checks retry count itself (needs `gh pr list` in allowedTools)
- Count existing open/closed PRs with `auto-fix` label on the same base branch + failure context
- Max 2 fix attempts per failure

### Human Escalation
- After 2 failed attempts, create a GitHub Issue on the failing repo (not central repo)
- Issue labeled `needs-human`
- Issue body includes: failure summary, links to both attempt PRs, link to original CI run, AND full sanitized CI logs inline

### Scope Enforcement & Diff Validation
- Allowed source directories centrally configured in repo-stack-map.json (same list used for both prompt constraints and post-run validation — DRY)
- Post-run diff validation checks all changed files against allowed directories
- If agent modifies a forbidden file: revert those files (git checkout), then create PR with only allowed changes
- If the agent's fix doesn't actually resolve the CI failure (tests still fail): abort — no PR created, but counts as one attempt toward the 2-attempt limit

### Pilot Repo
- Primary pilot: `Liftitapp/liftit-control-de-asistencia` (Kotlin, cross-org)
- Test across all platform apps
- Note: repo is Kotlin (not TypeScript), but the fix loop is stack-agnostic

### Claude's Discretion
- Diff validation implementation approach (central script vs inline — follow existing pattern)
- Allowed directory config structure (stack-level defaults vs per-repo overrides — must scale to 14 repos)
- Exact flakiness re-run polling mechanism
- PR description template formatting details
- How the retry guard correlates failures across runs (SHA-based vs branch-based matching)

</decisions>

<specifics>
## Specific Ideas

- Branch flow is always: fix PR → develop → QA → main (promotion pipeline in Phase 4)
- "All platform apps" should be enrolled as pilots, not just one repo
- The circuit-breaker already checks for `auto-fix/` branch prefix — branch naming scheme (`auto-fix/{run-id}`) is compatible

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auto-fix.yml`: Reusable workflow with circuit-breaker, log retrieval, sanitization, prompt loading, Claude Code Action invocation — Phase 2 extends this
- `scripts/sanitize-logs.sh`: Log sanitization script — will be used for CI log cleanup before agent ingestion
- `prompts/typescript.md`: Stack-specific prompt with directory constraints and common failure patterns — defines allowed/forbidden directories
- `prompts/kotlin.md`, `prompts/python.md`: Other stack prompts available
- `config/repo-stack-map.json`: Maps all 14 repos to stacks — will be extended with allowed directories

### Established Patterns
- Security checks run as `actions/github-script@v7` steps (circuit-breaker pattern)
- Untrusted content uses env indirection (not inline `${{ }}`) — follow for all new steps
- Central repo is checked out to `_auto-fix-scripts/` path for script/config access
- `allowedTools` in Claude Code Action restricts agent capabilities

### Integration Points
- New caller workflow goes in each pilot repo's `.github/workflows/` directory
- New steps (flakiness filter, retry guard, diff validation) are added to `auto-fix.yml`
- `repo-stack-map.json` needs `allowed_dirs` field added per repo or per stack
- `allowedTools` needs: git commands, `gh pr list`, `gh pr create`, `gh issue create`

</code_context>

<deferred>
## Deferred Ideas

- develop→QA→main promotion pipeline — Phase 4 (PROM-01, PROM-02)
- Batching/debouncing concurrent failures — revisit if duplicate PRs become a problem
- Central tracking dashboard for escalated issues — Phase 4 observability

</deferred>

---

*Phase: 02-core-fix-loop*
*Context gathered: 2026-03-02*
