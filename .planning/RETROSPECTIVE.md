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

## Milestone: v1.1 — Multi-Repo Rollout

**Shipped:** 2026-03-03
**Phases:** 2 | **Plans:** 6 | **Sessions:** ~2

### What Was Built
- Python stack-specific fix prompt with 24 patterns across 6 categories
- Kotlin stack-specific fix prompt (stub for expansion when failures surface)
- Thin caller template with comprehensive ONBOARDING.md
- 8 repos enrolled with working auto-fix across fbetancourtc + LiftitFinOps
- Promotion pipeline: develop→qa auto-PR on fix merge, human gate at qa→main
- Success rate tracking per repo, cost-per-fix tracking via token usage
- Budget alerts at 50%/80% of $200/month threshold

### What Worked
- Start per-repo → extract to central pattern validated: learned what works before abstracting
- deploy-callers.sh script enabled batch deployment across multiple repos
- ONBOARDING.md as single source of truth for enrollment — reduced setup friction
- Explicit secrets passing in callers (not `secrets: inherit`) avoided silent cross-org failures

### What Was Inefficient
- Cross-org `secrets: inherit` discovery required debugging — should have been caught in research
- Liftitapp enrollment blocked on admin approval — couldn't be parallelized
- LiftitFinOps/conciliacion-averias secrets never configured — fell through the cracks

### Key Lessons
1. **Cross-org secrets don't inherit** — always pass explicitly in caller workflows
2. **Admin-gated work should be tracked separately** — don't block milestone completion on external approvals
3. **Secrets audit should be automated** — manual checking missed conciliacion-averias

---

## Milestone: v1.2 — Monitoring & Observability

**Shipped:** 2026-03-10
**Phases:** 3 | **Plans:** 7 | **Sessions:** ~4

### What Was Built
- Vercel serverless webhook receiver with HMAC-SHA256 verification and env gate
- Event routing + filtering: workflow_run.completed, auto-fix PRs, reviews on auto-fix PRs
- Sentry custom metrics module: 7 counters, 3 distributions, 1 gauge covering ops/value/safety
- Redis-backed deduplication (Upstash) with fail-open semantics
- Per-repo cron monitors via captureCheckIn with 7-day interval silence detection
- Setup scripts for Sentry dashboard (12 widgets, 3 panels) and alert rules (4 thresholds)
- CI pipeline: lint + test + security on push/PR, Vercel preview on PR, production deploy on main
- Promotion workflows: develop→qa (auto on CI pass), qa→main (human gate)
- 83 unit tests across 8 test files

### What Worked
- Response-first pattern (200 then waitUntil) kept GitHub happy while doing async processing
- TDD approach in Phase 7 (failing tests first, then implementation) caught edge cases early
- IaC approach for Sentry (scripts + manual fallback docs) covers both automation and fallback
- Strong typing upgrade (Phase 6) with @octokit/webhooks-types eliminated payload guessing
- Modular architecture: each handler is independently testable

### What Was Inefficient
- Vercel may be overengineered for pure Sentry telemetry — but justified as future event hub
- MRI format confidence is LOW — dashboard/alert scripts may need adjustment on first run
- Two working copies of the repo (~/.openclaw/workspace vs ~/auto-fix-agent) caused confusion
- CI workflow first run failed due to secret pattern false positives in sanitize-logs.sh

### Patterns Established
- Webhook handler pattern: env gate → method gate → signature verify → respond → waitUntil(process)
- Dedup pattern: Redis SET NX with TTL, fail-open on connection errors
- Cron monitor pattern: captureCheckIn with interval schedule, gated on processed events only
- CI/CD pipeline: CI on all branches, preview on PR to develop, prod deploy on main push

### Key Lessons
1. **Security checks need exclusion lists** — files that legitimately contain secret patterns (sanitizers, tests) cause false positives
2. **Two repo copies is a footgun** — standardize on one working directory
3. **IaC with manual fallback** — Sentry API is underdocumented for custom metrics; always provide UI instructions
4. **Response-first for webhooks** — never let processing time affect the HTTP response to GitHub

### Cost Observations
- 7 plans executed across 3 phases
- Average plan duration: ~3 min
- 83 tests added (from 0 in v1.1)
- Total new LOC: ~3,500

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 | ~3 | 4 | 7 | Established audit-before-archive pattern, retroactive verification |
| v1.1 | ~2 | 2 | 6 | Multi-org rollout, cross-org secrets learning |
| v1.2 | ~4 | 3 | 7 | TDD, full CI/CD pipeline, IaC for monitoring |

### Cumulative Quality

| Milestone | Tech Debt Items | Requirements Satisfied | Tests | LOC |
|-----------|----------------|----------------------|-------|-----|
| v1.0 | 4 (non-critical) | 19/21 | 0 | ~1,973 |
| v1.1 | 4 (carried) | 22/22 | 0 | ~2,000 |
| v1.2 | 1 (MRI format) | All v1.2 | 83 | ~5,500 |

### Top Lessons (Verified Across Milestones)

1. Verify each phase immediately — don't defer to retroactive passes
2. Milestone audit catches integration bugs that unit-level verification misses
3. Cross-org secrets don't inherit — always pass explicitly
4. Security checks need exclusion lists for files that legitimately contain patterns
5. IaC with manual fallback — always provide UI instructions when APIs are unreliable
