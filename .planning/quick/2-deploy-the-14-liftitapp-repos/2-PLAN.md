---
phase: quick-2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/deploy-callers.sh
autonomous: true
requirements: [CALLER-DEPLOY-LIFTITAPP, PROMOTE-CALLER-REMAINING]

must_haves:
  truths:
    - "All 7 Liftitapp repos have auto-fix-caller.yml on their default branch with correct CI workflow name(s)"
    - "The 3 remaining fbetancourtc repos (lavandarosa-platform, laundry-cleaning-staff, laundry-admin-dash) have promote-caller.yml deployed"
    - "averias-marketplace is skipped with a logged warning (has no CI workflows)"
    - "Each caller's workflows: list exactly matches the name: field in the repo's CI YAML"
  artifacts:
    - path: "scripts/deploy-callers.sh"
      provides: "Reusable deployment script for caller workflows across all repos"
  key_links:
    - from: "auto-fix-caller.yml (deployed to each repo)"
      to: "fbetancourtc/auto-fix-agent/.github/workflows/auto-fix.yml@main"
      via: "uses: reference in caller workflow"
      pattern: "uses:.*auto-fix-agent.*auto-fix.yml"
    - from: "promote-caller.yml (deployed to each repo)"
      to: "fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main"
      via: "uses: reference in caller workflow"
      pattern: "uses:.*auto-fix-agent.*promote.yml"
---

<objective>
Deploy auto-fix-caller.yml to the 7 Liftitapp repos that are missing it, and promote-caller.yml to the 3 remaining fbetancourtc repos. Each auto-fix-caller.yml is customized with the exact CI workflow name(s) from that repo. Also deploy promote-caller.yml to repos where promotion.enabled is true (fbetancourtc repos that inherit the default).

Purpose: Complete the rollout of auto-fix-agent across all 15 repos in repo-stack-map.json.
Output: All repos have their caller workflows on their default branch; a reusable deploy script for future repos.
</objective>

<execution_context>
@/Users/fbetncourtc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/fbetncourtc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@config/repo-stack-map.json
@.github/workflows/auto-fix-caller.example.yml
@.github/workflows/promote-caller.example.yml
@ONBOARDING.md

<interfaces>
<!-- Discovery results: CI workflow names and default branches per Liftitapp repo -->
<!-- These were discovered via `gh api` on 2026-03-03 -->

Liftitapp/liftit-control-de-asistencia:
  default_branch: main
  ci_workflows: ["Android CI/CD", "Backend CI/CD", "Dashboard CI/CD"]

Liftitapp/averias-marketplace:
  default_branch: main
  ci_workflows: []  # NO CI — skip with warning (STATE.md: "needs CI setup before auto-fix activation")

Liftitapp/geocoding-enterprise:
  default_branch: develop
  ci_workflows: ["CI"]  # quality-gate.yml ("Quality Gate") is not a CI build workflow

Liftitapp/conciliacion-recaudo-liftit:
  default_branch: develop
  ci_workflows: ["CI"]

Liftitapp/liftit-ai-system:
  default_branch: production
  ci_workflows: ["Pull Request Checks"]  # This is the PR CI check; "Development Pipeline" is CD

Liftitapp/geocoding-liftit-api:
  default_branch: master
  ci_workflows: ["Geocoding CI"]

Liftitapp/liftit-cargo-receptor-de-cumplidos:
  default_branch: main
  ci_workflows: ["CI Pipeline"]  # ci-e2e.yml ("E2E Tests") is separate, not the main CI

<!-- promote-caller.yml still missing from these fbetancourtc repos (promotion.enabled=true via default): -->
fbetancourtc/lavandarosa-platform (default_branch: main)
fbetancourtc/laundry-cleaning-staff (default_branch: main)
fbetancourtc/laundry-admin-dash (default_branch: main)

<!-- auto-fix-caller.yml template from auto-fix-caller.example.yml: -->
name: Auto Fix
on:
  workflow_run:
    workflows: [CI]  # <-- this line gets customized per repo
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
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Deploy auto-fix-caller.yml to the 7 Liftitapp repos</name>
  <files>None (remote repo modifications via GitHub API)</files>
  <action>
For each of the 6 Liftitapp repos that have CI workflows (skip averias-marketplace), deploy a customized auto-fix-caller.yml to the repo's default branch using `gh api --method PUT`.

