# @byearlybird/starling

**Lightweight Local-first reactive data store sync for JavaScript apps.**

Starling is a lightweight data store for building offline-capable tools without dragging in heavy infrastructure. It keeps replicas in sync using field-level Last-Write-Wins powered by a hybrid logical clock, so documents converge automatically.

## Highlights

- Simple Store API
- Plain JavaScript predicates instead of a custom query language
- Chainable plugins for persistence, querying, and custom hooks
- Framework agnostic -- works anything that JavaScript runs
- Transactional API with batched notifications
- ~4KB core build with zero required runtime dependencies

## Project Status

- Starling is in its earliest phase; expect the API and internal implementations to shift quickly.
- The scope and guiding philosophy are firm: cover the 80/20 of sync, avoid manual merge logic, skip Domain-Specific-Languages, and keep the mental model simple, handing complex cases and real-time collaboration to specialized systems.
- The current sync layer is intentionally minimal, shipping entire store snapshots over HTTP, leaving plenty of room to optimize cadence, transport, and diffing.
- Near-term work focuses on richer sync plugins (e.g. WebSocket transports), smarter change detection so only incremental updates travel over the wire, and beginning framework integrations.

## Sync model overview

- Conflict resolution recursively merges each field of a plain JavaScript object, applying Last-Write-Wins at the field level — newer eventstamps win.
- Eventstamps combine ISO8601 timestamps with a hex counter (`YYYY-MM-DDTHH:mm:ss.SSSZ|counter`), ensuring monotonicity even when wall clocks stall or skew across clients.
- The `unstorage` plugin persists both documents and the latest eventstamp so fresh instances resume from the newest clock value.
- Starling works best with Records and Primitives, with Arrays preserved as one unit for safety -- consider using keyed records instead.
- If you need *strict* causal guarantees or support for mergable Array operations, consider using one of several the great CRDT libraries with, or instead of, Starling.

## Installation

```bash
# Core package
bun add @byearlybird/starling

# Optional peer dependency for persistence plugin
bun add unstorage
```

## Quick Start

```typescript
import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";

// Create a store with reactive queries
const todoStore = await createStore<{ text: string; completed: boolean }>()
  .use(queryPlugin())
  .init();

// Mutate data using store operations
const id = todoStore.add({ text: "Learn Starling", completed: false });
todoStore.update(id, { completed: true });
todoStore.del(id);

// Start a transaction using begin()
const todo1Id = todoStore.begin((tx) => {
  const generatedId = tx.add({ text: "Learn Starling", completed: false });
  tx.add({ text: "Build an app", completed: false }, { withId: "todo-2" });
  return generatedId; // capture generated ID
});

// Query with plain JavaScript predicates
const activeTodos = todoStore.query({ where: (todo) => !todo.completed });
console.log(activeTodos.results()); // Map of incomplete todos

// Updates automatically trigger query re-evaluation for impacted records
todoStore.update(todo1Id, { completed: true });

console.log(activeTodos.results()); // Now only contains todo-2
```

