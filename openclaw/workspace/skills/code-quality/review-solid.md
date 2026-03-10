# SOLID Principles Review

## Scan Workflow

1. **Fetch recent commits** from enrolled repos (last N hours)
2. **Get changed files** for each commit
3. **Read changed files** and analyze for SOLID violations
4. **Report findings** as review comments or improvement PRs
5. **Notify** via Telegram

## The Five Principles

### S — Single Responsibility Principle
> A class/module should have one, and only one, reason to change.

**What to detect:**
- Classes with more than ~200 lines (warning) or ~400 lines (violation)
- Functions with more than ~50 lines
- Classes that mix concerns: data access + business logic + presentation
- Files importing from 3+ unrelated domains
- God objects that handle multiple unrelated responsibilities

**Examples:**
```typescript
// VIOLATION: UserService handles auth, email, AND data persistence
class UserService {
  async login(email: string, password: string) { /* auth logic */ }
  async sendWelcomeEmail(user: User) { /* email logic */ }
  async saveUser(user: User) { /* database logic */ }
  async generateReport(userId: string) { /* reporting logic */ }
}

// FIX: Split into focused services
class AuthService { async login(email, password) { } }
class EmailService { async sendWelcome(user) { } }
class UserRepository { async save(user) { } }
```

### O — Open/Closed Principle
> Software entities should be open for extension, closed for modification.

**What to detect:**
- Switch statements or if/else chains on type discriminators
- Functions that require modification every time a new variant is added
- Hardcoded behavior that should be configurable or pluggable

**Examples:**
```typescript
// VIOLATION: Must modify this function for every new payment type
function processPayment(type: string, amount: number) {
  if (type === 'credit') { /* ... */ }
  else if (type === 'debit') { /* ... */ }
  else if (type === 'crypto') { /* ... */ }  // added later
}

// FIX: Strategy pattern — extend by adding new implementations
interface PaymentProcessor { process(amount: number): Promise<Result> }
class CreditProcessor implements PaymentProcessor { /* ... */ }
class DebitProcessor implements PaymentProcessor { /* ... */ }
```

### L — Liskov Substitution Principle
> Derived classes must be substitutable for their base classes.

**What to detect:**
- Subclasses that throw `NotImplementedError` for inherited methods
- Overridden methods that change the contract (different return type, stricter preconditions)
- Empty method overrides that silently do nothing
- Subclasses that ignore or contradict parent behavior

**Examples:**
```typescript
// VIOLATION: Square breaks Rectangle's contract
class Rectangle {
  setWidth(w: number) { this.width = w }
  setHeight(h: number) { this.height = h }
}
class Square extends Rectangle {
  setWidth(w: number) { this.width = w; this.height = w }  // breaks contract
}
```

### I — Interface Segregation Principle
> No client should be forced to depend on methods it does not use.

**What to detect:**
- Interfaces with more than 7-10 methods
- Classes implementing interfaces with many `throw new Error('Not implemented')`
- Parameters accepting large objects when only 1-2 fields are needed
- God interfaces that combine unrelated capabilities

**Examples:**
```typescript
// VIOLATION: ReadOnlyRepo forced to implement write methods
interface Repository<T> {
  find(id: string): T
  findAll(): T[]
  save(entity: T): void
  delete(id: string): void
  bulkInsert(entities: T[]): void
}

// FIX: Split into focused interfaces
interface Readable<T> { find(id: string): T; findAll(): T[] }
interface Writable<T> { save(entity: T): void; delete(id: string): void }
```

### D — Dependency Inversion Principle
> High-level modules should not depend on low-level modules. Both should depend on abstractions.

**What to detect:**
- Direct instantiation of dependencies inside classes (`new DatabaseClient()`)
- Importing concrete implementations in business logic (e.g., importing a specific ORM directly)
- No dependency injection — services creating their own dependencies
- Business logic coupled to specific frameworks or infrastructure

**Examples:**
```typescript
// VIOLATION: Business logic depends directly on concrete database
class OrderService {
  private db = new PostgresClient()  // tight coupling
  async createOrder(data: OrderData) {
    await this.db.query('INSERT INTO orders ...')
  }
}

// FIX: Depend on abstraction, inject implementation
class OrderService {
  constructor(private readonly repo: OrderRepository) {}
  async createOrder(data: OrderData) {
    await this.repo.save(new Order(data))
  }
}
```

## Severity Levels

- **High**: Clear violation impacting maintainability (god class, LSP break, tight coupling)
- **Medium**: Emerging violation that will worsen (growing switch statement, fat interface)
- **Low**: Minor concern or style preference (slightly long function, could use injection)

## Output Format

```
**SOLID Violation: [S|O|L|I|D] — [Principle Name]**
Severity: high | medium | low
File: path/to/file.ts:LINE
Issue: [what the violation is]
Impact: [why it matters]
Suggestion: [how to fix it]
```

## Action Rules

- **High severity**: Create improvement PR if change is straightforward
- **Medium severity**: Add review comment on latest PR
- **Low severity**: Log in daily summary, no PR or comment
