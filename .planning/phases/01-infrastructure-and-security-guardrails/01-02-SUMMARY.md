# Plan 01-02 Summary: Security Guardrails

**Status:** COMPLETE
**Completed:** 2026-03-02

## What was built

### SECR-01: Input Sanitization
- **`scripts/sanitize-logs.sh`** — Strips prompt injection patterns (role assumption, system prompt override, instruction injection), shell injection (`backtick`, `$()`), redacts GitHub tokens (`ghp_`, `ghs_`, `github_pat_`), API keys (`sk-`), and secret assignments. Truncates to 500 lines.

### SECR-02: Circuit Breaker
- Branch check: blocks if head branch starts with `auto-fix/`
- PR label check: blocks if any open PR on the branch has `auto-fix` label
- Fails open (proceeds if API call fails) to avoid blocking legitimate fixes

### SECR-03: Token/Time Limits
- `--max-turns 10` in claude_args (soft cap)
- `timeout-minutes: 15` on job (hard cap)
- Combined worst case: ~$5.00 per run

### SECR-04: Scope Restriction
- `--allowedTools` restricts agent to Edit, Read, Write, and specific test/lint Bash commands
- No tokens or secrets in agent step's env block
- Minimal workflow permissions: `contents: write`, `pull-requests: write`, `actions: read`

### Test Workflow
- **`.github/workflows/test-guardrails.yml`** — Manual dispatch with choice of individual or all guardrail tests. Validates sanitization effectiveness, circuit-breaker structure, token limits, and scope restriction.

## Workflow Architecture Change
- Added separate checkout of central repo (`_auto-fix-scripts/`) for scripts, prompts, and config
- Failing repo checked out as main working directory
- All references to prompts/config/scripts use `_auto-fix-scripts/` prefix

## Files Modified
- `.github/workflows/auto-fix.yml` — Full security guardrails integrated
- `scripts/sanitize-logs.sh` — New: log sanitization script
- `.github/workflows/test-guardrails.yml` — New: guardrail test workflow
