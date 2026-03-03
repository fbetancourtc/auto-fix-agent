# Phase 3: Multi-Repo Rollout - Research

**Researched:** 2026-03-02
**Domain:** GitHub Actions cross-org rollout, Python CI failure patterns, onboarding automation
**Confidence:** HIGH

## Summary

Phase 3 expands the validated auto-fix system from a single TypeScript repo to all 14 repos across 3 GitHub organizations. The technical risk is low -- the core infrastructure (reusable workflow, caller template, validate-diff, circuit breaker) is proven in v1.0. The work is primarily: (1) expanding the Python prompt with a comprehensive failure pattern library, (2) creating onboarding documentation, and (3) mechanically enrolling each repo by deploying the caller YAML and configuring secrets.

The critical constraint is org access: `fbetancourtc` (7 repos, full admin) and `LiftitFinOps` (1 repo, GitHub App installed) can be enrolled immediately. `Liftitapp` (6 repos) requires admin approval for the GitHub App installation -- the phase counts as complete without them, but caller files should be prepared so they activate when admin approves.

**Primary recommendation:** Stage rollout by org (fbetancourtc first, LiftitFinOps second, Liftitapp prepared-but-deferred). Expand the Python prompt with the 6 failure pattern categories from CONTEXT.md. Keep Kotlin stub as-is. Deliver onboarding as an ONBOARDING.md in the central repo.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Staged by org: fbetancourtc (7 TS repos, full admin) -> LiftitFinOps (1 Python repo) -> Liftitapp (6 repos, pending admin)
- Skip Liftitapp repos until GitHub App admin approval is granted -- phase counts as complete without them
- Prepare Liftitapp caller files so they're ready to activate when admin approves
- Smoke test each repo after enrollment: intentionally break a test, verify auto-fix triggers and creates PR, then revert
- Claude picks delivery method per org based on access level (PRs where possible, docs where not)
- Python prompt: expand with common CI failure pattern library (import errors, missing deps, fixture issues, async/await bugs, Pydantic v2 migration patterns) -- generic enough for all 4 Python repos
- Kotlin prompt: keep current stub -- only one Kotlin repo, expand when real failures surface
- TypeScript prompt: no changes -- proven in v1.0, don't touch what works
- No CI history mining -- agent reads live logs each run, repo-specific pre-training has diminishing returns
- Stack-level prompts only -- no per-repo prompt tweaks
- Deliver: caller YAML file + onboarding documentation (README section or ONBOARDING.md)
- Docs include: what auto-fix does, how to customize workflow names, what secrets to set, how to verify it works
- Each repo edits the `workflows: [CI]` list in their caller YAML to match their CI workflow name(s)
- Secrets setup: Claude picks per org -- org-level secrets where possible, repo-level as fallback
- `allowed_dirs` in repo-stack-map.json: stack defaults apply; per-repo overrides only when repo has non-standard structure
- Claude audits each repo's directory structure during research and flags non-standard repos for overrides
- Enroll all 14 repos -- no exclusions

### Claude's Discretion
- Exact smoke test implementation (manual break-and-fix vs dedicated test workflow)
- Delivery method per org (PRs vs documentation vs scripted setup)
- Secrets configuration approach per org (org-level vs repo-level)
- Whether any repo besides liftit-control-de-asistencia needs custom allowed_dirs
- Onboarding doc format (README section vs standalone ONBOARDING.md)

### Deferred Ideas (OUT OF SCOPE)
- `@claude` interactive code review via PR comments -- separate capability, not rollout
- develop->qa->main promotion pipeline -- Phase 4
- Success rate tracking per repo -- Phase 4
- Expanding Kotlin prompt when real failures surface -- revisit after initial enrollment
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PYTHON-PROMPT | Python stack-specific fix prompt (FastAPI/pytest/ruff expansion) | Python CI failure pattern library (see Architecture Patterns section) covering 6 categories: import errors, missing deps, fixture issues, async/await bugs, Pydantic v2 migration, ruff lint patterns |
| KOTLIN-PROMPT | Kotlin stack-specific fix prompt (Android/ktlint/detekt/Gradle expansion) | Existing stub is adequate per user decision. No expansion needed this phase. |
| ONBOARDING | Thin caller template with onboarding docs | Caller template exists (`auto-fix-caller.example.yml`). Needs ONBOARDING.md with setup steps, secrets config, workflow name customization, and verification procedure. |
| ENROLLMENT | All 14 repos enrolled with working auto-fix | 8 repos enrollable now (7 fbetancourtc + 1 LiftitFinOps). 6 Liftitapp repos prepared but deferred until admin approval. Smoke test per enrolled repo. |
</phase_requirements>

