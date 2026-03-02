# Roadmap: Auto-Fix Agent

## Overview

Deliver a centralized self-healing CI/CD system that monitors 14 repos across 3 GitHub orgs, auto-diagnoses CI failures using Claude Code Action, implements fixes, and opens PRs with human approval gates. The roadmap progresses from infrastructure and security guardrails, through a single-repo validated fix loop, to multi-repo rollout, and finally promotion automation with observability. Each phase produces an independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Infrastructure and Security Guardrails** - GitHub App, public central repo, prompt library, and all security controls that must exist before any trigger fires
- [x] **Phase 2: Core Fix Loop** - End-to-end CI failure detection, fix generation, and PR creation validated on a single TypeScript repo
- [ ] **Phase 2.1: Integration Fixes & Documentation** - INSERTED — Fix validate-diff.sh bug, circuit breaker fail-open, test-guardrails assertion, README caller example, Python prompt/config sync, label setup docs
- [ ] **Phase 2.2: Retroactive Phase 1 Verification** - INSERTED — Run verifier on Phase 1 to formally satisfy FOUND-01–04 and SECR-01–04 after Phase 2.1 fixes
- [ ] **Phase 3: Multi-Repo Rollout** - Stack-specific prompts for Python and Kotlin, thin caller template, and all 14 repos enrolled with interactive review
- [ ] **Phase 4: Promotion and Observability** - Automated develop-to-qa PR promotion, success/cost tracking, and budget alerts

## Phase Details

### Phase 1: Infrastructure and Security Guardrails
**Goal**: The central repo, cross-org authentication, prompt library, and all security mechanisms are deployed and verified -- so that no trigger can fire without guardrails in place
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, SECR-01, SECR-02, SECR-03, SECR-04
**Success Criteria** (what must be TRUE):
  1. A reusable workflow in the public central repo can be called from a test workflow in each of the 3 GitHub orgs and receives a valid GitHub App token
  2. Stack-specific prompt files exist in `prompts/` for TypeScript (with Python and Kotlin stubs) and are loadable by a workflow step
  3. A test payload containing known prompt injection patterns is sanitized before reaching the agent context
  4. The circuit-breaker correctly blocks a workflow triggered by an `auto-fix`-labeled PR's own CI failure
  5. A workflow run that exceeds the per-run token limit is terminated before completion
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md -- Central repo structure, reusable workflow, GitHub App setup, prompt library, repo-stack mapping
- [ ] 01-02-PLAN.md -- Security guardrails: input sanitization, circuit-breaker, token limits, scope restriction, test workflow

### Phase 2: Core Fix Loop
**Goal**: When CI fails on a single TypeScript repo, the agent automatically retrieves logs, diagnoses the failure, implements a source-code-only fix, and opens a labeled PR with retry guard and human escalation
**Depends on**: Phase 1
**Requirements**: CIFD-01, CIFD-02, CIFD-03, CIFD-04, FIXG-01, FIXG-02, FIXG-03, FIXG-04, PRMG-01, PRMG-02, PRMG-03, PRMG-04, PRMG-05
**Success Criteria** (what must be TRUE):
  1. A deliberately broken commit on the pilot TypeScript repo triggers the fix workflow within 2 minutes of CI failure completion
  2. The agent opens a PR labeled `auto-fix` with a description containing root cause analysis, diff summary, and test results
  3. A flaky test (passes on re-run) does NOT trigger the agent -- the flakiness filter catches it first
  4. After 2 failed fix attempts on the same failure, a GitHub Issue labeled `needs-human` is created with links to both attempt PRs
  5. No file outside source directories is modified by the agent (post-run diff validation rejects the workflow if violated)
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md -- CI failure detection: head_branch input, flakiness filter, thin caller workflow example
- [ ] 02-02-PLAN.md -- Fix generation: config schema migration with allowed_dirs, diff validation script, agent git/gh capabilities, workflow-controlled PR creation
- [ ] 02-03-PLAN.md -- PR management: prompt updates with retry guard, human escalation, git workflow instructions, agent env vars

