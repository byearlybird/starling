# @byearlybird/starling

**Local-first reactive sync. Zero dependencies, no ceremony.**

A reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. Starling provides a simple yet powerful way to manage, query, and synchronize application state across clients and servers with automatic conflict resolution.

## Why Starling?

Cross-device sync shouldn't require heavyweight infrastructure or learning new query languages. Starling gives you:

- **Tiny footprint** - Core library is ~5KB with zero runtime dependencies
- **Just JavaScript** - Query with plain predicates, no complex query languages or custom DSLs
- **Simple sync** - Multiplex storage backends (localStorage + HTTP) and conflicts auto-resolve
- **Extensible hooks** - Add encryption, validation, or custom logic in ~10 lines
- **Works everywhere** - React, Vue, Solid, Node, Deno, Bun - if it runs JS, it works

Perfect for apps that sync across devices, offline-first apps, or any tool that benefits from eventual consistency.

## Features

- **Zero Dependencies** - Core package has no external dependencies (~5KB)
- **Plain JavaScript Queries** - Filter with predicates, not DSLs: `query(todo => !todo.completed)`
- **Automatic Conflict Resolution** - CRDT-like merging using eventstamps (ISO8601 + hex counter), no manual merge code
- **Extensible Plugin Hooks** - Add encryption, validation, or custom sync in ~10 lines
- **Reactive Stores** - Event-driven data stores with hook-based notifications
- **Flexible Sync** - Use `unstorage` drivers for localStorage, HTTP, S3, Redis, or custom backends
- **Transaction Support** - Stage operations and commit/rollback atomically
- **TypeScript First** - Full type safety with strict TypeScript support
- **Framework Agnostic** - Works with React, Vue, Solid, or any JavaScript runtime

## Installation

```bash
# Core package
bun add @byearlybird/starling

# Optional plugins
bun add @byearlybird/starling-plugin-query
bun add @byearlybird/starling-plugin-unstorage unstorage
```

## Quick Start

```typescript
import { Store } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling-plugin-query";

// Create a store with reactive queries
const todoStore = await Store.create<{ text: string; completed: boolean }>()
  .use(queryPlugin())
  .init();

// Insert items
todoStore.put("todo-1", { text: "Learn Starling", completed: false });
todoStore.put("todo-2", { text: "Build an app", completed: false });

// Query with plain JavaScript predicates - direct method access!
const activeTodos = todoStore.query(todo => !todo.completed);
console.log(activeTodos.results()); // Map of incomplete todos

// Updates automatically trigger query re-evaluation
todoStore.patch("todo-1", { completed: true });
console.log(activeTodos.results()); // Now only contains todo-2
```

