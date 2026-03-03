# Phase 3: Multi-Repo Rollout - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Expand auto-fix from the validated v1.0 pattern to all 14 repos across 3 GitHub orgs. Expand the Python prompt with common failure patterns. Deliver onboarding template with documentation. Enroll each repo with a working caller and smoke test. Promotion pipelines and observability are Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Rollout Strategy
- Staged by org: fbetancourtc (7 TS repos, full admin) → LiftitFinOps (1 Python repo) → Liftitapp (6 repos, pending admin)
- Skip Liftitapp repos until GitHub App admin approval is granted — phase counts as complete without them
- Prepare Liftitapp caller files so they're ready to activate when admin approves
- Smoke test each repo after enrollment: intentionally break a test, verify auto-fix triggers and creates PR, then revert
- Claude picks delivery method per org based on access level (PRs where possible, docs where not)

### Prompt Expansion
- Python prompt: expand with common CI failure pattern library (import errors, missing deps, fixture issues, async/await bugs, Pydantic v2 migration patterns) — generic enough for all 4 Python repos
- Kotlin prompt: keep current stub — only one Kotlin repo, expand when real failures surface
- TypeScript prompt: no changes — proven in v1.0, don't touch what works
- No CI history mining — agent reads live logs each run, repo-specific pre-training has diminishing returns
- Stack-level prompts only — no per-repo prompt tweaks

### Onboarding Template
- Deliver: caller YAML file + onboarding documentation (README section or ONBOARDING.md)
- Docs include: what auto-fix does, how to customize workflow names, what secrets to set, how to verify it works
- Each repo edits the `workflows: [CI]` list in their caller YAML to match their CI workflow name(s)
- Secrets setup: Claude picks per org — org-level secrets where possible, repo-level as fallback

### Per-Repo Customization
- `allowed_dirs` in repo-stack-map.json: stack defaults apply; per-repo overrides only when repo has non-standard structure
- Claude audits each repo's directory structure during research and flags non-standard repos for overrides
- Enroll all 14 repos — no exclusions

### Claude's Discretion
- Exact smoke test implementation (manual break-and-fix vs dedicated test workflow)
- Delivery method per org (PRs vs documentation vs scripted setup)
- Secrets configuration approach per org (org-level vs repo-level)
- Whether any repo besides liftit-control-de-asistencia needs custom allowed_dirs
- Onboarding doc format (README section vs standalone ONBOARDING.md)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auto-fix-caller.example.yml`: Working 15-line thin caller template — base for all repo callers
- `auto-fix.yml`: Production reusable workflow with circuit-breaker, log retrieval, sanitization, prompt loading, Claude Code Action
- `prompts/python.md`: Python stub with FastAPI/pytest/ruff/mypy — needs expansion with common failure patterns
- `prompts/kotlin.md`: Kotlin stub with Android/Gradle/ktlint/detekt — adequate for now
- `prompts/typescript.md`: Production-grade TS prompt — no changes needed
- `config/repo-stack-map.json`: All 14 repos already mapped with stacks and some custom allowed_dirs
- `scripts/validate-diff.sh`: Post-agent diff validation — works with any stack
- `scripts/sanitize-logs.sh`: Log sanitization — stack-agnostic

### Established Patterns
- Caller workflow uses `workflow_run` trigger with `if: conclusion == 'failure'`
- Secrets passed explicitly via `secrets:` block (cross-org `secrets: inherit` fails silently)
- Central repo checked out to `_auto-fix-scripts/` path for script/config access
- `allowedTools` restricts agent capabilities in Claude Code Action
- Post-agent validation via validate-diff.sh checks against allowed_dirs from repo-stack-map.json

### Integration Points
- Each target repo needs: `.github/workflows/auto-fix-caller.yml` on default branch
- Each target repo/org needs: `ANTHROPIC_API_KEY` and `AUTO_FIX_APP_PRIVATE_KEY` secrets
- GitHub App (ID: 2985828) must be installed on the org (fbetancourtc ✓, LiftitFinOps ✓, Liftitapp ✗)
- `repo-stack-map.json` may need `allowed_dirs` overrides for repos with non-standard structures

</code_context>

<specifics>
## Specific Ideas

- The existing `auto-fix-caller.example.yml` is the proven template — start from this for all repos
- liftit-control-de-asistencia already has custom `allowed_dirs` with 3 directories — this is the model for per-repo overrides
- Cross-org secrets lesson from v1.0: callers MUST explicitly pass secrets, never rely on `secrets: inherit`

</specifics>

<deferred>
## Deferred Ideas

- `@claude` interactive code review via PR comments — separate capability, not rollout
- develop→qa→main promotion pipeline — Phase 4
- Success rate tracking per repo — Phase 4
- Expanding Kotlin prompt when real failures surface — revisit after initial enrollment

</deferred>

---

*Phase: 03-multi-repo-rollout*
*Context gathered: 2026-03-02*