## Standard Stack

### Core (Already Established in v1.0)
| Component | Version/Ref | Purpose | Status |
|-----------|-------------|---------|--------|
| GitHub Actions reusable workflow | `auto-fix.yml@main` | Central fix orchestration | Production -- no changes |
| Claude Code Action | `anthropics/claude-code-action@v1` | AI agent runtime | Production -- no changes |
| `actions/create-github-app-token@v2` | v2 | Cross-org token generation | Production -- no changes |
| `repo-stack-map.json` | config/ | Repo-to-stack mapping + allowed_dirs | Needs audit for non-standard repos |
| `validate-diff.sh` | scripts/ | Post-agent directory enforcement | Production -- no changes |
| `sanitize-logs.sh` | scripts/ | CI log sanitization | Production -- no changes |

### Prompt Library
| Prompt | File | Status | Phase 3 Action |
|--------|------|--------|----------------|
| TypeScript | `prompts/typescript.md` | Production (detailed patterns) | No changes |
| Python | `prompts/python.md` | Stub (basic structure only) | Expand with 6 failure pattern categories |
| Kotlin | `prompts/kotlin.md` | Stub (basic structure only) | No changes (user decision) |

### No New Dependencies
This phase introduces no new libraries, actions, or tools. All work uses existing infrastructure. The only file creations are:
- Expanded `prompts/python.md` content
- `ONBOARDING.md` documentation
- Per-repo `auto-fix-caller.yml` files (copies of the template)

## Architecture Patterns

### Repo Inventory by Org and Stack

**Org: fbetancourtc (7 repos -- full admin, GitHub App installed)**
| Repo | Stack | Custom allowed_dirs? | CI Workflow Name(s) to Discover |
|------|-------|---------------------|-------------------------------|
| laundry-operating-dash | typescript | No (stack default) | Needs audit |
| lavandarosa-platform | typescript | No (stack default) | Needs audit |
| lavandarosa-petal-web | typescript | No (stack default) | Needs audit |
| laundry-property-managers | typescript | No (stack default) | Needs audit |
| laundry-cleaning-staff | typescript | No (stack default) | Needs audit |
| laundry-admin-dash | typescript | No (stack default) | Needs audit |
| binance-bot | python | No (stack default) | Needs audit |

**Org: LiftitFinOps (1 repo -- GitHub App installed)**
| Repo | Stack | Custom allowed_dirs? | CI Workflow Name(s) to Discover |
|------|-------|---------------------|-------------------------------|
| conciliacion-averias | python | No (stack default) | Needs audit |

**Org: Liftitapp (6 repos -- GitHub App NOT installed, pending admin)**
| Repo | Stack | Custom allowed_dirs? | CI Workflow Name(s) to Discover |
|------|-------|---------------------|-------------------------------|
| liftit-control-de-asistencia | kotlin | YES: `app/src/`, `dashboard/src/`, `backend/src/` | Needs audit |
| averias-marketplace | typescript | No (stack default) | Needs audit |
| geocoding-enterprise | typescript | No (stack default) | Needs audit |
| conciliacion-recaudo-liftit | python | No (stack default) | Needs audit |
| liftit-ai-system | typescript | No (stack default) | Needs audit |
| geocoding-liftit-api | python | No (stack default) | Needs audit |
| liftit-cargo-receptor-de-cumplidos | python | No (stack default) | Needs audit |

### Pattern 1: Caller Deployment Pattern
**What:** Each target repo gets a copy of `auto-fix-caller.example.yml` as `.github/workflows/auto-fix-caller.yml`, with the `workflows:` list customized to match that repo's CI workflow name(s).
**When to use:** Every repo enrollment.
**Critical detail:** The caller file MUST exist on the repo's default branch (main or develop) for `workflow_run` to trigger. A PR alone is not sufficient -- it must be merged.

```yaml
# Template -- only the workflows list changes per repo
name: Auto Fix
on:
  workflow_run:
    workflows: [CI]  # CHANGE THIS per repo
    types: [completed]
jobs:
  fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main
    with:
      app_id: "2985828"
      failed_run_id: "${{ github.event.workflow_run.id }}"
      repository: "${{ github.repository }}"
      head_branch: "${{ github.event.workflow_run.head_branch }}"
    secrets:
      anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}"
      app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}"
```

### Pattern 2: Secrets Configuration Pattern
**What:** Each org/repo needs `ANTHROPIC_API_KEY` and `AUTO_FIX_APP_PRIVATE_KEY` secrets.
**Cross-org constraint:** `secrets: inherit` fails silently across orgs. Callers MUST explicitly pass secrets (already encoded in the template).
**Recommendation per org:**