### Phase 2.1: Integration Fixes & Documentation
**Goal**: All integration bugs and documentation gaps found by the milestone audit are fixed — validate-diff.sh catches committed forbidden files, circuit breaker fully fails open, test-guardrails passes against current codebase, README matches the canonical caller example, and Python prompt/config allowed_dirs are synced
**Depends on**: Phase 2
**Requirements**: FIXG-02, FIXG-03, SECR-02, SECR-04, CIFD-01, FOUND-01, PRMG-01, PRMG-04
**Gap Closure**: Closes gaps from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. `validate-diff.sh` detects a forbidden file in the agent's most recent commit and reverts it (uses `HEAD~1..HEAD` diff)
  2. Circuit breaker proceeds (fails open) when `getWorkflowRun` API call throws a network error
  3. `test-guardrails.yml` scope-restriction test passes against the current `auto-fix.yml` (allows repo-scoped `GH_TOKEN`)
  4. README caller example includes all 4 required inputs including `head_branch`
  5. Python prompt `allowed_dirs` list matches `config/repo-stack-map.json` defaults for the python stack
  6. README setup instructions include creating `auto-fix` and `needs-human` labels in enrolled repos
**Plans**: TBD

Plans:
- [ ] 02.1-01: Fix validate-diff.sh, circuit breaker, test-guardrails assertion, README, Python prompt/config sync, label docs

### Phase 2.2: Retroactive Phase 1 Verification
**Goal**: Phase 1 infrastructure and security guardrails are formally verified against the codebase — closing the verification gap from the milestone audit
**Depends on**: Phase 2.1
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, SECR-01, SECR-02, SECR-03, SECR-04
**Gap Closure**: Closes verification gaps from v1.0 milestone audit
**Success Criteria** (what must be TRUE):
  1. A VERIFICATION.md exists for Phase 1 with all must-haves checked against the actual codebase
  2. All 8 Phase 1 requirements (FOUND-01–04, SECR-01–04) are marked as satisfied or have documented gaps
**Plans**: TBD

Plans:
- [ ] 02.2-01: Run gsd-verifier on Phase 1 to create VERIFICATION.md

### Phase 3: Multi-Repo Rollout
**Goal**: All 14 repos across 3 orgs are enrolled in the auto-fix system with stack-appropriate prompts, and developers can interact with the agent via PR comments
**Depends on**: Phase 2
**Requirements**: FIXG-05, FIXG-06, ROLL-01, ROLL-02, ROLL-03, INTV-01
**Success Criteria** (what must be TRUE):
  1. A Python repo CI failure triggers the agent and receives a fix using the Python-specific prompt (FastAPI/pytest/ruff context)
  2. A Kotlin repo CI failure triggers the agent and receives a fix using the Kotlin-specific prompt (Android/ktlint/detekt/Gradle context)
  3. All 14 repos have a working thin caller workflow (max 15 lines) and appear in the central repo-to-stack configuration mapping
  4. An `@claude` mention in a PR comment on any enrolled repo triggers an interactive code review response
**Plans**: TBD

Plans:
- [ ] 03-01: Python and Kotlin stack-specific prompts
- [ ] 03-02: Thin caller template, onboarding docs, and full 14-repo enrollment
- [ ] 03-03: Interactive `@claude` review integration

### Phase 4: Promotion and Observability
**Goal**: Merged auto-fix PRs automatically promote through the branch pipeline, and success rates, costs, and budget consumption are tracked across all repos
**Depends on**: Phase 3
**Requirements**: PROM-01, PROM-02, OBSV-01, OBSV-02, OBSV-03
**Success Criteria** (what must be TRUE):
  1. When an auto-fix PR merges to develop, a develop-to-qa PR is automatically created within 5 minutes
  2. The qa-to-main promotion path requires mandatory human approval -- no automated merge path exists
  3. Per-repo success rates (fixed / escalated / skipped) are visible in GitHub Actions job summaries
  4. Cost-per-fix data is captured from Claude Code Action token usage output and accumulated per repo
  5. Budget alerts fire at 50% and 80% of the $200/month spend threshold
**Plans**: TBD

Plans:
- [ ] 04-01: PR promotion pipeline (develop to qa auto-PR, human gate at qa to main)
- [ ] 04-02: Success rate and cost tracking with budget alerts

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure and Security Guardrails | 2/2 | Complete | 2026-03-02 |
| 2. Core Fix Loop | 3/3 | Complete | 2026-03-02 |
| 2.1 Integration Fixes & Documentation | 0/1 | Not started | - |
| 2.2 Retroactive Phase 1 Verification | 0/1 | Not started | - |
| 3. Multi-Repo Rollout | 0/3 | Not started | - |
| 4. Promotion and Observability | 0/2 | Not started | - |
