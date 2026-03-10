# Code Quality Skill

## Name
code-quality

## Description
Autonomous code quality guardian — fixes CI failures, linting violations, test failures, coverage gaps, and enforces SOLID and DDD principles across enrolled repositories.

## Capabilities

| Command | Trigger | Description |
|---------|---------|-------------|
| `fix ci` | CI failure detected | Diagnose and fix build/test/lint/type failures |
| `fix linter` | Lint errors detected | Auto-fix linting violations, manually fix what auto-fix can't |
| `fix unit-tests` | Test failures detected | Fix failing unit tests by fixing the source code |
| `fix e2e-tests` | E2E failures detected | Fix failing end-to-end tests |
| `fix coverage` | Coverage below threshold | Add missing tests to improve coverage |
| `review solid` | Cron or on-demand | Scan for SOLID principle violations |
| `review ddd` | Cron or on-demand | Scan for DDD principle violations |

## Configuration

- `repo-config.json` — Enrolled repos, stacks, allowed directories, and commands
- Stack-specific prompts in `fix-ci.md`, `fix-linter.md`, etc.

## Usage

### Automatic (via cron)
- Every 10 min: Poll for CI failures → auto-fix
- Every 6 hours: SOLID/DDD scan → review comments or improvement PRs
- Daily 9 AM: Summary report via Telegram

### On-demand (via Telegram)
- "Fix CI failures in fbetancourtc/auto-fix-agent"
- "Run SOLID scan on auto-fix-agent"
- "Check coverage for auto-fix-agent"
- "Review DDD patterns in auto-fix-agent"

## Safety
- Max 2 fix attempts per failure, then escalate
- Only modifies files in allowed directories
- Never deletes tests or adds suppression comments
- Always verifies fixes before committing
- Creates PRs for human review — never auto-merges