| Org | Approach | Rationale |
|-----|----------|-----------|
| fbetancourtc | Org-level secrets | 7 repos, full admin, set once and all repos inherit |
| LiftitFinOps | Repo-level secrets | Only 1 repo, org-level is overhead |
| Liftitapp | Org-level secrets (when admin grants access) | 6 repos benefit from single config |

**Important:** Org-level secrets require a repository access policy. Set to "All repositories" or explicitly list the enrolled repos. Repo-level secrets take precedence over org-level if both exist.

### Pattern 3: Python Prompt Expansion Pattern
**What:** Expand `prompts/python.md` Common Patterns section with 6 comprehensive failure categories.
**Structure:** Mirror the TypeScript prompt's pattern depth. The TS prompt has 4 categories with 4 sub-patterns each (16 total patterns). The Python prompt should match this depth.

**Categories to add (from CONTEXT.md decisions):**

1. **Import Errors** -- ModuleNotFoundError, circular imports, relative vs absolute import confusion, missing `__init__.py`, PYTHONPATH issues in CI
2. **Missing Dependencies** -- Package in code but not in requirements.txt/pyproject.toml, version conflicts between transitive deps, dev-only deps missing in CI
3. **Fixture Issues** -- conftest.py not discovered (wrong directory), fixture scope mismatch (function vs session), missing fixture dependencies, autouse fixture side effects
4. **Async/Await Bugs** -- Missing `await` on async calls, `pytest-asyncio` mode configuration (`auto` vs `strict`), mixing sync and async test patterns, event loop already running errors
5. **Pydantic v2 Migration** -- `@root_validator` -> `@model_validator`, `parse_raw` -> `model_validate_json`, `Field` extra kwargs deprecated, `Config` class -> `model_config`, TypeError in validators no longer becoming ValidationError
6. **Ruff Lint Patterns** -- F401 unused imports, I001 import sorting (isort-compatible), E501 line too long, N801/N802 naming conventions, UP rules for Python version upgrades