**Want to see more?** Check out the [full examples](#examples) below for cross-device sync with storage multiplexing.

## Examples

- **[React Todo App](apps/demo-starling-react)** - Todo app that syncs across devices using localStorage + HTTP
- **[SolidJS Todo App](apps/demo-starling-solid)** - Todo app that syncs across devices using localStorage + HTTP
- **[Server](apps/demo-starling-server)** - Simple Bun server that merges updates and persists to disk

Each example demonstrate simple sync:
- **Storage multiplexing** - Register localStorage + HTTP plugins, conflicts auto-resolve
- **Works offline** - Local changes persist immediately, sync when connection returns
- **Reactive queries** - Filter data with plain JavaScript predicates
- **Minimal config** - No schema definitions, no event declarations, etc

What to expect:
- Storage multiplexing is just multiple plugins; the newest eventstamp wins the merge.
- Offline edits stay local until the HTTP driver syncs.
- Queries are plain predicates, so no extra schema or migration layer shows up here.

Run them locally:
```bash
# Start React demo
bun run demo:react

# Or start SolidJS demo
bun run demo:solid
```

## Core API

### Creating a Store

```typescript
import { createStore } from "@byearlybird/starling";

// Create a basic store
const store = createStore<YourType>();

// Optionally provide a custom ID generator
const deterministicStore = createStore<YourType>({
  getId: () => crypto.randomUUID(),
});

// To listen to store mutations, use plugins (see "Custom Plugin with Hooks" below)
```

### Store Lifecycle

- `store.use(plugin)` chains plugins and returns the same store so calls can be composed.
- `await store.init()` runs the store once and awaits each plugin's `init` hook (start pollers, hydrate snapshots, warm caches, etc).
- `await store.dispose()` tears down plugins (each `dispose` hook runs) and lets plugins flush pending work before you drop the store.

### Store Methods

#### `begin(callback: (tx) => void, options?: { silent?: boolean }): void`
Execute mutations on the store. All mutations must be performed inside the callback. The transaction auto-commits when the callback completes, unless `tx.rollback()` is called.

```typescript
// Insert items
store.begin((tx) => {
  const generatedId = tx.add({ name: "Alice", email: "alice@example.com" });
  tx.add({ name: "Bob" }, { withId: "user-1" });
});

// Update items
store.begin((tx) => {
  tx.update("user-1", { email: "alice@newdomain.com" });
});

// Delete items
store.begin((tx) => {
  tx.del("user-1");
});

// Silent mutations (don't trigger hooks - useful for sync)
store.begin((tx) => {
  tx.add({ name: "Charlie" });
}, { silent: true });

// Rollback on error
store.begin((tx) => {
  tx.add({ name: "Dave" });
  if (someCondition) {
    tx.rollback(); // Abort all changes
    return;
  }
  tx.update("user-1", { name: "Updated" });
});
```

#### `get(key: string): T | null`
Get a single item by key if it is not deleted.

```typescript
const user = store.get("user-1");
```

#### `entries(): IterableIterator<[string, T]>`
Get all key-value pairs (excluding deleted items).

```typescript
for (const [key, value] of store.entries()) {
  console.log(key, value);
}
```

#### `snapshot(): EncodedDocument[]`
Get the raw encoded state with eventstamps (includes deleted items with `~deletedAt`).

```typescript
const encodedState = store.snapshot();
```

### Transaction API

The `begin()` callback receives a transaction object with these methods:

- `tx.add(value, options?)` – Insert a new document. Returns the generated or provided ID.
- `tx.update(key, partial)` – Merge a partial update into an existing document.
- `tx.merge(document)` – Apply a previously encoded `EncodedDocument` (used by sync and persistence plugins).
- `tx.del(key)` – Soft-delete a document by stamping `~deletedAt`.
- `tx.get(key)` – Get a document by key if it exists (ignores soft-deleted docs).
- `tx.rollback()` – Abort the transaction and discard all changes.

### Custom Plugin with Hooks

Hooks are provided via plugins. Create a custom plugin to listen to store mutations:

```typescript
import { createStore, type Plugin } from "@byearlybird/starling";

// Create a custom plugin with hooks
const loggingPlugin = <T extends Record<string, unknown>>(): Plugin<T> => ({
  hooks: {
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
  },
});

// Use the plugin
const store = await createStore<{ name: string }>()
  .use(loggingPlugin())
  .init();
```

## Official Plugins

Starling comes with a couple of plugins that live beside the core store. They ship as subpath exports so you can pull in only what you need.

### Registering multiple plugins

You can stack plugins as long as each one understands the store hooks. In practice that means you can wire multiple persistence layers without extra glue:

```typescript
import { createStore } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import httpDriver from "unstorage/drivers/http";

// Register multiple storage backends - they work together automatically
const store = await createStore<Todo>()
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

### Query (`@byearlybird/starling/plugin-query`)

Attach predicate-based, reactive views that stay synchronized with store mutations. The plugin exposes a `query()` helper and a store method. See [`docs/plugins/query.md`](docs/plugins/query.md) for usage patterns and API notes.

### Unstorage (`@byearlybird/starling/plugin-unstorage`)

Persists snapshots to any `unstorage` backend, replays them during boot, and optionally debounces writes. Supports multiple instances for hybrid sync strategies (local + remote, multi-region, etc.). Option descriptions live in [`docs/plugins/unstorage.md`](docs/plugins/unstorage.md).

For details about the repository structure, architecture, and package exports, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT (see [`LICENSE`](LICENSE))

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Very much inspired by Tinybase and so many other excellent libraries in the local-first community, Starling aims to implement a simple sync solution for personal apps, inspired by the method described in James Longs' CRDTs for Mortals talk.

Thanks for checking out Starling!
