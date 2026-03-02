# Auto-Fix Agent

Centralized self-healing CI system that automatically fixes code when CI pipelines fail across multiple repositories and GitHub organizations.

When a CI workflow fails on any enrolled repo, the auto-fix agent analyzes the failure logs, identifies the root cause, implements a fix, and opens a pull request -- reducing mean-time-to-fix from hours to minutes.

## How It Works

1. A CI workflow fails on an enrolled repository
2. A thin caller workflow (15 lines) detects the failure via `workflow_run` trigger
3. The caller invokes this central reusable workflow, passing the failed run ID and repository
4. The reusable workflow generates a cross-org GitHub App token, retrieves failure logs, loads a stack-specific prompt, and runs Claude Code Action to fix the code
5. Claude analyzes the logs, searches the codebase, implements a fix, and opens a PR

## Setup

### Prerequisites

1. **GitHub App** registered and installed on all target organizations
   - Required permissions: Contents (R/W), Pull Requests (R/W), Actions (Read), Issues (R/W)
   - Install on: Liftitapp, fbetancourtc, LiftitFinOps

2. **Secrets** stored in each organization:
   - `AUTO_FIX_APP_PRIVATE_KEY` -- GitHub App private key (.pem file contents)
   - `ANTHROPIC_API_KEY` -- Anthropic API key for Claude

3. **Variable** stored in each organization:
   - `AUTO_FIX_APP_ID` -- Numeric GitHub App ID

4. **Labels** created in each enrolled repository:
   - `auto-fix` -- applied to auto-generated fix PRs (used by retry guard)
   - `needs-human` -- applied to escalation issues when auto-fix fails after 2 attempts

### Adding the Caller Workflow to a Repo

Add this file to any enrolled repo at `.github/workflows/auto-fix-caller.yml`:

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI"]  # Must match the repo's CI workflow name
    types: [completed]
jobs:
  fix:
    if: github.event.workflow_run.conclusion == 'failure'
    uses: fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main
    with:
      app_id: "${{ vars.AUTO_FIX_APP_ID }}"
      failed_run_id: "${{ github.event.workflow_run.id }}"
      repository: "${{ github.repository }}"
      head_branch: "${{ github.event.workflow_run.head_branch }}"
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

## Enrolled Repositories

Stack assignments are defined in [`config/repo-stack-map.json`](config/repo-stack-map.json).

| Organization | Repository | Stack |
|---|---|---|
| Liftitapp | liftit-control-de-asistencia | Kotlin |
| Liftitapp | averias-marketplace | TypeScript |
| Liftitapp | geocoding-enterprise | TypeScript |
| Liftitapp | conciliacion-recaudo-liftit | Python |
| Liftitapp | liftit-ai-system | TypeScript |
| Liftitapp | geocoding-liftit-api | Python |
| Liftitapp | liftit-cargo-receptor-de-cumplidos | Python |
| fbetancourtc | laundry-operating-dash | TypeScript |
| fbetancourtc | lavandarosa-platform | TypeScript |
| fbetancourtc | lavandarosa-petal-web | TypeScript |
| fbetancourtc | laundry-property-managers | TypeScript |
| fbetancourtc | laundry-cleaning-staff | TypeScript |
| fbetancourtc | laundry-admin-dash | TypeScript |
| fbetancourtc | binance-bot | Python |
| LiftitFinOps | conciliacion-averias | Python |

## Architecture

```
Enrolled Repo (CI fails)
  --> Thin caller workflow (workflow_run trigger)
    --> Central reusable workflow (this repo)
      --> GitHub App token (cross-org auth)
      --> Retrieve failed CI logs
      --> Load stack-specific prompt
      --> Claude Code Action (analyze + fix + PR)
```

## Security

- **Input sanitization**: CI logs are sanitized before injection into the agent prompt (Plan 01-02)
- **Circuit breaker**: Prevents infinite loops from auto-fix PR failures (Plan 01-02)
- **Token limits**: `--max-turns` and `timeout-minutes` cap agent execution and cost
- **Scope restriction**: `--allowedTools` limits what the agent can modify
- **Cross-org isolation**: GitHub App tokens are scoped to one organization at a time
- **No secrets exposure**: Agent step never receives `GITHUB_TOKEN` or other secrets

## Stack-Specific Prompts

Prompts are stored in the `prompts/` directory:

- `prompts/typescript.md` -- Next.js, Vitest, ESLint, TypeScript strict mode
- `prompts/python.md` -- FastAPI, pytest, ruff, mypy
- `prompts/kotlin.md` -- Android, ktlint, detekt, Gradle
