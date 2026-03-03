---
phase: quick-1
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/03-multi-repo-rollout/03-VERIFICATION.md
  - .github/workflows/promote.yml
autonomous: true
requirements: [PYTHON-PROMPT, KOTLIN-PROMPT, ONBOARDING, PROMOTION-CONFIG, PROMOTE-CALLER-DEPLOY]

must_haves:
  truths:
    - "Phase 3 VERIFICATION.md exists and confirms PYTHON-PROMPT, KOTLIN-PROMPT, ONBOARDING requirements against actual codebase artifacts"
    - "promote.yml reads promotion.enabled from repo-stack-map.json and skips promotion for repos where it is false"
    - "The 4 active fbetancourtc repos (laundry-operating-dash, lavandarosa-petal-web, laundry-property-managers, binance-bot) each have promote-caller.yml on their default branch"
  artifacts:
    - path: ".planning/phases/03-multi-repo-rollout/03-VERIFICATION.md"
      provides: "Phase 3 verification report confirming 3 requirements against codebase"
    - path: ".github/workflows/promote.yml"
      provides: "Promotion workflow that respects promotion.enabled from repo-stack-map.json"
  key_links:
    - from: "promote.yml"
      to: "config/repo-stack-map.json"
      via: "checkout + jq read of .repos[repository].promotion.enabled"
      pattern: "jq.*promotion.*enabled"
---

<objective>
Close 3 gaps identified by the v1.1 milestone audit:
1. Create Phase 3 VERIFICATION.md (verify PYTHON-PROMPT, KOTLIN-PROMPT, ONBOARDING against codebase)
2. Wire promote.yml to read promotion.enabled from repo-stack-map.json (currently dead config)
3. Deploy promote-caller.yml to the 4 active fbetancourtc repos

Purpose: Bring milestone v1.1 from "gaps_found" to "passed" status.
Output: 03-VERIFICATION.md, updated promote.yml, promote-caller.yml deployed to 4 repos.
</objective>

<execution_context>
@/Users/fbetncourtc/.claude/get-shit-done/workflows/execute-plan.md
@/Users/fbetncourtc/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/v1.1-MILESTONE-AUDIT.md
@.planning/phases/03-multi-repo-rollout/03-01-SUMMARY.md
@.planning/phases/03-multi-repo-rollout/03-02-SUMMARY.md
@.planning/phases/04-promotion-and-observability/04-VERIFICATION.md
@.github/workflows/promote.yml
@.github/workflows/promote-caller.example.yml
@config/repo-stack-map.json

<interfaces>
<!-- Key files the executor needs to verify/modify -->

From prompts/python.md (195 lines):
- Must contain 6 categories of Python failure patterns
- Must have ~24 sub-patterns (expanded from 4 bullets)

From prompts/kotlin.md:
- Must exist (left unchanged per user decision)

From ONBOARDING.md:
- Must exist at repo root
- Must cover: secrets, registration, caller deployment, smoke test, troubleshooting

From config/repo-stack-map.json:
- defaults.promotion.enabled = true
- Liftitapp/LiftitFinOps repos have promotion.enabled = false
- fbetancourtc repos inherit default (enabled = true)

From .github/workflows/promote.yml:
- Reusable workflow (on: workflow_call)
- inputs: app_id, repository, merged_pr_number, source_branch, qa_branch, main_branch
- Does NOT currently read repo-stack-map.json at all

From .github/workflows/promote-caller.example.yml:
- Thin caller with promote job + handle-decline job
- Triggers on pull_request.closed and pull_request_review.submitted
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create Phase 3 VERIFICATION.md</name>
  <files>.planning/phases/03-multi-repo-rollout/03-VERIFICATION.md</files>
  <action>
Verify the 3 Phase 3 requirements (PYTHON-PROMPT, KOTLIN-PROMPT, ONBOARDING) against the actual codebase, then write 03-VERIFICATION.md.

Verification checks to perform:

**PYTHON-PROMPT:**
- Read `prompts/python.md` and confirm it has 6 categories of failure patterns (Import Errors, Dependencies, Fixtures, Async, Pydantic v2, Ruff)
- Count sub-patterns to confirm ~24 (expanded from original 4 bullets)
- Confirm it follows the bold-keyword + multi-sentence guidance format from 03-01-SUMMARY

