# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-02
**Phases:** 4 | **Plans:** 7 | **Sessions:** ~3

### What Was Built
- Reusable auto-fix workflow with cross-org GitHub App auth and stack-specific prompt library
- Full security guardrail suite: input sanitization, circuit breaker, token limits, scope restriction
- End-to-end fix loop: CI failure detection → flakiness filter → agent fix → PR with retry guard → human escalation
- Post-agent diff validation ensuring agent stays within allowed source directories
- Integration hardening pass fixing 6 audit-discovered bugs

### What Worked
- Security-first approach: building all guardrails before any trigger fires prevented early mistakes
- Post-agent validation pattern: letting the agent push freely then validating/correcting is simpler than pre-validation
- Milestone audit mid-development caught 6 integration bugs and drove Phases 2.1/2.2 for cleanup
- Atomic plan execution with SUMMARY.md tracking kept phases focused and reviewable
- Config DRY pattern: allowed_dirs in one config file used by both prompts and validation

### What Was Inefficient
- Phase 1 had no formal verification pass — required Phase 2.2 retroactive verification to close the gap
- Retry guard counts repo-wide instead of per-run, creating premature escalation risk (tech debt)
- CIFD-02 silent log fallback means agent wastes a retry on empty context (tech debt)
- Two context exhaustion events during milestone completion workflow

### Patterns Established
- Central script convention: standalone scripts in `scripts/` called from workflow steps (sanitize-logs.sh, validate-diff.sh)
- Caller workflow pattern: `workflow_run` trigger + single `uses:` call with flow-style secrets
- Post-commit validation: `HEAD~1..HEAD` diff for checking agent's most recent commit
- Prompt structure: identical Before You Start / Fix Workflow / Escalation sections across all stack prompts
- Phase verification should happen immediately after phase completion, not retroactively

### Key Lessons
1. **Run verification immediately** — deferring Phase 1 verification created rework; verify each phase before starting the next
2. **Audit before archiving** — the milestone audit surfaced real integration bugs that would have shipped as-is
3. **Fail-open for non-critical paths** — circuit breaker failing open on API errors is the right default for a fix-assistance system
4. **Config-driven constraints** — having allowed_dirs in config rather than hardcoded prevents prompt/validation drift

### Cost Observations
- Model mix: primarily opus for plan execution
- Sessions: ~3 (init + execution + milestone completion)
- Notable: 7 plans executed in ~13 min total (avg 2.6 min/plan) — highly efficient

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~3 | 4 | Established audit-before-archive pattern, retroactive verification |

### Cumulative Quality

| Milestone | Tech Debt Items | Requirements Satisfied | External State |
|-----------|----------------|----------------------|----------------|
| v1.0 | 4 (non-critical) | 19/21 | 2 (FOUND-02, FOUND-03) |

### Top Lessons (Verified Across Milestones)

1. Verify each phase immediately — don't defer to retroactive passes
2. Milestone audit catches integration bugs that unit-level verification misses
