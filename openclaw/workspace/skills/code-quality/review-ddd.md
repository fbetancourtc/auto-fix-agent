# DDD Principles Review

## Scan Workflow

1. **Fetch recent commits** from enrolled repos (last N hours)
2. **Get changed files** for each commit
3. **Read changed files** and analyze for DDD pattern violations
4. **Report findings** as review comments or improvement PRs
5. **Notify** via Telegram

## Core DDD Patterns to Enforce

### Bounded Contexts
> Each domain area should have clear boundaries with explicit interfaces between them.

**What to detect:**
- Direct imports between unrelated domain modules (e.g., `orders/` importing from `inventory/` internals)
- Shared mutable state between domain areas
- Database tables/models shared across contexts without an anti-corruption layer
- Missing translation at context boundaries

**Examples:**
```typescript
// VIOLATION: Order module directly uses Inventory internals
import { WarehouseSlot } from '../inventory/models/warehouse-slot'

class OrderService {
  async placeOrder(items: WarehouseSlot[]) { /* cross-context coupling */ }
}

// FIX: Define a boundary interface
// orders/ports/inventory-port.ts
interface InventoryPort {
  checkAvailability(sku: string, qty: number): Promise<boolean>
}
```

### Aggregates & Aggregate Roots
> Cluster related entities/value objects with a single root entity controlling access and invariants.

**What to detect:**
- External code directly modifying entities inside an aggregate (bypassing the root)
- Aggregates that are too large (loading too many related entities)
- Missing invariant enforcement (business rules that should be checked on mutation)
- References between aggregates by object instead of by ID

**Examples:**
```typescript
// VIOLATION: External code modifies order line items directly
order.lineItems[0].quantity = 5  // bypasses aggregate root

// FIX: All mutations through the aggregate root
order.updateLineItemQuantity(lineItemId, 5)  // root enforces invariants
```

### Value Objects
> Immutable objects defined by their attributes, not by identity.

**What to detect:**
- Primitive obsession: Using `string` for email, `number` for money, `string` for currency
- Mutable objects that should be value objects (e.g., `Address` with setters)
- Missing equality by value (comparing by reference instead of attributes)
- Validation logic scattered instead of encapsulated in the value object

**Examples:**
```typescript
// VIOLATION: Primitive obsession — money as raw number
function applyDiscount(price: number, currency: string, discount: number) {
  return price * (1 - discount)  // no currency safety
}

// FIX: Money value object
class Money {
  constructor(
    readonly amount: number,
    readonly currency: Currency
  ) {}

  applyDiscount(rate: number): Money {
    return new Money(this.amount * (1 - rate), this.currency)
  }
}
```

### Domain Events
> Significant domain occurrences should be modeled as events, not as direct side-effect chains.

**What to detect:**
- Service methods that trigger 3+ side effects directly (send email, update cache, log audit)
- Tight coupling between domain actions and their consequences
- Missing event publish/subscribe for cross-aggregate communication
- Synchronous chains that should be async event-driven

**Examples:**
```typescript
// VIOLATION: Direct coupling of all side effects
class OrderService {
  async placeOrder(data: OrderData) {
    const order = await this.repo.save(new Order(data))
    await this.emailService.sendConfirmation(order)     // side effect 1
    await this.inventoryService.reserve(order.items)     // side effect 2
    await this.analyticsService.trackOrder(order)        // side effect 3
    await this.auditService.log('order_placed', order)   // side effect 4
  }
}

// FIX: Publish domain event, let handlers react
class OrderService {
  async placeOrder(data: OrderData) {
    const order = await this.repo.save(new Order(data))
    await this.eventBus.publish(new OrderPlaced(order))
  }
}
```

### Repository Pattern
> Abstract data access behind a domain-oriented interface.

**What to detect:**
- SQL/ORM queries scattered in service or controller code
- Domain logic mixed with data access logic
- Missing repository abstraction (services directly using database clients)
- Repository methods that return ORM entities instead of domain objects

**Examples:**
```typescript
// VIOLATION: SQL in service layer
class UserService {
  async getActiveUsers() {
    return await db.query('SELECT * FROM users WHERE active = true')
  }
}

// FIX: Repository abstraction
interface UserRepository {
  findActive(): Promise<User[]>
}

class UserService {
  constructor(private readonly users: UserRepository) {}
  async getActiveUsers(): Promise<User[]> {
    return this.users.findActive()
  }
}
```

### Ubiquitous Language
> Code names should match domain terminology used by the business.

**What to detect:**
- Technical names that don't match business concepts (e.g., `DataProcessor` vs `InvoiceReconciler`)
- Inconsistent naming for the same concept across modules
- Generic names that hide domain meaning (`Manager`, `Handler`, `Processor`, `Helper`, `Utils`)
- Abbreviated names that obscure intent

## Severity Levels

- **High**: Architectural boundary violation, aggregate bypass, missing domain model
- **Medium**: Primitive obsession, missing value objects, direct side-effect chains
- **Low**: Naming inconsistencies, minor repository pattern gaps

## Output Format

```
**DDD Finding: [Pattern Name]**
Severity: high | medium | low
File: path/to/file.ts:LINE
Issue: [what the violation is]
Impact: [why it matters for domain integrity]
Suggestion: [how to refactor toward proper DDD]
```

## Action Rules

- **High severity**: Create improvement PR with clear refactoring steps
- **Medium severity**: Add review comment on latest PR with suggestion
- **Low severity**: Log in daily summary, no PR or comment

## Context Awareness

Before flagging DDD violations, consider:
- **Project size**: Small projects may not need full DDD. Don't over-engineer.
- **Existing patterns**: If the project doesn't use DDD, suggest patterns gradually, don't demand wholesale rewrite.
- **Pragmatism**: DDD is a tool, not a religion. Flag clear architectural issues, not style preferences.