**KOTLIN-PROMPT:**
- Confirm `prompts/kotlin.md` exists
- Note it was deliberately NOT expanded per user decision (verify this matches the decision in STATE.md: "Kotlin prompt left unchanged per user decision -- expand when real failures surface")

**ONBOARDING:**
- Read `ONBOARDING.md` at repo root
- Confirm it covers: prerequisites, secrets setup, repo registration in repo-stack-map.json, caller deployment, smoke test, troubleshooting
- Confirm it references the auto-fix-caller template

Write the verification report following the same structure as 04-VERIFICATION.md:
- Frontmatter with phase, verified timestamp, status, score
- Observable Truths table (3 truths: python prompt expanded, kotlin prompt exists unchanged, onboarding doc complete)
- Required Artifacts table
- Key Links table (python.md referenced by auto-fix.yml, ONBOARDING.md references caller template)
- Requirements Coverage table

The status should be "passed" if all artifacts exist with correct content, or "gaps_found" with specific gap descriptions if anything is missing.
  </action>
  <verify>
    <automated>test -f .planning/phases/03-multi-repo-rollout/03-VERIFICATION.md && grep -q "PYTHON-PROMPT" .planning/phases/03-multi-repo-rollout/03-VERIFICATION.md && grep -q "KOTLIN-PROMPT" .planning/phases/03-multi-repo-rollout/03-VERIFICATION.md && grep -q "ONBOARDING" .planning/phases/03-multi-repo-rollout/03-VERIFICATION.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>03-VERIFICATION.md exists with verified status for all 3 requirements, each with evidence from actual file contents (line numbers, pattern counts, content checks)</done>
</task>

<task type="auto">
  <name>Task 2: Wire promote.yml to read promotion.enabled from repo-stack-map.json</name>
  <files>.github/workflows/promote.yml</files>
  <action>
Add a step at the beginning of the `promote` job (after the token generation step) that:

1. Checks out the auto-fix-agent repo (sparse checkout of just `config/repo-stack-map.json`)
2. Reads `promotion.enabled` for the target repository from repo-stack-map.json using jq
3. Exits early (exit 0) if promotion is disabled for that repo

The lookup logic:
- Read `.repos["$REPO"].promotion.enabled` from repo-stack-map.json
- If the key exists and is `false`, log "Promotion disabled for $REPO in repo-stack-map.json" and exit 0
- If the key does not exist, fall through to defaults.promotion.enabled (which is true)
- If defaults.promotion.enabled is also false, exit 0
- Otherwise, continue with the existing PR creation steps

Insert this as a new step between "Generate token" (step 1) and "Create develop to qa PR" (step 2). The step should be named "Check promotion config".

Use the app token (already generated in step 1) for the checkout since the workflow runs in auto-fix-agent's context.

Implementation detail: Use `actions/checkout@v4` with sparse-checkout to pull only `config/repo-stack-map.json` from `fbetancourtc/auto-fix-agent`. Then use jq to read the config. Set a step output `enabled` that subsequent steps can check, or use an early `exit 0` to skip the entire job.

Approach: Add the checkout + config check step, then wrap steps 2 and 3 (the two PR creation steps) with `if: steps.config.outputs.enabled != 'false'` conditions, OR exit the entire job early. Prefer the early-exit approach since it's simpler and avoids modifying existing steps.

Use this pattern for the new step:
```yaml
- name: Check promotion config
  id: config
  env:
    GH_TOKEN: ${{ steps.app-token.outputs.token }}
    REPO: ${{ inputs.repository }}
  run: |
    # Fetch repo-stack-map.json from auto-fix-agent
    REPO_CONFIG=$(gh api "repos/fbetancourtc/auto-fix-agent/contents/config/repo-stack-map.json" \
      --jq '.content' | base64 -d)

    # Check repo-specific override first, then defaults
    ENABLED=$(echo "$REPO_CONFIG" | jq -r \
      --arg repo "$REPO" \
      'if .repos[$repo].promotion.enabled == false then "false"
       elif .repos[$repo].promotion.enabled == true then "true"
       else .defaults.promotion.enabled // true | tostring
       end')

    if [ "$ENABLED" = "false" ]; then
      echo "Promotion disabled for $REPO in repo-stack-map.json — skipping"
      echo "enabled=false" >> "$GITHUB_OUTPUT"
    else
      echo "Promotion enabled for $REPO"
      echo "enabled=true" >> "$GITHUB_OUTPUT"
    fi
```

