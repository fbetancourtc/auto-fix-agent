# Liftitapp Auto-Fix Activation Guide

When the Liftitapp org admin approves the GitHub App installation, follow this guide to activate auto-fix across all 7 Liftitapp repos. Estimated time: 5-10 minutes with admin access.

## Prerequisites

- [ ] GitHub App (ID: 2985828) installed on Liftitapp org by admin
- [ ] Org-level secrets configured (see below)

### Configure Org-Level Secrets

Go to Liftitapp org Settings > Secrets and variables > Actions and add:

1. `ANTHROPIC_API_KEY` -- from Anthropic dashboard
2. `AUTO_FIX_APP_PRIVATE_KEY` -- from GitHub App settings > Private keys

Set repository access to "All repositories" (or select the 7 repos below).

**Note:** Cross-org `secrets: inherit` does NOT work. The caller template passes secrets explicitly, so org-level secrets are sufficient.

---

## Per-Repo Activation

### 1. liftit-control-de-asistencia (kotlin)

- **Default branch:** main
- **CI Workflow names:** `Android CI/CD`, `Backend CI/CD`, `Dashboard CI/CD`
- **Custom allowed_dirs:** Yes -- already in repo-stack-map.json: `app/src/`, `dashboard/src/`, `backend/src/`
- **Notes:** Kotlin monorepo with 3 CI pipelines. All three should trigger auto-fix.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["Android CI/CD", "Backend CI/CD", "Dashboard CI/CD"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/liftit-control-de-asistencia/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="main" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["Android CI/CD", "Backend CI/CD", "Dashboard CI/CD"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

### 2. averias-marketplace (typescript)

- **Default branch:** main
- **CI Workflow names:** NONE -- no `.github/workflows/` directory exists
- **Custom allowed_dirs:** No -- uses typescript defaults (`src/`, `app/`, `components/`, `lib/`, `utils/`, `hooks/`, `types/`, `tests/`, `__tests__/`)
- **Notes:** This repo has no CI workflows at all. Auto-fix requires a CI workflow to trigger on failure. **NEEDS CI SETUP FIRST** before the caller can be deployed.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml` -- update `workflows:` once CI is added):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI"]  # UPDATE THIS: set to the exact name of your CI workflow once created
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:** N/A -- deploy after CI workflow is created and `workflows:` list is updated.

**Action required:** Create a CI workflow for this repo first (e.g., Next.js build + lint + test), then deploy the caller with the correct workflow name.

---

### 3. geocoding-enterprise (typescript)

- **Default branch:** develop
- **CI Workflow names:** `CI`, `Quality Gate`
- **Custom allowed_dirs:** No -- uses typescript defaults
- **Notes:** Has both CI and quality gate workflows. Trigger auto-fix on both.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI", "Quality Gate"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/geocoding-enterprise/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="develop" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI", "Quality Gate"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

### 4. conciliacion-recaudo-liftit (python)

- **Default branch:** develop
- **CI Workflow names:** `CI`
- **Custom allowed_dirs:** No -- uses python defaults (`src/`, `app/`, `lib/`, `tests/`)
- **Notes:** Standard Python repo with single CI workflow.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/conciliacion-recaudo-liftit/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="develop" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

### 5. liftit-ai-system (typescript)

- **Default branch:** production
- **CI Workflow names:** `Pull Request Checks`, `E2E Tests`
- **Custom allowed_dirs:** No -- uses typescript defaults
- **Notes:** Complex repo with many workflows. The CI-relevant ones that detect code failures are "Pull Request Checks" (runs on PRs) and "E2E Tests". The development pipeline (`Development Pipeline`) and production pipeline are deployment workflows. Consider adding the development pipeline too if it runs tests.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["Pull Request Checks", "E2E Tests"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/liftit-ai-system/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="production" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["Pull Request Checks", "E2E Tests"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

### 6. geocoding-liftit-api (python)

- **Default branch:** master
- **CI Workflow names:** `Geocoding CI`
- **Custom allowed_dirs:** No -- uses python defaults (`src/`, `app/`, `lib/`, `tests/`)
- **Notes:** Standard Python repo with single CI workflow.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["Geocoding CI"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/geocoding-liftit-api/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="master" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["Geocoding CI"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

### 7. liftit-cargo-receptor-de-cumplidos (python)

- **Default branch:** main
- **CI Workflow names:** `CI Pipeline`, `E2E Tests`
- **Custom allowed_dirs:** No -- uses python defaults (`src/`, `app/`, `lib/`, `tests/`)
- **Notes:** Has both unit CI and E2E test workflows.

**Caller YAML content** (save as `.github/workflows/auto-fix-caller.yml`):

```yaml
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI Pipeline", "E2E Tests"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
```

**Deploy command:**

```bash
gh api repos/Liftitapp/liftit-cargo-receptor-de-cumplidos/contents/.github/workflows/auto-fix-caller.yml \
  --method PUT \
  --field message="ci: add auto-fix caller workflow" \
  --field branch="main" \
  --field content="$(base64 -i <(cat <<'YAML'
name: Auto Fix
on:
  workflow_run:
    workflows: ["CI Pipeline", "E2E Tests"]
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
    secrets: { anthropic_api_key: "${{ secrets.ANTHROPIC_API_KEY }}", app_private_key: "${{ secrets.AUTO_FIX_APP_PRIVATE_KEY }}" }
YAML
))"
```

---

## Activation Checklist

- [ ] Admin approves GitHub App (ID: 2985828) installation on Liftitapp org
- [ ] Configure org-level secrets: `ANTHROPIC_API_KEY` + `AUTO_FIX_APP_PRIVATE_KEY`
- [ ] Deploy caller to liftit-control-de-asistencia (command above)
- [ ] Deploy caller to geocoding-enterprise (command above)
- [ ] Deploy caller to conciliacion-recaudo-liftit (command above)
- [ ] Deploy caller to liftit-ai-system (command above)
- [ ] Deploy caller to geocoding-liftit-api (command above)
- [ ] Deploy caller to liftit-cargo-receptor-de-cumplidos (command above)
- [ ] Set up CI for averias-marketplace first, then deploy caller
- [ ] Smoke test one repo -- see ONBOARDING.md Step 4 (break a test, verify auto-fix PR, revert)
- [ ] Verify "Auto Fix" visible in Actions tab of each deployed repo

## Time Estimate

- **6 repos with CI:** ~5 minutes (copy-paste 6 deploy commands + set 2 org secrets)
- **averias-marketplace:** Additional time needed to create CI workflow first

## Notes

- All repos are already registered in `config/repo-stack-map.json`
- `liftit-control-de-asistencia` has custom `allowed_dirs` in repo-stack-map.json (3 source directories for its Kotlin monorepo)
- No other Liftitapp repos need custom `allowed_dirs` overrides -- stack defaults cover their structures
- Default branches vary across repos: main (3), develop (2), master (1), production (1) -- each deploy command targets the correct branch
- See `ONBOARDING.md` in the auto-fix-agent repo for full setup context and troubleshooting

---

*Prepared: 2026-03-03*
*Repos audited: 7 (6 ready for immediate activation, 1 needs CI setup first)*
