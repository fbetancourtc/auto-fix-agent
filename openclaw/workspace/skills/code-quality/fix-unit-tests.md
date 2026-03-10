# Fix Unit Test Failures

## Core Principle

**Fix the source code to make tests pass — never fix the test to match broken code.**

The only exception: if a test assertion is provably incorrect (testing wrong behavior), explain clearly in the PR why the test was wrong.

## Workflow

1. **Run tests** to reproduce the failure and capture output
2. **Read failing test** to understand what it expects
3. **Read source code** being tested to understand current behavior
4. **Identify the gap**: Is the source wrong, or is the test wrong?
5. **Fix the source** (preferred) or fix the test (with justification)
6. **Run tests again** to verify the fix
7. **Create PR** with root cause explanation

## TypeScript (Vitest)

### Diagnosis
```bash
npx vitest run --reporter=verbose 2>&1 | head -100
# For a specific test:
npx vitest run path/to/test.test.ts --reporter=verbose
```

### Common Failure Patterns

**Mock not working:**
```typescript
// Problem: vi.mock() must be hoisted above imports
// Fix: Ensure vi.mock() is at the top of the file, before any imports of the mocked module

vi.mock('./myModule', () => ({
  myFunction: vi.fn().mockReturnValue('mocked')
}))

import { myFunction } from './myModule'
```

**Async test not awaiting:**
```typescript
// Problem: Missing await causes test to pass before assertion runs
// Fix: Always await async operations

it('should fetch data', async () => {
  const result = await fetchData()  // NOT: const result = fetchData()
  expect(result).toBeDefined()
})
```

**React component test missing act():**
```typescript
// Problem: State updates outside act() warning
// Fix: Wrap state-triggering actions

await act(async () => {
  fireEvent.click(button)
})
```

**Snapshot mismatch:**
- If component changed intentionally: `npx vitest run --update` for that specific test
- If component change was unintentional: revert the component change, not the snapshot

### Verification
```bash
npx vitest run --reporter=verbose
```

## Python (pytest)

### Diagnosis
```bash
pytest -x -v --tb=long 2>&1 | head -100
# For a specific test:
pytest path/to/test_file.py::test_function -v --tb=long
```

### Common Failure Patterns

**Fixture not found:**
```python
# Problem: conftest.py in wrong directory or missing fixture
# Fix: Move fixture to conftest.py in test root or parent directory

# conftest.py
@pytest.fixture
def db_session():
    session = create_session()
    yield session
    session.close()
```

**Assert on floating point:**
```python
# Problem: Float comparison fails due to precision
# Fix: Use pytest.approx

assert result == pytest.approx(3.14, rel=1e-2)
```

**Patching wrong target:**
```python
# Problem: mock.patch targets the wrong import path
# Fix: Patch where the function is USED, not where it's DEFINED

# If module_a.py does: from utils import helper
# Patch: @mock.patch('module_a.helper')  NOT: @mock.patch('utils.helper')
```

**Missing async marker:**
```python
# Problem: async test runs as sync, returns coroutine
# Fix: Add pytest.mark.asyncio (or use asyncio_mode = "auto")

@pytest.mark.asyncio
async def test_async_function():
    result = await my_async_function()
    assert result == expected
```

### Verification
```bash
pytest -x -v
```

## Never Do

- Delete or skip failing tests
- Add `@pytest.mark.skip` or `it.skip()` to make the suite pass
- Weaken assertions (e.g., changing `toBe` to `toBeTruthy`)
- Add `@ts-ignore` or `type: ignore` to suppress type errors in tests
- Mock away the actual behavior being tested
