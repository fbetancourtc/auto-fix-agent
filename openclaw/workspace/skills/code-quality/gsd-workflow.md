# GSD Structured Workflow Reference

## When to Use

Use the full GSD workflow when an issue is classified as **COMPLEX**:
- Multiple files affected
- Root cause not obvious from error message
- Fix requires understanding module relationships
- Any refactoring task (SOLID/DDD)
- Coverage improvement requiring new test suites

## XML Task Format

Every plan uses XML tasks. This format is non-negotiable for complex interventions.

```xml
<task id="1" type="auto">
  <name>Short description of what this task does</name>
  <files>path/to/file1.ts, path/to/file2.ts</files>
  <action>
    Precise implementation steps:
    1. Open file1.ts and locate the function X
    2. Extract the Y logic into a new function Z
    3. Update file2.ts to import Z instead of using inline logic
    4. Add parameter validation for edge case W
  </action>
  <verify>npx vitest run src/module/ && npx tsc --noEmit</verify>
  <done>Module tests pass, no type errors, function Z is properly extracted</done>
</task>

<task id="2" type="auto" depends="1">
  <name>Next task that builds on task 1</name>
  <files>path/to/file3.ts</files>
  <action>
    1. Update imports to use the new function Z from task 1
    2. Remove the deprecated inline implementation
  </action>
  <verify>npx vitest run src/other-module/ && npx tsc --noEmit</verify>
  <done>Other module tests pass, no dead code remains</done>
</task>
```

### Task Attributes

| Attribute | Required | Values | Description |
|-----------|----------|--------|-------------|
| `id` | Yes | Sequential number | Execution order |
| `type` | Yes | `auto` | Always auto for CodeQual |
| `depends` | No | Task ID | Must complete before this task starts |

### Task Elements

| Element | Required | Description |
|---------|----------|-------------|
| `<name>` | Yes | One-line description (used in commit message) |
| `<files>` | Yes | Comma-separated file paths to modify |
| `<action>` | Yes | Numbered steps — precise enough to implement without ambiguity |
| `<verify>` | Yes | Shell command that proves this task worked |
| `<done>` | Yes | Human-readable definition of done |

### Planning Rules

1. **Max 5 tasks per intervention** — Split larger work into multiple PRs
2. **Each task modifies 1-3 files** — Keeps commits atomic and reviewable
3. **Every task has a verify command** — No task without verification
4. **Dependencies are explicit** — Use `depends` attribute, never implicit ordering
5. **Actions are precise** — "Update the import" not "fix the imports"
6. **Done criteria are testable** — "Tests pass" not "code is better"

## Execution Protocol

### Before Execution
```
1. Read PLAN.md completely
2. Identify task execution order (respect depends)
3. Ensure all tools available (gh, test runners, linters)
```

### Per-Task Loop
```
FOR each task in dependency order:
  1. Read <action> steps
  2. Implement changes to <files>
  3. Run <verify> command
  4. IF verify PASSES:
     - git add <files>
     - git commit -m "fix(scope): <name>"
     - Continue to next task
  5. IF verify FAILS:
     - STOP execution
     - Document failure in SUMMARY.md
     - Analyze: is the plan wrong or the implementation?
     - If plan wrong: re-plan this task (max 2 re-plans)
     - If implementation wrong: retry (max 2 retries)
     - If exhausted: escalate
```

### After All Tasks
```
1. Run full verification suite for the stack
2. IF passes: push branch, create PR
3. IF fails: identify failing task, revert its commit, re-plan
4. Create SUMMARY.md
5. Update STATE.md
6. Notify Telegram
```

## Commit Message Format

Atomic commits follow conventional format with task reference:

```
fix(auth): extract token validation into shared utility

Task 1/3 for INT-002
Verify: npx vitest run src/auth/ — PASS
```

## Complexity Examples

### SIMPLE (Fast Track)
```
Error: "'User' is declared but its value is never read"
→ One file, one unused import, remove it, done.
```

### COMPLEX (GSD)
```
Error: "TypeError: Cannot read properties of undefined (reading 'id')"
  at src/services/order.ts:45
  at src/handlers/checkout.ts:22
  3 tests failing in tests/checkout.test.ts

→ Multiple files, unclear which layer has the bug,
  need to trace data flow from handler → service → model,
  may need to fix type definitions + null handling + test expectations.
```

### COMPLEX (SOLID Refactoring)
```
Finding: UserService (450 lines) handles auth + email + persistence + reporting
→ SRP violation, need to:
  1. Research all methods and their callers
  2. Plan extraction into AuthService, EmailService, UserRepository
  3. Execute extraction one service at a time
  4. Verify nothing breaks after each extraction
```

## Directory Structure

Each intervention creates a tracking directory:

```
~/.openclaw/workspace/interventions/
└── INT-{NNN}-{kebab-description}/
    ├── RESEARCH.md    (Complex only — context, hypothesis, scope)
    ├── PLAN.md        (Complex only — XML tasks)
    └── SUMMARY.md     (Always — outcome, files changed, lessons)
```

## Anti-Patterns

**Do NOT:**
- Skip research and jump to planning for complex issues
- Create tasks without verify commands
- Plan more than 5 tasks (split into multiple interventions)
- Continue executing after a task verification fails
- Commit without verification passing
- Re-plan the same task more than twice (escalate instead)
- Mix multiple unrelated fixes in one intervention
