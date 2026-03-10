# GitHub Setup Checklist — Auto-Fix Agent

Everything you need to configure in GitHub to complete the auto-fix pipeline.
Three sections: repo secrets, webhook registration, and Liftitapp activation.

---

## 1. Repository Secrets for auto-fix-agent

The CI/CD pipeline deploys to Vercel automatically when code lands on `main`.
These secrets enable that deployment.

**Go to:** https://github.com/fbetancourtc/auto-fix-agent/settings/secrets/actions

Add these **3 repository secrets**:

| Secret | Value | Where to find it |
|---|---|---|
| `VERCEL_TOKEN` | Personal access token | Vercel Dashboard → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Your Vercel org/user ID | Run `vercel link` locally → `.vercel/project.json` → `"orgId"` |
| `VERCEL_PROJECT_ID` | The project ID | Same file → `"projectId"` |

Then add this **repository variable** (not secret):

**Go to:** https://github.com/fbetancourtc/auto-fix-agent/settings/variables/actions

| Variable | Value |
|---|---|
| `VERCEL_PRODUCTION_URL` | `https://auto-fix-agent.vercel.app` |

---

## 2. Webhook Registration (3 accounts)

Register an org-level webhook on each GitHub account/org. All three use the **same settings** — only the URL where you register changes.

### Settings for ALL webhooks

| Field | Value |
|---|---|
| **Payload URL** | `https://auto-fix-agent.vercel.app/api/webhook` |
| **Content type** | `application/json` |
| **Secret** | Same value as `GITHUB_WEBHOOK_SECRET` in Vercel env vars |
| **SSL verification** | Enable |
| **Which events** | Select "Let me select individual events" |
| **Active** | ✅ Checked |

### Events to check (exactly these 3)

- [x] **Workflow runs**
- [x] **Pull requests**
- [x] **Pull request reviews**

Uncheck everything else (especially "Pushes" which is checked by default).

### Where to register

Do this 3 times, once per account:

#### A. fbetancourtc (personal account)

1. Go to https://github.com/settings/hooks
2. Click **Add webhook**
3. Fill in the settings above
4. Click **Add webhook**
5. After saving, click the webhook → **Recent Deliveries** → verify the ping shows `200`

#### B. Liftitapp (organization)

1. Go to https://github.com/organizations/Liftitapp/settings/hooks
2. Click **Add webhook**
3. Same settings as above
4. Click **Add webhook**
5. Verify ping shows `200`

#### C. LiftitFinOps (organization)

1. Go to https://github.com/organizations/LiftitFinOps/settings/hooks
2. Click **Add webhook**
3. Same settings as above
4. Click **Add webhook**
5. Verify ping shows `200`

### Troubleshooting

- **308 response** → Remove trailing slash from Payload URL
- **401 response** → Secret doesn't match the `GITHUB_WEBHOOK_SECRET` in Vercel
- **404 response** → Vercel isn't deployed to production, or URL is wrong
- **No response** → Check Vercel Dashboard → Functions tab, make sure `api/webhook` exists

---

## 3. Missing Secrets: LiftitFinOps/conciliacion-averias

This repo is enrolled in auto-fix but missing both required secrets.

**Go to:** https://github.com/LiftitFinOps/conciliacion-averias/settings/secrets/actions

Add these 2 secrets:

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (same one used in fbetancourtc repos) |
| `AUTO_FIX_APP_PRIVATE_KEY` | GitHub App private key PEM (same key used in fbetancourtc repos) |

---

## 4. Liftitapp Org — GitHub App Installation (needs org admin)

The auto-fix GitHub App is not installed on the Liftitapp org. Until an admin installs it, the 7 Liftitapp repos cannot use auto-fix.

**Ask an org admin to:**

1. Go to https://github.com/apps/auto-fix-agent-app (or the app's installation URL)
2. Click **Install** → Select the **Liftitapp** organization
3. Grant access to **All repositories** (or select the 7 repos below)
4. Required permissions: Contents (R/W), Pull Requests (R/W), Actions (Read), Issues (R/W)

**After the app is installed, configure org-level secrets:**

Go to: https://github.com/organizations/Liftitapp/settings/secrets/actions

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `AUTO_FIX_APP_PRIVATE_KEY` | GitHub App private key PEM |

Set repository access to "All repositories" or select these 7:

- liftit-control-de-asistencia
- averias-marketplace
- geocoding-enterprise
- conciliacion-recaudo-liftit
- liftit-ai-system
- geocoding-liftit-api
- liftit-cargo-receptor-de-cumplidos

**Then deploy caller workflows** to each repo following the activation guide at:
`.planning/phases/03-multi-repo-rollout/liftitapp-activation.md`

---

## Summary

| Task | Who | Time |
|---|---|---|
| auto-fix-agent repo secrets (Vercel) | You | 2 min |
| Webhook registration (3 accounts) | You | 5 min |
| LiftitFinOps/conciliacion-averias secrets | You | 1 min |
| Liftitapp GitHub App install + secrets | Org admin | 5 min |
| Liftitapp caller workflow deployment | You (after admin) | 10 min |
