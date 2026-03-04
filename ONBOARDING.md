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

## Webhook Registration

The auto-fix monitoring system receives GitHub webhook events via a Vercel serverless function. One **org-level webhook** is registered per GitHub organization. All orgs share the same webhook secret.

### Subscribed Events

Each webhook must be subscribed to exactly 3 event types:

- **Workflow runs** -- triggers auto-fix analysis on CI failures
- **Pull requests** -- tracks auto-fix PR lifecycle (opened, merged, closed)
- **Pull request reviews** -- tracks review outcomes on auto-fix PRs

### Registration Steps

For each organization, register a webhook with the following settings:

1. Navigate to the org's webhook settings page (see URLs below)
2. Click **Add webhook**
3. Configure:
   - **Payload URL:** `https://<your-vercel-app>.vercel.app/api/webhook` (NO trailing slash -- critical to avoid Vercel 308 redirect)
   - **Content type:** `application/json`
   - **Secret:** Use the same `GITHUB_WEBHOOK_SECRET` value configured in Vercel environment variables
   - **Which events:** Select "Let me select individual events" then check:
     - `Workflow runs`
     - `Pull requests`
     - `Pull request reviews`
   - **Active:** checked
4. Click **Add webhook** to save

### Organization Webhook Settings URLs

| Organization | Type | Webhook Settings URL |
|---|---|---|
| `fbetancourtc` | Personal account | https://github.com/settings/hooks |
| `Liftitapp` | Organization | https://github.com/organizations/Liftitapp/settings/hooks |
| `LiftitFinOps` | Organization | https://github.com/organizations/LiftitFinOps/settings/hooks |

**Note:** `fbetancourtc` is a personal account, so use the account-level hooks page (`github.com/settings/hooks`) instead of the organization path.

### Verification

After registering each webhook:

1. Click **Test** on the webhook entry to send a ping event
2. Check **Vercel function logs** (Dashboard > Project > Functions > api/webhook) for the incoming request
3. Check the **GitHub webhook delivery log** (Recent Deliveries tab on the webhook page) -- should show a 200 response
4. Check **Sentry** for the `auto-fix-monitor` project -- should show breadcrumbs from the ping event (no errors). The ping is filtered as an unrecognized event type and logged as a Sentry breadcrumb.

### Webhook Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| 308 response | Payload URL has a trailing slash | Remove the trailing slash from the webhook URL |
| 401 response | Signature mismatch | Verify `GITHUB_WEBHOOK_SECRET` matches between the Vercel env var and the GitHub webhook secret field |
| 404 response | Non-production deployment or wrong URL | Verify Vercel deployment is on main branch (Production) and `VERCEL_ENV` is `production` |
| No response | Function not deployed | Verify the Vercel project is deployed and the function appears in Vercel Dashboard > Functions tab |
