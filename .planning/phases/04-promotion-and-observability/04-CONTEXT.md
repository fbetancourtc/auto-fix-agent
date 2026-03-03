# Phase 4: Promotion and Observability - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Add develop→qa→main promotion flow with human approval gate when auto-fix PRs merge, plus success rate tracking per repo, cost-per-fix tracking via token usage, and budget alerts at 50%/80% of $200/month threshold. Interactive code review (@claude) and other new capabilities are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Promotion trigger & branching
- Per-fix promotion: each merged auto-fix PR immediately triggers a develop→qa PR creation
- Fix PRs always target develop (current behavior, no change)
- Central reusable workflow pattern: new `promote.yml` in auto-fix-agent, thin callers in each repo (mirrors auto-fix-caller.yml pattern)
- Claude audits repos during research to confirm develop→qa→main branch strategy exists per repo; repos without qa branch get documented for exclusion or setup

### Approval gate mechanism
- Manual merge gate: the workflow creates the qa→main PR but never auto-merges — human must click "Merge"
- CI must pass on qa branch before qa→main PR is merge-ready (branch protection)
- If reviewer declines: close the qa→main PR and add 'needs-human' label — fix stays on develop/qa but doesn't reach main
- Approver: repo owner (just you for now)

### Tracking data storage
- JSON files in auto-fix-agent repo (e.g., `metrics/runs.json`) — updated by workflow after each run
- Success = agent created a fix PR (tracks agent capability regardless of merge decisions)
- Cost calculated via hardcoded rate table in `config/pricing.json` — tokens × rate, manually updated when pricing changes
- GitHub Actions summary table per run for immediate visibility; raw JSON for aggregation

### Budget alerts
- GitHub Issue auto-created in auto-fix-agent when 50% or 80% thresholds hit, tagged 'budget-alert'
- At 100%: alert only — auto-fix keeps running, you decide manually whether to pause
- Budget counter auto-resets on 1st of each month
- Aggregate budget across all repos ($200/month total), no per-repo limits

### Claude's Discretion
- Exact promotion workflow implementation details (reusable workflow inputs/outputs)
- How token usage is extracted from Claude Code Action output
- JSON schema for metrics/runs.json
- Whether to batch-update metrics or append per-run
- Branch protection rule configuration approach per org

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auto-fix.yml`: Production reusable workflow — promotion workflow follows same pattern (workflow_call, cross-org token, per-repo callers)
- `auto-fix-caller.example.yml`: Template for thin callers — need equivalent `promote-caller.example.yml`
- `config/repo-stack-map.json`: All 14 repos mapped — can extend with branch strategy info if needed
- `scripts/validate-diff.sh` and `scripts/sanitize-logs.sh`: Established script pattern in `scripts/` directory

### Established Patterns
- Reusable workflow + thin caller architecture (central logic, per-repo trigger)
- Cross-org token via GitHub App (actions/create-github-app-token@v2)
- Explicit secrets passing (never `secrets: inherit`)
- Circuit breaker and retry guard patterns for safety
- Track-attempt step creates closed PR for counting — similar pattern could track metrics

### Integration Points
- Promotion caller triggers on auto-fix PR merge (pull_request.closed + merged condition)
- `auto-fix.yml` step 8 (Claude Code Action) — needs to output token usage for cost tracking
- `config/` directory for pricing.json
- `metrics/` new directory for run data
- GitHub App permissions may need expansion for environment/protection rule management

</code_context>

<specifics>
## Specific Ideas

- Follow the same central-repo + thin-caller architecture proven in Phase 2-3
- Budget alerts as GitHub Issues means they show up in normal notification flow — no new channels
- Keep qa→main as manual-merge-only: the PR itself is the approval gate, no complex environment protection rules needed

</specifics>

<deferred>
## Deferred Ideas

- `@claude` interactive code review via PR comments — separate capability
- Per-repo budget limits — start with aggregate, add granularity if needed
- Slack/Teams notifications — GitHub PR notifications suffice (PROJECT.md out-of-scope)
- Dashboard UI for metrics — start with raw JSON + Actions summaries

</deferred>

---

*Phase: 04-promotion-and-observability*
*Context gathered: 2026-03-02*