**Want to see more?** Check out the [full examples](#examples) below for cross-device sync with storage multiplexing.

## Examples

Explore working demos that showcase cross-device sync with storage multiplexing:

- **[React Todo App](apps/demo-starling-react)** - Todo app that syncs across devices using localStorage + HTTP
- **[SolidJS Todo App](apps/demo-starling-solid)** - Same app built with SolidJS, showing framework flexibility
- **[Server](apps/demo-starling-server)** - Simple Bun server that merges updates and persists to disk

Each example shows how simple sync can be:
- **Storage multiplexing** - Register localStorage + HTTP plugins, conflicts auto-resolve
- **Works offline** - Local changes persist immediately, sync when connection returns
- **Reactive queries** - Filter data with plain JavaScript predicates
- **Zero config** - No schema definitions, no migration scripts, just works

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
import { Store } from "@byearlybird/starling";

// Create a basic store
const store = Store.create<YourType>();

// To listen to store mutations, use plugins (see "Custom Plugin with Hooks" below)
```

### Store Lifecycle

- `store.use(plugin)` chains plugins and returns the same store so calls can be composed.
- `await store.init()` runs the store once and awaits each plugin's `init` hook (start pollers, hydrate snapshots, warm caches, etc).
- `await store.dispose()` tears down plugins (each `dispose` hook runs) and lets plugins flush pending work before you drop the store.

### Store Methods

#### `put(key: string, value: T): void`
Insert a new item into the store. Each value is automatically encoded with eventstamps for conflict resolution.

```typescript
store.put("user-1", { name: "Alice", email: "alice@example.com" });
```

#### `patch(key: string, value: DeepPartial<T>): void`
Update an existing item with partial data.

```typescript
store.patch("user-1", { email: "alice@newdomain.com" });
```

#### `del(key: string): void`
Delete an item (adds `~deletedAt` timestamp).

```typescript
store.del("user-1");
```

#### `get(key: string): T | null`
Get a single item by key.

```typescript
const user = store.get("user-1");
```

#### `has(key: string): boolean`
Check if an item exists (and is not deleted).

```typescript
if (store.has("user-1")) {
  // user exists
}
```

#### `values(): IterableIterator<T>`
Get all decoded values from the store (excluding deleted items).

```typescript
for (const user of store.values()) {
  console.log(user);
}
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

#### `begin(): Transaction`
Start a transaction to batch operations.

```typescript
const tx = store.begin();
tx.put("user-1", { name: "Alice" });
tx.patch("user-1", { email: "alice@example.com" });
tx.commit(); // Or tx.rollback()
```

### Transactions

Transactions allow you to stage multiple operations and commit them atomically:

```typescript
const tx = store.begin();

// Stage operations
tx.put("user-1", { name: "Alice", email: "alice@example.com" });
tx.patch("user-1", { email: "alice@newdomain.com" });
tx.del("user-2");

// Commit all operations atomically
tx.commit();

// Or commit silently (no hooks fire - useful during sync)
tx.commit({ silent: true });

// Or rollback (discard all staged operations)
tx.rollback();
```

#### Transaction Methods

Once you call `const tx = store.begin()`, you get access to the staged helpers implemented in [`packages/core/src/store.ts`](packages/core/src/store.ts):

- `tx.put(key, value)` – stage a brand-new encoded document using the current clock.
- `tx.patch(key, partial)` – merge a partial update into the staged (or persisted) record.
- `tx.merge(document)` – apply a previously encoded `Document.EncodedDocument` (used by sync and persistence plugins).
- `tx.del(key)` – tombstone a record by stamping `~deletedAt`.
- `tx.has(key)` – check whether the staged view currently exposes the record (ignores soft-deleted docs).
- `tx.commit({ silent })` – atomically publish the staged map. Pass `{ silent: true }` when you do not want hooks to fire.
- `tx.rollback()` – drop the staging map so the store remains untouched.

### Custom Plugin with Hooks

Hooks are provided via plugins. Create a custom plugin to listen to store mutations:

```typescript
import { Store } from "@byearlybird/starling";

// Create a custom plugin with hooks
const loggingPlugin = <T extends Record<string, unknown>>(): Store.Plugin<T> => {
  return (store) => ({
    init: () => {
      console.log("Logging plugin initialized");
    },
    dispose: () => {
      console.log("Logging plugin disposed");
    },
    hooks: {
      // Before hooks (throw to reject operation)
      onBeforePut: (key, value) => {
        console.log(`Before put: ${key}`);
        // Throw to reject: if (invalid) throw new Error("Invalid");
      },

      // After hooks (receive batched entries)
      onPut: (entries) => {
        for (const [key, value] of entries) {
          console.log(`Put ${key}:`, value);
        }
      },

      onPatch: (entries) => {
        for (const [key, value] of entries) {
          console.log(`Patched ${key}:`, value); // Full merged value
        }
      },

      onDelete: (keys) => {
        for (const key of keys) {
          console.log(`Deleted ${key}`);
        }
      },
    },
  });
};

// Use the plugin
const store = Store.create<{ name: string }>()
  .use(loggingPlugin());

await store.init();
```

## Official Plugins

Starling ships with optional packages that extend the core store. Each plugin has its own README inside `packages/plugins/*` with in-depth examples.

### Multiple Plugin Registration

One of Starling's most powerful features is the ability to register multiple plugins seamlessly. Thanks to CRDT-like merging, conflicts resolve automatically based on eventstamps:

```typescript
import { Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling-plugin-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import httpDriver from "unstorage/drivers/http";

// Register multiple storage backends - they work together automatically
const store = await Store.create<Todo>()
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

This example demonstrates seamless **cross-device sync with offline support**:
- Local changes are immediately persisted to localStorage
- Changes sync to the server every 5 seconds
- When back online, conflicts auto-resolve via eventstamps
- No manual conflict resolution code needed

### Query (`@byearlybird/starling-plugin-query`)

Attach predicate-based, reactive views that stay synchronized with store mutations. The manager exposes a `query()` helper and a store plugin. See [`packages/plugins/query/README.md`](packages/plugins/query/README.md) for usage patterns and API notes.

### Unstorage (`@byearlybird/starling-plugin-unstorage`)

Persists snapshots to any `unstorage` backend, replays them during boot, and optionally debounces writes. Supports multiple instances for hybrid sync strategies (local + remote, multi-region, etc.). Installation instructions and option descriptions are in [`packages/plugins/unstorage/README.md`](packages/plugins/unstorage/README.md).

For details about the repository structure, architecture, and package exports, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

MIT (see [`LICENSE`](LICENSE))

## Credits

💖 Made [@byearlybird](https://github.com/byearlybird)

Thanks for checking out Starling! 
