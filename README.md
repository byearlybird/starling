# @byearlybird/starling

**Lightweight local-first reactive data store sync for JavaScript apps.**

Starling is a lightweight data store for building offline-capable tools without dragging in heavy infrastructure. It keeps replicas in sync using field-level Last-Write-Wins powered by a hybrid logical clock, so documents converge automatically.

## Highlights

- Simple Store API
- Plain JavaScript predicates instead of a custom query language
- Built-in reactive queries with plain JavaScript predicates
- Chainable plugins for persistence and custom hooks
- Framework agnostic -- works with anything that JavaScript runs
- Transactional API with batched notifications
- ~4KB core build with zero required runtime dependencies

## Installation

```bash
# Core package
bun add @byearlybird/starling

# Optional peer dependency for persistence plugin
bun add unstorage
```

## Quick Start

```typescript
import { Store } from "@byearlybird/starling";

// Create a store with built-in reactive queries
const todoStore = await new Store<{ text: string; completed: boolean }>().init();

// Simple mutations (single operations)
const id = todoStore.add({ text: "Learn Starling", completed: false });
todoStore.update(id, { completed: true });
todoStore.del(id);

// Transactions for multiple operations or rollback support
const todo1Id = todoStore.begin((tx) => {
  const generatedId = tx.add({ text: "Learn Starling", completed: false });
  tx.add({ text: "Build an app", completed: false }, { withId: "todo-2" });
  return generatedId; // Return value becomes begin()'s return value
});

// Query with plain JavaScript predicates
const activeTodos = todoStore.query({ where: (todo) => !todo.completed });
console.log(activeTodos.results()); // Array of [id, todo] tuples for incomplete todos

// Updates automatically trigger query re-evaluation for impacted records
todoStore.update(todo1Id, { completed: true });

console.log(activeTodos.results()); // Now only contains todo-2
```

**Want to see more?** Check out the [examples](#examples) below for cross-device sync with storage multiplexing.

## How Sync Works

Starling's sync model is designed to handle the common case: multiple clients editing the same data without manual merge logic.

### Field-Level Last-Write-Wins

Conflict resolution recursively merges each field of a plain JavaScript object, applying Last-Write-Wins at the field level—newer eventstamps win. This means if Client A updates `user.name` and Client B updates `user.email`, both changes are preserved.

### Eventstamps

Eventstamps capture a single operation using a Hybrid Logical Clock. They combine ISO8601 timestamps with a hex counter and random nonce (`YYYY-MM-DDTHH:mm:ss.SSSZ|counter|nonce`). This ensures that even if two clients have identical system clocks—or one clock drifts backward—each write gets a unique, comparable timestamp. The counter increments locally when the timestamp doesn't advance, guaranteeing monotonicity. In the event that a conflict occurs, the nonce acts as a tie-breaker.
To address clock drift, the latest eventstamp is persisted and shared with each data store, so nodes may fast forward clocks to match.

The `unstorage` plugin persists both documents and the latest eventstamp so fresh instances resume from the newest clock value.

### Data Type Support

Starling works best with **Records** and **Primitives**:

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

Starling provides a simple API for mutations, queries, and sync. Hover over methods in your IDE to see inline documentation, or check the [Store class source](packages/core/src/store.ts) for complete API details.

### Quick Reference

**Mutations**: `add()`, `update()`, `del()` - CRUD operations
**Transactions**: `begin()` - Batch operations with rollback support
**Queries**: `query()` - Reactive filtered views (see [Queries Guide](docs/queries.md))
**Sync**: `merge()`, `collection()` - State-based replication
**Lifecycle**: `use()`, `init()`, `dispose()` - Plugin management

### Creating a Store

```typescript
import { Store } from "@byearlybird/starling";

// Create a basic store
const store = new Store<YourType>();

// Optionally provide a custom ID generator
const deterministicStore = new Store<YourType>({
  getId: () => crypto.randomUUID(),
});

// To listen to store mutations, use plugins (see "Custom Plugin with Hooks" below)
```

### Common Patterns

**Direct mutations** (single operations):

```typescript
const id = store.add({ name: "Alice", email: "alice@example.com" });
store.update(id, { email: "alice@newdomain.com" });
store.del(id);
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

### Custom Plugin with Hooks

Hooks are provided via plugins. Create a custom plugin to listen to store mutations:

```typescript
import { Store, type Plugin } from "@byearlybird/starling";

// Create a custom plugin with hooks
const loggingPlugin = <T extends Record<string, unknown>>(): Plugin<T> => ({
  onInit: () => {
    console.log("Logging plugin initialized");
  },
  onDispose: () => {
    console.log("Logging plugin disposed");
  },
  // Hooks receive batched entries after mutations commit
  onAdd: (entries) => {
    for (const [key, value] of entries) {
      console.log(`Put ${key}:`, value);
    }
  },
  onUpdate: (entries) => {
    for (const [key, value] of entries) {
      console.log(`Patched ${key}:`, value);
    }
  },
  onDelete: (keys) => {
    for (const key of keys) {
      console.log(`Deleted ${key}`);
    }
  },
});

// Use the plugin
const store = await new Store<{ name: string }>()
  .use(loggingPlugin())
  .init();
```

## Official Plugins

Starling comes with plugins that live beside the core store. They ship as subpath exports so you can pull in only what you need.

### Queries

Predicate-based, reactive views ship with the store itself. Call `store.query({ where, select, order })` to derive filtered maps that automatically stay in sync. See [`docs/queries.md`](docs/queries.md) for usage patterns and API notes.

### Unstorage (`@byearlybird/starling/plugin-unstorage`)

Persists snapshots to any `unstorage` backend, replays them during boot, and optionally debounces writes. Supports multiple instances for hybrid sync strategies. Option descriptions live in [`docs/plugins/unstorage.md`](docs/plugins/unstorage.md).

### Storage Multiplexing

You can stack multiple storage plugins—each one operates independently, and Starling's field-level LWW automatically resolves conflicts:

```typescript
import { Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import httpDriver from "unstorage/drivers/http";

// Register multiple storage backends - they work together automatically
const store = await new Store<Todo>()
  .use(
    unstoragePlugin(
      "todos",
      createStorage({
        driver: localStorageDriver({ base: "app:" }),
      }),
    ),
  )
  .use(
    unstoragePlugin(
      "todos",
      createStorage({
        driver: httpDriver({ base: "https://api.example.com" }),
      }),
      { pollIntervalMs: 5000 }, // Sync with server every 5 seconds
    ),
  )
  .init();
```

What happens here:
- Local writes land in localStorage immediately.
- The HTTP driver polls every 5 seconds and merges whatever the server returns.
- If two sides disagree, the field with the newest eventstamp wins.

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

- Starling is in **alpha**. No major architectural or API changes are expected, though APIs may change slightly as additional testing and usage takes place.
- The scope and guiding philosophy are firm: cover the 80/20 of sync, avoid manual merge logic, skip Domain-Specific-Languages, and keep the mental model simple, handing complex cases and real-time collaboration to specialized systems.
- The current sync layer is intentionally minimal, shipping entire store snapshots over HTTP, leaving plenty of room to optimize cadence, transport, and diffing.
- Near-term work focuses on richer sync plugins (e.g. WebSocket transports), smarter change detection so only incremental updates travel over the wire, and beginning framework integrations.

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT (see [`LICENSE`](LICENSE))

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by [Tinybase](https://tinybase.org/) and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in [James Long's CRDTs for Mortals talk](https://www.dotconferences.com/2019/12/james-long-crdts-for-mortals).

Thanks for checking out Starling!
