# Secrets Audit - Phase 03 Enrollment

**Date:** 2026-03-03 (re-verified: 2026-03-03)

## fbetancourtc (repo-level secrets)

All 7 repos have both required secrets configured at repo level. Org-level secrets API returned 404 (not configured or insufficient permissions), but repo-level secrets are sufficient.

| Repo | ANTHROPIC_API_KEY | AUTO_FIX_APP_PRIVATE_KEY |
|------|-------------------|-------------------------|
| laundry-operating-dash | configured | configured |
| lavandarosa-platform | configured | configured |
| lavandarosa-petal-web | configured | configured |
| laundry-property-managers | configured | configured |
| laundry-cleaning-staff | configured | configured |
| laundry-admin-dash | configured | configured |
| binance-bot | configured | configured |

## LiftitFinOps/conciliacion-averias (repo-level)

| Secret | Status |
|--------|--------|
| ANTHROPIC_API_KEY | **MISSING** |
| AUTO_FIX_APP_PRIVATE_KEY | **MISSING** |

## User Action Required

**LiftitFinOps/conciliacion-averias needs 2 secrets configured:**

1. Go to https://github.com/LiftitFinOps/conciliacion-averias/settings/secrets/actions
2. Click "New repository secret"
3. Add `ANTHROPIC_API_KEY` with your Anthropic API key value
4. Add `AUTO_FIX_APP_PRIVATE_KEY` with the GitHub App private key (same key used in fbetancourtc repos)

**fbetancourtc repos:** No action required -- all 7 repos have both secrets configured.