The caller content is identical to `.github/workflows/auto-fix-caller.example.yml` EXCEPT the `workflows:` line is customized per repo.

Deploy to these repos with these exact settings:

1. **Liftitapp/liftit-control-de-asistencia** (branch: main)
   `workflows: ["Android CI/CD", "Backend CI/CD", "Dashboard CI/CD"]`

2. **Liftitapp/geocoding-enterprise** (branch: develop)
   `workflows: [CI]`

3. **Liftitapp/conciliacion-recaudo-liftit** (branch: develop)
   `workflows: [CI]`

4. **Liftitapp/liftit-ai-system** (branch: production)
   `workflows: ["Pull Request Checks"]`

5. **Liftitapp/geocoding-liftit-api** (branch: master)
   `workflows: ["Geocoding CI"]`

6. **Liftitapp/liftit-cargo-receptor-de-cumplidos** (branch: main)
   `workflows: ["CI Pipeline"]`

**Skip:** Liftitapp/averias-marketplace -- no CI workflows exist. Log: "SKIP: Liftitapp/averias-marketplace -- no CI workflows (needs CI setup first)"

For each repo:
1. First check if auto-fix-caller.yml already exists: `gh api "repos/OWNER/REPO/contents/.github/workflows/auto-fix-caller.yml" --jq '.name' 2>/dev/null`
   - If exists, log "ALREADY DEPLOYED" and skip.

2. Generate the customized YAML content by reading auto-fix-caller.example.yml and replacing the `workflows: [CI]` line with the repo-specific workflows list.

3. Base64-encode the content and push via:
   ```
   gh api --method PUT "repos/OWNER/REPO/contents/.github/workflows/auto-fix-caller.yml" \
     -f message="ci: add auto-fix-caller.yml for auto-fix-agent integration" \
     -f content="BASE64_CONTENT" \
     -f branch="DEFAULT_BRANCH"
   ```

4. Verify each deployment: `gh api "repos/OWNER/REPO/contents/.github/workflows/auto-fix-caller.yml" --jq '.name'`

IMPORTANT: The `workflows:` value MUST be a YAML list. For single-item lists like `[CI]`, the format is `workflows: [CI]`. For multi-item lists, use `workflows: ["Android CI/CD", "Backend CI/CD", "Dashboard CI/CD"]`. Workflow names with special characters (slashes, spaces) must be quoted in YAML.
  </action>
  <verify>
    <automated>for repo in Liftitapp/liftit-control-de-asistencia Liftitapp/geocoding-enterprise Liftitapp/conciliacion-recaudo-liftit Liftitapp/liftit-ai-system Liftitapp/geocoding-liftit-api Liftitapp/liftit-cargo-receptor-de-cumplidos; do result=$(gh api "repos/$repo/contents/.github/workflows/auto-fix-caller.yml" --jq '.name' 2>/dev/null); if [ "$result" = "auto-fix-caller.yml" ]; then echo "PASS: $repo"; else echo "FAIL: $repo"; fi; done</automated>
  </verify>
  <done>All 6 Liftitapp repos with CI have auto-fix-caller.yml on their default branch. averias-marketplace is skipped with documented reason. Each caller's workflows list matches the actual CI workflow name(s) in that repo.</done>
</task>

<task type="auto">
  <name>Task 2: Deploy promote-caller.yml to the 3 remaining fbetancourtc repos</name>
  <files>None (remote repo modifications via GitHub API)</files>
  <action>
Deploy promote-caller.yml to the 3 fbetancourtc repos that are missing it. These repos have promotion.enabled=true (inherited from defaults).

Repos to deploy:
1. **fbetancourtc/lavandarosa-platform** (branch: main)
2. **fbetancourtc/laundry-cleaning-staff** (branch: main)
3. **fbetancourtc/laundry-admin-dash** (branch: main)

The promote-caller.yml content is IDENTICAL to `.github/workflows/promote-caller.example.yml` -- no customization needed.

For each repo:
1. Check if already exists: `gh api "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml" --jq '.name' 2>/dev/null`
   - If exists, log "ALREADY DEPLOYED" and skip.

2. Read `.github/workflows/promote-caller.example.yml` from local repo, base64-encode it.

3. Push via GitHub API:
   ```
   gh api --method PUT "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml" \
     -f message="ci: add promote-caller.yml for auto-fix promotion flow" \
     -f content="BASE64_CONTENT" \
     -f branch="main"
   ```

