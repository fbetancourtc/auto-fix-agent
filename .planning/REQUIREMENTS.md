# Requirements: Auto-Fix Agent

**Defined:** 2026-03-01
**Core Value:** When CI fails on any monitored repo, an AI agent automatically fixes the code and opens a PR -- reducing MTTF from hours to minutes.

## v1 Requirements

### Foundation

- [ ] **FOUND-01**: Central repo hosts reusable GitHub Actions workflows callable by any repo across 3 orgs
- [ ] **FOUND-02**: GitHub App registered and installed on all 3 orgs (Liftitapp, fbetancourtc, LiftitFinOps) for cross-org token generation
- [ ] **FOUND-03**: Central repo is public to enable cross-org reusable workflow access without enterprise billing
- [ ] **FOUND-04**: Prompt library organized by stack (TypeScript, Python, Kotlin) in central repo `prompts/` directory

### CI Failure Detection

- [x] **CIFD-01**: `workflow_run` trigger fires automatically when any monitored CI workflow completes with failure
- [ ] **CIFD-02**: CI failure logs retrieved via `gh run view --log-failed` and injected into agent context (last 500 lines)
- [x] **CIFD-03**: Flakiness filter re-runs failed CI once before invoking agent to avoid fixing transient failures
- [x] **CIFD-04**: Thin caller workflow (max 15 lines) that each repo adds to opt in

### Fix Generation

- [ ] **FIXG-01**: Claude Code Action (`anthropics/claude-code-action@v1`) analyzes failure logs, searches codebase, and implements fix
- [ ] **FIXG-02**: Agent scope restricted to source code only -- cannot modify `.github/`, `.env`, CI config, Dockerfiles, or infrastructure
- [ ] **FIXG-03**: Post-run file diff validation fails the workflow if any file outside source directories was modified
- [ ] **FIXG-04**: TypeScript stack-specific fix prompt with Next.js, vitest, ESLint context
- [ ] **FIXG-05**: Python stack-specific fix prompt with FastAPI, pytest, ruff context
- [ ] **FIXG-06**: Kotlin stack-specific fix prompt with Android, ktlint, detekt, Gradle context

### PR Management

- [ ] **PRMG-01**: Auto-created fix PR on the failing repo with `auto-fix` label
- [ ] **PRMG-02**: PR description includes root cause analysis, what changed, and how it was tested
- [ ] **PRMG-03**: Retry guard limits to max 2 fix attempts per failure using PR label counter
- [ ] **PRMG-04**: On retry exhaustion, create GitHub Issue labeled `needs-human` with failure context and links to both attempt PRs
- [ ] **PRMG-05**: Human review gate -- no auto-merge of fix PRs (enforced by architecture, not code)

### Security

- [ ] **SECR-01**: Input sanitization for CI log content injected into agent prompt (prevent prompt injection CVE-2026-21852)
- [ ] **SECR-02**: Circuit-breaker prevents agent from triggering on its own fix PR failures (deduplication by sha + workflow)
- [ ] **SECR-03**: Per-run token limit to prevent runaway API costs on large log contexts
- [ ] **SECR-04**: Agent never has access to production secrets or deployment triggers

### Multi-Repo Rollout

- [ ] **ROLL-01**: Thin caller template with onboarding documentation for adding any new repo
- [ ] **ROLL-02**: Repo-to-stack configuration mapping in central repo
- [ ] **ROLL-03**: All 14 active repos across 3 orgs enrolled with working auto-fix

### Promotion Pipeline

- [ ] **PROM-01**: Auto-create develop to qa PR when an auto-fix PR merges to develop
- [ ] **PROM-02**: qa to main promotion requires mandatory human approval (non-negotiable)

### Observability

- [ ] **OBSV-01**: Success rate tracking per repo (fixed / escalated / skipped)
- [ ] **OBSV-02**: Cost-per-fix tracking via Claude Code Action token usage output
- [ ] **OBSV-03**: Budget alerts at 50% and 80% of monthly spend threshold

### Interactive Review

- [ ] **INTV-01**: `@claude` mention in any PR comment triggers interactive code review/fix via Claude Code Action

## v2 Requirements

### External Error Sources

- **EXTS-01**: Sentry webhook to `repository_dispatch` bridge for production error detection
- **EXTS-02**: Sentry production error to fix PR pipeline with separate production error prompt
- **EXTS-03**: Firebase Crashlytics to `repository_dispatch` bridge via Cloud Functions
- **EXTS-04**: Crashlytics Android crash to fix PR pipeline

### Advanced

- **ADVN-01**: Custom monitoring dashboard (Supabase table + UI) for success/cost trends
- **ADVN-02**: Versioned central workflow tags (v1, v2) for coordinated breaking change rollout
- **ADVN-03**: Weekly digest report of all auto-fix activity across repos

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-merge of fix PRs | LLM-generated code can fail non-obviously; industry consensus requires human approval |
| Modifying CI configuration files | Agent would disable failing checks instead of fixing real bugs |
| Cross-repo error correlation / ML | Architecturally complex, high false positive risk at this scale |
| Autonomous production deployment | One bad auto-deploy can take down production; human gate non-negotiable |
| Custom LLM fine-tuning | Training costs exceed value at 14-repo scale with $200/mo budget |
| Infrastructure fixes (Terraform) | Production blast radius; separate concern |
| Automated rollback | Requires context agent doesn't have (in-flight transactions, migrations) |
| Slack/Teams notifications per fix | GitHub PR notifications suffice; extra channels cause alert fatigue |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FOUND-01 | Phase 1 | Pending |
| FOUND-02 | Phase 1 | Pending |
| FOUND-03 | Phase 1 | Pending |
| FOUND-04 | Phase 1 | Pending |
| CIFD-01 | Phase 2 | Complete |
| CIFD-02 | Phase 2 | Pending |
| CIFD-03 | Phase 2 | Complete |
| CIFD-04 | Phase 2 | Complete |
| FIXG-01 | Phase 2 | Pending |
| FIXG-02 | Phase 2 | Pending |
| FIXG-03 | Phase 2 | Pending |
| FIXG-04 | Phase 2 | Pending |
| FIXG-05 | Phase 3 | Pending |
| FIXG-06 | Phase 3 | Pending |
| PRMG-01 | Phase 2 | Pending |
| PRMG-02 | Phase 2 | Pending |
| PRMG-03 | Phase 2 | Pending |
| PRMG-04 | Phase 2 | Pending |
| PRMG-05 | Phase 2 | Pending |
| SECR-01 | Phase 1 | Pending |
| SECR-02 | Phase 1 | Pending |
| SECR-03 | Phase 1 | Pending |
| SECR-04 | Phase 1 | Pending |
| ROLL-01 | Phase 3 | Pending |
| ROLL-02 | Phase 3 | Pending |
| ROLL-03 | Phase 3 | Pending |
| PROM-01 | Phase 4 | Pending |
| PROM-02 | Phase 4 | Pending |
| OBSV-01 | Phase 4 | Pending |
| OBSV-02 | Phase 4 | Pending |
| OBSV-03 | Phase 4 | Pending |
| INTV-01 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation*
