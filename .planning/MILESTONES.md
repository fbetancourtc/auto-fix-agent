# Milestones

## v1.1 Multi-Repo Rollout & Observability (Shipped: 2026-03-03)

**Phases completed:** 2 phases, 6 plans + 1 quick task
**Timeline:** 2 days (2026-03-02 → 2026-03-03)
**Source LOC:** 1,973 lines (YAML, Shell, JSON, Markdown)
**Files changed:** 34 files, +4,547 lines

**Key accomplishments:**
- Python fix prompt expanded from 4 bullets to 24 patterns across 6 categories (Import Errors, Dependencies, Fixtures, Async, Pydantic v2, Ruff)
- 8 repos enrolled with auto-fix callers (7 fbetancourtc + 1 LiftitFinOps), secrets configured, CI workflow names matched
- Liftitapp activation guide prepared for 7 repos with per-repo caller YAML and deploy commands
- Promotion pipeline: develop→qa→main flow with human approval gate, config-driven per-repo enablement
- Observability: success rate tracking, cost-per-fix via token usage, budget alerts at 50%/80% of $200/month
- promote.yml wired to repo-stack-map.json promotion.enabled config; promote-caller deployed to 4 active repos

**Requirements:** 9/9 satisfied (1 external blocker: Liftitapp admin approval)

**Known Gaps:**
- Liftitapp enrollment (6 repos) blocked on org admin approving GitHub App installation — activation guide ready for 5-minute deployment when approved
- LiftitFinOps/conciliacion-averias secrets not yet configured (user action)

**Tech Debt:**
1. 4 dormant repos have auto-fix callers but no CI workflow (callers activate when CI is added)
2. `@claude` interactive code review deferred to future milestone

**Archives:**
- [v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)
- [v1.1-MILESTONE-AUDIT.md](milestones/v1.1-MILESTONE-AUDIT.md)

---

## v1.0 MVP (Shipped: 2026-03-02)

**Phases completed:** 4 phases, 7 plans, ~14 tasks
**Timeline:** 2 days (2026-03-01 → 2026-03-02)
**Source LOC:** 1,381 lines (YAML, Shell, JSON, Markdown)
**Commits:** 42

**Key accomplishments:**
- Central repo with reusable auto-fix workflow, cross-org GitHub App auth, and stack-specific prompt library
- Security guardrails: input sanitization, circuit breaker, token/time limits, and scope restriction with test workflow
- CI failure detection with flakiness filter, head_branch checkout, and 15-line thin caller template
- Fix generation with config-driven allowed_dirs, post-agent diff validation, and agent git/gh capabilities
- PR management with 2-attempt retry guard, needs-human escalation, and structured PR descriptions
- Integration hardening: 6 audit-discovered bugs fixed (validate-diff, circuit breaker, test assertions, docs sync)

**Requirements:** 19/21 satisfied (2 external state: FOUND-02, FOUND-03)

**Known Gaps:**
- FOUND-02: GitHub App installation on all 3 orgs (external state — requires manual confirmation)
- FOUND-03: Central repo public visibility (external state — requires manual confirmation)

**Tech Debt:**
1. CIFD-02 — Silent log fallback wastes retry attempt (Medium)
2. PRMG-03/04 — Retry guard repo-wide scope may cause premature escalation (Medium)
3. FIXG-03 — Diagnostic ambiguity in validate-diff.sh (Low)
4. SECR-04 — allowedTools enforcement gap, issue #860 (External, mitigated by validate-diff.sh)

**Archives:**
- [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)
- [v1.0-MILESTONE-AUDIT.md](milestones/v1.0-MILESTONE-AUDIT.md)

---
