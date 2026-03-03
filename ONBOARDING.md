# Auto-Fix Agent: Onboarding Guide

When CI fails on your repo, the auto-fix agent automatically analyzes the failure logs, implements a source-code-only fix, and opens a PR for human review. It supports TypeScript, Python, and Kotlin stacks. The system uses Claude Code Action with stack-specific prompts and safety guardrails (directory restrictions, diff validation, retry limits).

## Prerequisites

- GitHub App (ID: 2985828) installed on your org -- contact repo admin if not installed
- Two secrets configured (see Step 1)
- Your repo listed in `config/repo-stack-map.json` in the central auto-fix-agent repo

## Step 1: Configure Secrets

Two secrets are required: `ANTHROPIC_API_KEY` and `AUTO_FIX_APP_PRIVATE_KEY`.

### Org-level secrets (recommended for 2+ repos)

1. Go to org Settings > Secrets and variables > Actions
2. Add `ANTHROPIC_API_KEY` (from Anthropic dashboard)
3. Add `AUTO_FIX_APP_PRIVATE_KEY` (from GitHub App settings > Private keys)
4. Set repository access policy to "All repositories" or select specific repos

### Repo-level secrets (for single repos or overrides)

1. Go to repo Settings > Secrets and variables > Actions
2. Add both secrets (same values as above)

**Note:** Repo-level secrets take precedence over org-level. Cross-org `secrets: inherit` does NOT work -- the caller template passes secrets explicitly.

## Step 2: Register Your Repo

Add your repo to `config/repo-stack-map.json` in the central `fbetancourtc/auto-fix-agent` repo:

```json
"your-org/your-repo": { "stack": "python" }
```

If your repo has a non-standard directory structure, add custom `allowed_dirs`:

```json
"your-org/your-repo": {
  "stack": "python",
  "allowed_dirs": ["backend/src/", "api/", "tests/"]
}
```

Stack defaults are defined in the `defaults` section of the same file. Supported stacks: `typescript`, `python`, `kotlin`.

## Step 3: Deploy Caller Workflow

1. Copy `.github/workflows/auto-fix-caller.example.yml` from this repo
2. Save as `.github/workflows/auto-fix-caller.yml` in your target repo
3. Customize the `workflows:` list to match your CI workflow name(s):

```yaml
workflows: [CI]  # Must match the 'name:' field in your CI workflow YAML exactly
```

To find your CI workflow name(s):

```bash
grep "^name:" .github/workflows/*.yml
```

4. **Merge to default branch** -- `workflow_run` only triggers from the default branch (main/develop). A PR alone is not sufficient.

## Step 4: Verify Setup (Smoke Test)

1. Create a test branch: `git checkout -b test/auto-fix-verify`
2. Introduce a deliberate test failure (e.g., change `assert True` to `assert False` in a test file)
3. Push and wait for CI to fail
4. Wait for the "Auto Fix" workflow to trigger (visible in Actions tab)
5. Verify an auto-fix PR is created with the `auto-fix` label
6. Close the auto-fix PR
7. Delete the test branch (the deliberate failure gets cleaned up)

## Customization

**Workflow names:** Edit the `workflows:` list in your caller to match your CI workflows. Use exact names from `name:` fields. Example: `workflows: [CI, Lint, Build]`.

**Directory restrictions:** The agent can only modify files in directories listed in `allowed_dirs`. Stack defaults cover standard layouts. Add per-repo overrides in `repo-stack-map.json` for non-standard structures.

**Stack detection:** The agent selects the fix prompt based on the `stack` field in `repo-stack-map.json`. Supported: `typescript`, `python`, `kotlin`.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Auto Fix workflow never triggers | Caller not on default branch OR workflow name mismatch | Merge caller to main/develop. Check `workflows:` matches CI `name:` exactly |
| Workflow fails at "Generate token" | GitHub App not installed on org | Contact org admin to install App ID 2985828 |
| Workflow fails at agent step | Missing ANTHROPIC_API_KEY secret | Add secret at org or repo level |
| Agent modifies wrong files | Missing or incorrect `allowed_dirs` | Update `repo-stack-map.json` with correct dirs |
| PR created against wrong branch | `--base develop` in prompt vs repo default | Verify repo's default branch matches prompt config |
| "needs-human" issue created | Agent failed 2x on same failure | Human review required -- check the linked PRs for what the agent tried |
