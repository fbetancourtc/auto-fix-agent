# Plan 01-01 Summary: Reusable Workflow & Repo Structure

**Status:** COMPLETE
**Completed:** 2026-03-02

## What was built

1. **`.github/workflows/auto-fix.yml`** — Reusable workflow with `workflow_call` trigger, cross-org token generation via `actions/create-github-app-token@v2`, Claude Code Action step, and env-variable indirection for security.

2. **`config/repo-stack-map.json`** — Maps 15 repos across 3 orgs (Liftitapp, fbetancourtc, LiftitFinOps) to their stack (typescript, python, kotlin).

3. **`prompts/typescript.md`** — Production-ready fix prompt (68 lines) with Next.js/Vitest/ESLint context, constraints, and common failure patterns.

4. **`prompts/python.md`** — Stub prompt (45 lines) with FastAPI/pytest/ruff context. TODO for Phase 3 expansion.

5. **`prompts/kotlin.md`** — Stub prompt (45 lines) with Android/ktlint/detekt/Gradle context. TODO for Phase 3 expansion.

6. **`README.md`** — Setup docs, caller workflow example, enrolled repos list.

## GitHub App setup (Task 3 — human action)

- **App ID:** 2985828
- **App name:** auto-fix-agent
- **Installed on:** Liftitapp, fbetancourtc, LiftitFinOps (all 3 orgs)
- **Permissions:** Contents (R/W), Pull requests (R/W), Actions (Read), Issues (R/W), Metadata (Read)
- **Repo visibility:** Public (required for free cross-org reusable workflow access)
- **Webhook:** Deactivated (not needed)
- **Private key:** SHA256:9Zs+ghHBz8uLxjF0yI+nrFuMzrl1noSVdVOqYYp1aFQ= (old key deleted)

## Secrets configured

| Target | AUTO_FIX_APP_PRIVATE_KEY | ANTHROPIC_API_KEY | AUTO_FIX_APP_ID |
|--------|--------------------------|-------------------|-----------------|
| fbetancourtc (7 repos) | Set per-repo | Set per-repo | Set per-repo |
| LiftitFinOps (org) | Set | Set | Set |
| Liftitapp (org) | Pending — needs admin | Pending — needs admin | Pending — needs admin |

## Commits

- `96f34d5` — Task 1: reusable workflow, repo-stack map, README
- `5a46aca` — Task 2: stack-specific prompt files

## Open items

- Liftitapp org secrets must be set by their admin (no CLI access — HTTP 403)
- API key backed up in 1Password as "Anthropic API Key - auto-fix-agent"
