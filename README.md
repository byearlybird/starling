# @byearlybird/starling

**Lightweight local-first reactive data store sync for JavaScript apps.**

Starling is a lightweight data store for building offline-capable tools without dragging in heavy infrastructure. It keeps replicas in sync using field-level Last-Write-Wins powered by a hybrid logical clock, so documents converge automatically.

## Highlights

- Simple Store API with CRUD operations
- Event-based reactivity for building custom solutions
- Framework agnostic -- works with anything that JavaScript runs
- Transactional API with batched notifications and rollback support
- State-based sync with field-level Last-Write-Wins
- ~4KB core build with zero required runtime dependencies

## Installation

```bash
bun add @byearlybird/starling
```

## Quick Start

```typescript
import { createStore } from "@byearlybird/starling";

// Create a store
const todoStore = createStore<{ text: string; completed: boolean }>('todos');

// Simple mutations (single operations)
const id = todoStore.add({ text: "Learn Starling", completed: false });
todoStore.update(id, { completed: true });
todoStore.remove(id);

// Transactions for multiple operations or rollback support
const todo1Id = todoStore.begin((tx) => {
  const generatedId = tx.add({ text: "Learn Starling", completed: false });
  tx.add({ text: "Build an app", completed: false }, { withId: "todo-2" });
  return generatedId; // Return value becomes begin()'s return value
});

// Subscribe to changes
const unsubscribe = todoStore.on('add', (entries) => {
  for (const [id, todo] of entries) {
    console.log(`Added todo ${id}:`, todo);
  }
});

// Clean up
unsubscribe();
todoStore.dispose();
```

## How Sync Works

Starling's sync model is designed to handle the common case: multiple clients editing the same data without manual merge logic.

### Field-Level Last-Write-Wins

Conflict resolution recursively merges each field of a plain JavaScript object, applying Last-Write-Wins at the field level—newer eventstamps win. This means if Client A updates `user.name` and Client B updates `user.email`, both changes are preserved.

### Eventstamps

Eventstamps capture a single operation using a Hybrid Logical Clock. They combine ISO8601 timestamps with a hex counter and random nonce (`YYYY-MM-DDTHH:mm:ss.SSSZ|counter|nonce`). This ensures that even if two clients have identical system clocks—or one clock drifts backward—each write gets a unique, comparable timestamp. The counter increments locally when the timestamp doesn't advance, guaranteeing monotonicity. In the event that a conflict occurs, the nonce acts as a tie-breaker.
To address clock drift, the latest eventstamp is persisted and shared with each data store, so nodes may fast forward clocks to match.

### Data Type Support

Starling works with **Records** (plain JavaScript objects):

```typescript
✅ Good: { name: "Alice", settings: { theme: "dark", notifications: true } }
✅ Good: { count: 42, active: true, tags: ["work", "urgent"] }
```

**Arrays are treated atomically**: If two clients modify the same array field, Last-Write-Wins applies to the entire array—there's no element-level merging. For lists that need concurrent edits (e.g., todo items), use keyed records instead:

```typescript
❌ Avoid: { todos: [{ text: "..." }, { text: "..." }] }
✅ Better: { todos: { "id1": { text: "..." }, "id2": { text: "..." } } }
```

### When to Use Something Else