Then add `if: steps.config.outputs.enabled != 'false'` to both the "Create develop to qa PR" step and the "Create qa to main PR" step. This is cleaner than early exit because the job still succeeds (green check) rather than appearing to fail.

Do NOT use `actions/checkout` — use the GitHub API via `gh` to fetch the file content (avoids needing a checkout step and is faster). The app token already has read access to the auto-fix-agent repo.
  </action>
  <verify>
    <automated>grep -q "repo-stack-map" .github/workflows/promote.yml && grep -q "promotion" .github/workflows/promote.yml && grep -q "config.outputs.enabled" .github/workflows/promote.yml && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>promote.yml has a config check step that reads promotion.enabled from repo-stack-map.json via GitHub API, and PR creation steps are gated on the result. Repos with promotion.enabled=false (all Liftitapp/LiftitFinOps repos) will be skipped.</done>
</task>

<task type="auto">
  <name>Task 3: Deploy promote-caller.yml to the 4 active fbetancourtc repos</name>
  <files>None (remote repo modifications via GitHub API)</files>
  <action>
Deploy promote-caller.yml to the 4 fbetancourtc repos that have active CI:
1. fbetancourtc/laundry-operating-dash
2. fbetancourtc/lavandarosa-petal-web
3. fbetancourtc/laundry-property-managers
4. fbetancourtc/binance-bot

For each repo:
1. First check if `.github/workflows/promote-caller.yml` already exists on the default branch (main) using:
   `gh api "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml" --jq '.name' 2>/dev/null`
   If it exists, log "Already deployed" and skip.

2. If not present, use the GitHub API to create the file on the main branch:
   - Read the content of `.github/workflows/promote-caller.example.yml` from the local repo
   - Base64-encode it
   - Use `gh api --method PUT "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml"` with the encoded content and commit message "ci: add promote-caller.yml for auto-fix promotion flow"

The caller content should be identical to `promote-caller.example.yml` — it already has the correct `uses:` reference to `fbetancourtc/auto-fix-agent/.github/workflows/promote.yml@main`, the correct app_id, and the handle-decline job.

After deploying to all 4 repos, verify each one by checking the file exists:
   `gh api "repos/OWNER/REPO/contents/.github/workflows/promote-caller.yml" --jq '.name'`
  </action>
  <verify>
    <automated>for repo in laundry-operating-dash lavandarosa-petal-web laundry-property-managers binance-bot; do result=$(gh api "repos/fbetancourtc/$repo/contents/.github/workflows/promote-caller.yml" --jq '.name' 2>/dev/null); if [ "$result" = "promote-caller.yml" ]; then echo "PASS: $repo"; else echo "FAIL: $repo"; fi; done</automated>
  </verify>
  <done>All 4 active fbetancourtc repos have promote-caller.yml deployed on their main branch, enabling the end-to-end promotion flow (auto-fix PR merge -> develop->qa PR -> qa->main PR with human gate)</done>
</task>

</tasks>

<verification>
1. Phase 3 VERIFICATION.md exists and covers all 3 requirements with evidence
2. promote.yml reads promotion.enabled from repo-stack-map.json and gates PR creation
3. All 4 active repos have promote-caller.yml deployed
4. No regressions to existing promote.yml behavior (still creates PRs for enabled repos)
</verification>

<success_criteria>
- 03-VERIFICATION.md exists with "passed" or "gaps_found" status and evidence for each requirement
- promote.yml has a "Check promotion config" step that queries repo-stack-map.json
- promote.yml PR creation steps gated on `steps.config.outputs.enabled != 'false'`
- All 4 repos (laundry-operating-dash, lavandarosa-petal-web, laundry-property-managers, binance-bot) return promote-caller.yml from GitHub API content check
</success_criteria>

<output>
After completion, create `.planning/quick/1-fix-milestone-v1-1-audit-gaps-phase-3-ve/1-SUMMARY.md`
</output>
