# Architecture Decision: GitHub Actions vs OpenClaw/Bumblebee

## Context

Two parallel systems exist for CI failure detection and fixing:

1. **GitHub Actions Pipeline** — `auto-fix-caller.yml` triggers on `workflow_run.completed`, runs Claude Code Action in GitHub-hosted runners
2. **OpenClaw/Bumblebee** — Cron polls `gh run list` every 30 min, can clone repos locally and fix via `gh` CLI

Both can detect and fix CI failures, but they operate independently.

## Decision: Option C — Complementary

**Bumblebee complements GitHub Actions, not replaces it.**

### Division of Responsibilities

| Capability | GitHub Actions | Bumblebee (OpenClaw) |
|-----------|---------------|---------------------|
| CI failure detection | Real-time (`workflow_run` trigger) | Polling (every 30 min — catches what Actions misses) |
| Code fixes | Claude Code Action (sandboxed runner) | Local clone + edit (more tools available) |
| SOLID/DDD scans | N/A | Yes (cron every 12h) |
| Coverage improvement | N/A | Yes (on-demand or cron) |
| PR review comments | N/A | Yes (on-demand) |
| Observability | Sentry via webhook receiver | Telegram notifications |
| Escalation tracking | `needs-human` issues | `interventions/` directory + STATE.md |

### How They Interact

1. **GitHub Actions fires first** — it's real-time, runs within seconds of CI failure
2. **Bumblebee polls as backup** — catches failures where Actions didn't fire (misconfigured caller, Actions quota exhausted, new repo not yet enrolled in Actions)
3. **Bumblebee avoids duplicate work** — before starting a fix, checks if an `auto-fix/*` branch or PR already exists for that run
4. **Bumblebee handles what Actions can't** — SOLID/DDD scans, coverage gaps, on-demand reviews, multi-file refactoring (GSD workflow)

### Dedup Logic for Bumblebee CI Poll

Before attempting a fix, Bumblebee must check:
```
1. gh pr list --repo OWNER/REPO --label auto-fix --state all --json headRefName
2. If any PR branch matches auto-fix/{run_id} → skip (Actions already handled it)
3. If no matching PR → proceed with fix
```

## Rationale

- Actions is better for real-time, sandboxed, per-commit fixes
- Bumblebee is better for holistic repo health (SOLID/DDD, coverage, multi-file fixes)
- Overlap on CI failure detection is intentional — provides redundancy
- Cost-effective: Actions runs only when CI fails, Bumblebee polls cheaply via API

## Status

Decided: 2026-03-10
Implemented: Bumblebee AGENTS.md already includes dedup check in CI Failure Fix workflow