If you need support for mergeable array operations, semantic operations, or sophisticated string merging, consider using CRDT libraries like [Automerge](https://automerge.org/) or [Yjs](https://docs.yjs.dev/) with, or instead of, Starling.

## Core API

Starling provides a simple API for mutations, queries, and sync. Hover over methods in your IDE to see inline documentation, or check the [Store class source](packages/core/src/store/store.ts) for complete API details.

### Quick Reference

**Mutations**: `add()`, `update()`, `remove()` - CRUD operations
**Transactions**: `begin()` - Batch operations with rollback support
**Sync**: `merge()`, `collection()` - State-based replication
**Events**: `on()` - Subscribe to mutations
**Lifecycle**: `dispose()` - Clean up resources

### Creating a Store

```typescript
import { createStore } from "@byearlybird/starling";

// Create a basic store
const store = createStore<YourType>('your-collection');

// Optionally provide a custom ID generator
const deterministicStore = createStore<YourType>('your-collection', {
  getId: () => crypto.randomUUID(),
});

// To listen to store mutations, use the on() method (see "Event Subscriptions" below)
```

### Common Patterns

**Direct mutations** (single operations):

```typescript
const id = store.add({ name: "Alice", email: "alice@example.com" });
store.update(id, { email: "alice@newdomain.com" });
store.remove(id);
```

**Transactions** (multiple operations or rollback support):

```typescript
// Multiple operations
const userId = store.begin((tx) => {
  const generatedId = tx.add({ name: "Alice", email: "alice@example.com" });
  tx.add({ name: "Bob" }, { withId: "user-1" });
  return generatedId; // This value is returned by begin()
});

// Rollback on validation failure
store.begin((tx) => {
  const id = tx.add({ name: "Dave", email: "invalid" });

  if (!validateEmail(tx.get(id)?.email)) {
    tx.rollback(); // Abort all changes in this transaction
    return;
  }

  tx.update(id, { verified: true });
});

// Rollback on API error
try {
  store.begin((tx) => {
    const id = tx.add({ name: "Eve" });

    // If validation fails, we can rollback
    if (!isValidTodo(tx.get(id))) {
      tx.rollback();
      return;
    }
  });
} catch (error) {
  console.error("Transaction failed:", error);
}
```

### Event Subscriptions

Subscribe to store events to build reactive features:

```typescript
import { createStore } from "@byearlybird/starling";

const store = createStore<{ name: string }>('users');

// Subscribe to add events
const unsubscribeAdd = store.on('add', (entries) => {
  for (const [id, user] of entries) {
    console.log(`Added user ${id}:`, user);
  }
});

// Subscribe to update events
const unsubscribeUpdate = store.on('update', (entries) => {
  for (const [id, user] of entries) {
    console.log(`Updated user ${id}:`, user);
  }
});

// Subscribe to delete events
const unsubscribeDelete = store.on('delete', (ids) => {
  for (const id of ids) {
    console.log(`Deleted user ${id}`);
  }
});

// Mutations trigger the appropriate events
store.add({ name: "Alice" }, { withId: "user-1" });
store.update("user-1", { name: "Alice Smith" });
store.remove("user-1");

// Clean up
unsubscribeAdd();
unsubscribeUpdate();
unsubscribeDelete();
store.dispose();
```

## Building on Top

The core store is intentionally minimal. For additional functionality like queries and persistence, see:

- **[@byearlybird/starling-db](packages/db)** - Database utilities including plugins, queries, and persistence (in development)

Build your own features using the event system:

```typescript
// Example: Simple in-memory query
function createQuery<T>(
  store: Store<T>,
  predicate: (value: T) => boolean
) {
  const results = new Map<string, T>();

  // Initial population
  for (const [id, value] of store.entries()) {
    if (predicate(value)) {
      results.set(id, value);
    }
  }

  // Subscribe to updates
  const unsubAdd = store.on('add', (entries) => {
    for (const [id, value] of entries) {
      if (predicate(value)) results.set(id, value);
    }
  });

  const unsubUpdate = store.on('update', (entries) => {
    for (const [id, value] of entries) {
      if (predicate(value)) {
        results.set(id, value);
      } else {
        results.delete(id);
      }
    }
  });

  const unsubDelete = store.on('delete', (ids) => {
    for (const id of ids) {
      results.delete(id);
    }
  });

  return {
    results: () => Array.from(results.entries()),
    dispose: () => {
      unsubAdd();
      unsubUpdate();
      unsubDelete();
      results.clear();
    }
  };
}
```

## Examples

![Demo GIF](demo.GIF)

Three demo apps show Starling in action:

- **[React Todo App](apps/demo-starling-react)** - Cross-device sync with localStorage + HTTP
- **[SolidJS Todo App](apps/demo-starling-solid)** - Same sync setup, different framework
- **[Server](apps/demo-starling-server)** - Simple Bun server that merges and persists updates

Run them locally:

```bash
# Start React demo
bun run demo:react

# Or start SolidJS demo
bun run demo:solid
```

## Project Status

- Starling core is in **alpha**. The core API is stable but may have minor changes as additional testing occurs.
- The scope and guiding philosophy are firm: provide a lightweight, minimal core for sync with field-level Last-Write-Wins, letting higher-level packages handle queries, persistence, and framework integrations.
- The core package focuses on CRUD operations, transactions, and state-based sync. Higher-level features like queries and persistence have been moved to separate packages.
- Near-term work focuses on the `@byearlybird/starling-db` package for queries and persistence, framework integrations, and smarter change detection for sync.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT (see [`LICENSE`](LICENSE))

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by [Tinybase](https://tinybase.org/) and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in [James Long's CRDTs for Mortals talk](https://www.dotconferences.com/2019/12/james-long-crdts-for-mortals).

Thanks for checking out Starling!