4. Verify: `gh api "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml" --jq '.name'`

Do NOT deploy promote-caller.yml to Liftitapp or LiftitFinOps repos -- they all have promotion.enabled=false.
  </action>
  <verify>
    <automated>for repo in fbetancourtc/lavandarosa-platform fbetancourtc/laundry-cleaning-staff fbetancourtc/laundry-admin-dash; do result=$(gh api "repos/$repo/contents/.github/workflows/promote-caller.yml" --jq '.name' 2>/dev/null); if [ "$result" = "promote-caller.yml" ]; then echo "PASS: $repo"; else echo "FAIL: $repo"; fi; done</automated>
  </verify>
  <done>All 3 remaining fbetancourtc repos have promote-caller.yml on main branch. All 7 fbetancourtc repos now have both auto-fix-caller.yml and promote-caller.yml.</done>
</task>

<task type="auto">
  <name>Task 3: Create reusable deploy-callers.sh script for future repos</name>
  <files>scripts/deploy-callers.sh</files>
  <action>
Create a reusable bash script at `scripts/deploy-callers.sh` that automates deploying caller workflows to any repo listed in repo-stack-map.json.

The script should:

1. Read `config/repo-stack-map.json` and iterate over all repos.
2. For each repo:
   a. Get the default branch via `gh api "repos/$REPO" --jq '.default_branch'`
   b. Check if auto-fix-caller.yml already exists on the default branch
   c. If missing, discover CI workflow names by listing `.github/workflows/*.yml` files and extracting the `name:` field from each
   d. Filter to CI-relevant workflows (heuristic: include workflows with names containing "CI", "Build", "Test", "Pipeline", "Checks", "PR"; exclude names containing "Deploy", "Release", "CD", "CodeQL", "E2E", "Preview", "Validation", "Utilities")
   e. Generate the customized auto-fix-caller.yml content with the discovered workflow names
   f. Push via `gh api --method PUT`
3. For repos where promotion.enabled is true (check repo-specific override, fall back to defaults):
   a. Check if promote-caller.yml already exists
   b. If missing, push the promote-caller.example.yml content as-is
4. Print a summary table at the end showing: repo, auto-fix status, promote status, workflows discovered

Usage: `bash scripts/deploy-callers.sh [--dry-run]`

The `--dry-run` flag should show what WOULD be deployed without actually pushing.

Include a shebang line (`#!/usr/bin/env bash`), `set -euo pipefail`, and require `jq` and `gh` as dependencies (check at script start).

Keep the script simple and focused. The CI workflow name discovery heuristic does not need to be perfect -- it should log warnings when zero CI workflows are found and skip the repo (like averias-marketplace).
  </action>
  <verify>
    <automated>bash scripts/deploy-callers.sh --dry-run 2>&1 | head -50 && echo "PASS: script runs in dry-run mode"</automated>
  </verify>
  <done>scripts/deploy-callers.sh exists, is executable, and can enumerate all repos from repo-stack-map.json with --dry-run showing what would be deployed. Future repo additions to repo-stack-map.json can be deployed by re-running this script.</done>
</task>

</tasks>

<verification>
1. All 6 Liftitapp repos (excluding averias-marketplace) return auto-fix-caller.yml from GitHub API content check
2. All 7 fbetancourtc repos return promote-caller.yml from GitHub API content check
3. Each deployed auto-fix-caller.yml has the correct workflows list matching the repo's CI workflow names
4. scripts/deploy-callers.sh runs successfully in --dry-run mode
5. LiftitFinOps/conciliacion-averias already has auto-fix-caller.yml (deployed previously) -- no action needed
</verification>

<success_criteria>
- 13 of 15 repos have auto-fix-caller.yml deployed (all except averias-marketplace which has no CI, and LiftitFinOps/conciliacion-averias which already had it)
- All 7 fbetancourtc repos have promote-caller.yml deployed
- Liftitapp/LiftitFinOps repos do NOT have promote-caller.yml (promotion.enabled=false)
- scripts/deploy-callers.sh exists for future repo onboarding
- No regressions to existing caller deployments
</success_criteria>

<output>
After completion, create `.planning/quick/2-deploy-the-14-liftitapp-repos/2-SUMMARY.md`
</output>