### Pattern 4: Smoke Test Pattern
**What:** After deploying the caller to a repo, verify the full pipeline works.
**Recommended approach (Claude's discretion):**

```
1. Create a test branch in the target repo
2. Introduce a deliberate, simple test failure (e.g., assert True -> assert False)
3. Push to trigger CI
4. Wait for CI to fail
5. Wait for auto-fix-caller to trigger
6. Verify: auto-fix PR is created with correct label, description format, and fix
7. Close the auto-fix PR
8. Revert the deliberate failure
9. Delete the test branch
```

**Alternative (simpler):** Just deploy the caller and wait for a natural CI failure. Downside: no immediate verification -- could take days/weeks.

**Recommendation:** Use the manual break-and-fix approach for fbetancourtc repos (full admin, can do quickly). For LiftitFinOps, use the same approach. For Liftitapp, prepare docs describing the smoke test procedure since we cannot execute it without admin access.

### Anti-Patterns to Avoid
- **Per-repo prompt customization:** CONTEXT.md explicitly prohibits this. Stack-level only.
- **Modifying auto-fix.yml:** The reusable workflow is production-proven. No changes this phase.
- **Using secrets: inherit for cross-org:** Fails silently. Always pass secrets explicitly.
- **Deploying caller via PR without merging:** `workflow_run` only triggers from the default branch. A caller sitting in a PR does nothing.
- **Enrolling Liftitapp repos without admin:** The GitHub App is not installed. The caller would trigger but fail at token generation. Prepare files only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-org authentication | Custom token scripts | `actions/create-github-app-token@v2` with `owner` param | Handles installation lookup, scoping, automatic revocation |
| Directory enforcement | Per-repo validation logic | `validate-diff.sh` + `repo-stack-map.json` | Already handles stack defaults and per-repo overrides |
| CI log retrieval | Custom API calls | `gh run view --log-failed` via reusable workflow | Already sanitized by `sanitize-logs.sh` |
| Prompt selection | Per-repo conditional logic | `repo-stack-map.json` stack lookup in `auto-fix.yml` | Already implemented in Load prompt step |
| Onboarding scripts | Automated repo setup CLI | ONBOARDING.md + manual caller deployment | 14 repos is small enough for manual process; script maintenance cost exceeds benefit |

**Key insight:** All infrastructure already exists. This phase is content (prompt expansion + docs) and deployment (caller YAML + secrets), not engineering.

## Common Pitfalls

### Pitfall 1: workflow_run Only Triggers on Default Branch
**What goes wrong:** Deploying the caller YAML via PR but not merging it. The `workflow_run` trigger is only registered when the workflow file exists on the repository's default branch.
**Why it happens:** Misunderstanding GitHub Actions trigger registration.
**How to avoid:** Merge the caller YAML to the default branch (main or develop) before smoke testing. For repos using develop as default, the caller must be on develop.
**Warning signs:** Caller deployed but no auto-fix triggers after CI failure.

### Pitfall 2: Workflow Name Mismatch
**What goes wrong:** The `workflows: [CI]` list in the caller doesn't match the exact `name:` field in the target repo's CI workflow YAML.
**Why it happens:** Repos use different names: "CI", "Build", "Test", "Lint and Test", etc.
**How to avoid:** During enrollment, read each repo's `.github/workflows/*.yml` files and extract the exact `name:` field. Use that value in the caller.
**Warning signs:** Caller deployed, CI fails, but auto-fix never triggers.

### Pitfall 3: GitHub App Not Installed on Org
**What goes wrong:** The caller triggers, the reusable workflow runs, but `create-github-app-token` fails because the GitHub App (ID: 2985828) is not installed on that org.
**Why it happens:** Liftitapp admin hasn't approved the app installation.
**How to avoid:** Do NOT deploy callers to Liftitapp repos as active. Prepare the files and document activation steps.
**Warning signs:** Workflow fails at "Generate token" step with installation not found error.

### Pitfall 4: Secrets Not Available Cross-Org
**What goes wrong:** Caller uses `secrets: inherit` expecting org secrets to flow to the reusable workflow in a different org.
**Why it happens:** `secrets: inherit` only works within the same org. Cross-org reusable workflows require explicit secret passing.
**How to avoid:** The existing caller template already passes secrets explicitly. Do NOT change this pattern. Verify secrets are set in each target org/repo before smoke testing.
**Warning signs:** Reusable workflow receives empty secret values, agent fails to authenticate.

### Pitfall 5: Python Prompt Too Specific or Too Generic
**What goes wrong:** Prompt patterns don't match what the 4 Python repos actually encounter, or are so generic they don't help the agent.
**Why it happens:** Writing patterns based on general knowledge rather than the actual stack usage.
**How to avoid:** Write patterns at the stack level (FastAPI/pytest/ruff/mypy ecosystem). Reference the specific tools listed in the prompt's Context section. Include concrete verification commands.
**Warning signs:** Agent produces fixes that don't match the repo's tool versions or conventions.

### Pitfall 6: Default Branch Varies by Repo
**What goes wrong:** Assuming all repos use `main` as default branch. Some repos may use `develop`.
**Why it happens:** Different teams have different branching strategies.
**How to avoid:** During enrollment audit, check each repo's default branch. The PR `--base` in the prompt uses `develop` -- verify this matches each repo.
**Warning signs:** PRs created against wrong base branch, or caller deployed to wrong branch.

## Code Examples

### Python Prompt: Import Error Pattern (to add)
```markdown
### Import Errors
- **ModuleNotFoundError:** Check if the package is in `requirements.txt` / `pyproject.toml`. If present, verify it's installed in CI (`pip install -r requirements.txt`). Check for typos in import statements.
- **Circular imports:** Trace the import chain. Break cycles by moving imports inside functions (lazy import) or extracting shared types/constants to a separate module.
- **Relative vs absolute imports:** Use absolute imports (`from app.models import User`) not relative (`from .models import User`) unless the project consistently uses relative imports. Check existing import style.
- **Missing __init__.py:** If pytest can't find modules, verify `__init__.py` exists in all package directories. Some projects use `src/` layout which requires proper path config.
```

### Python Prompt: Pydantic v2 Pattern (to add)
```markdown
### Pydantic v2 Migration
- **Deprecated validators:** Replace `@root_validator` with `@model_validator(mode='before')` or `@model_validator(mode='after')`. Replace `@validator` with `@field_validator`.
- **Deprecated methods:** Replace `Model.parse_raw(data)` with `Model.model_validate_json(data)`. Replace `Model.parse_obj(data)` with `Model.model_validate(data)`.
- **Field configuration:** Replace `Field(..., extra_key=value)` with `Field(..., json_schema_extra={"extra_key": value})`. Replace inner `Config` class with `model_config = ConfigDict(...)`.
- **TypeError in validators:** In Pydantic v2, `TypeError` raised in validators is NOT converted to `ValidationError`. If tests expect `ValidationError` from a `TypeError`, the validator needs to catch `TypeError` and raise `ValueError` explicitly.
```

### Onboarding Doc Structure (recommended)
```markdown
# Auto-Fix Agent: Onboarding Guide

## What This Does
[1 paragraph explaining the auto-fix system]

## Prerequisites
- GitHub App installed on your org (ID: 2985828)
- Secrets configured: ANTHROPIC_API_KEY, AUTO_FIX_APP_PRIVATE_KEY

## Step 1: Configure Secrets
[Org-level vs repo-level instructions]

## Step 2: Deploy Caller Workflow
[Copy template, customize workflows list]

## Step 3: Verify Setup
[Smoke test procedure]

## Customization
- Workflow names: how to edit the workflows list
- Directory restrictions: how allowed_dirs works
- Stack detection: how repo-stack-map.json routes to the right prompt

## Troubleshooting
[Common issues: workflow not triggering, token errors, etc.]
```

## State of the Art

| Aspect | Current State | Impact on Phase 3 |
|--------|---------------|-------------------|
| `create-github-app-token@v2` | Supports `owner` param for cross-org | Already used correctly in auto-fix.yml |
| `secrets: inherit` cross-org | Still does NOT work across orgs | Caller template already handles this correctly with explicit passing |
| Ruff replaces flake8+isort+black | Ruff is the standard Python linter/formatter | Python prompt should reference `ruff check` and `ruff format` only (no flake8/isort/black references) |
| Pydantic v2 stable | v2.x is standard, v1 deprecated | Prompt patterns should target v2 syntax only |
| pytest 8.x current | pytest 8+ has breaking changes from 7.x | Prompt should mention `pytest-asyncio` mode config (`auto` mode is recommended) |

## Open Questions

1. **CI Workflow Names per Repo**
   - What we know: The caller needs exact workflow name matches.
   - What's unclear: We don't know each repo's CI workflow `name:` field.
   - Recommendation: During plan execution, audit each repo's `.github/workflows/` directory to extract workflow names. This is a per-repo discovery task, not a research gap.

2. **Non-Standard Directory Structures**
   - What we know: `liftit-control-de-asistencia` already has custom `allowed_dirs` (Kotlin monorepo with `app/src/`, `dashboard/src/`, `backend/src/`).
   - What's unclear: Whether any other repo has source code outside the stack default directories.
   - Recommendation: During plan execution, audit each repo's directory structure. Most repos follow conventions. Flag exceptions.

3. **Default Branch per Repo**
   - What we know: The prompt templates use `--base develop` for PR creation.
   - What's unclear: Whether all 14 repos use `develop` as their default/target branch.
   - Recommendation: During enrollment, check each repo's default branch and adjust the caller deployment accordingly.

4. **Liftitapp Admin Timeline**
   - What we know: GitHub App not installed, admin approval pending.
   - What's unclear: When admin will approve.
   - Recommendation: Phase counts as complete without Liftitapp. Prepare caller files and onboarding docs so activation is a 5-minute task when admin approves.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `auto-fix-caller.example.yml`, `auto-fix.yml`, `repo-stack-map.json`, `validate-diff.sh`, all 3 prompt files -- read directly from repo
- [GitHub Actions Reusable Workflows docs](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows) -- secrets passing, cross-org behavior
- [GitHub Actions Secrets docs](https://docs.github.com/actions/security-guides/using-secrets-in-github-actions) -- org-level vs repo-level secrets, precedence rules
- [actions/create-github-app-token](https://github.com/actions/create-github-app-token) -- owner parameter, cross-org token generation

### Secondary (MEDIUM confidence)
- [Pydantic v2 Migration Guide](https://docs.pydantic.dev/latest/migration/) -- deprecated validators, methods, field configuration
- [Ruff documentation](https://docs.astral.sh/ruff/rules/) -- F401, I001, E501 rules and fix behavior
- [mypy Common Issues](https://mypy.readthedocs.io/en/stable/common_issues.html) -- strict mode patterns
- [pytest import mechanisms](https://docs.pytest.org/en/stable/explanation/pythonpath.html) -- PYTHONPATH, conftest discovery

### Tertiary (LOW confidence)
- General web search for Python CI failure patterns -- verified against official tool docs where possible

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all infrastructure exists and is production-proven from v1.0
- Architecture: HIGH -- patterns directly derived from existing codebase and CONTEXT.md decisions
- Pitfalls: HIGH -- based on documented v1.0 lessons (cross-org secrets, workflow_run triggers) and GitHub official docs
- Python prompt content: MEDIUM -- failure patterns are well-known but need validation against actual repo usage during execution

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days -- infrastructure is stable, prompt patterns are ecosystem knowledge)
