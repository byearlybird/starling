# @byearlybird/starling

**Local-first reactive sync. Zero dependencies, no ceremony.**

A reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. Starling provides a simple yet powerful way to manage, query, and synchronize application state across clients and servers with automatic conflict resolution.

## Why Starling?

Cross-device sync shouldn't require heavyweight infrastructure or learning new query languages. Starling gives you:

- **Tiny footprint** - Core library is ~4KB with zero runtime dependencies
- **Just JavaScript** - Query with plain predicates, no complex query languages or custom DSLs
- **Simple sync** - Multiplex storage backends (localStorage + HTTP) and conflicts auto-resolve
- **Extensible hooks** - Add encryption, validation, or custom logic in ~10 lines
- **Works everywhere** - React, Vue, Solid, Node, Deno, Bun - if it runs JS, it works

Perfect for apps that sync across devices, offline-first apps, or any tool that benefits from eventual consistency.

## Features

- **Zero Dependencies** - Core package has no external dependencies (~4KB)
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

// Insert items using set
let todo1Id: string;
todoStore.set(tx => {
  todo1Id = tx.put({ text: "Learn Starling", completed: false }); // capture generated ID
  tx.put({ text: "Build an app", completed: false }, { withId: "todo-2" });
});

// Query with plain JavaScript predicates - direct method access!
const activeTodos = todoStore.query(todo => !todo.completed);
console.log(activeTodos.results()); // Map of incomplete todos

// Updates automatically trigger query re-evaluation
todoStore.set(tx => {
  tx.patch(todo1Id, { completed: true });
});
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

// Optionally provide a custom ID generator
const deterministicStore = Store.create<YourType>({
  getId: () => crypto.randomUUID(),
});

// To listen to store mutations, use plugins (see "Custom Plugin with Hooks" below)
```

### Store Lifecycle

- `store.use(plugin)` chains plugins and returns the same store so calls can be composed.
- `await store.init()` runs the store once and awaits each plugin's `init` hook (start pollers, hydrate snapshots, warm caches, etc).
- `await store.dispose()` tears down plugins (each `dispose` hook runs) and lets plugins flush pending work before you drop the store.

### Store Methods

#### `set(callback: (tx) => void, options?: { silent?: boolean }): void`
Execute mutations on the store. All mutations must be performed inside the set callback. The transaction auto-commits when the callback completes, unless `tx.rollback()` is called.

```typescript
// Insert items
store.set(tx => {
  const generatedId = tx.put({ name: "Alice", email: "alice@example.com" });
  tx.put({ name: "Bob" }, { withId: "user-1" });
});

// Update items
store.set(tx => {
  tx.patch("user-1", { email: "alice@newdomain.com" });
});

// Delete items
store.set(tx => {
  tx.del("user-1");
});

// Silent mutations (don't trigger hooks - useful for sync)
store.set(tx => {
  tx.put({ name: "Charlie" });
}, { silent: true });

// Rollback on error
store.set(tx => {
  tx.put({ name: "Dave" });
  if (someCondition) {
    tx.rollback(); // Abort all changes
    return;
  }
  tx.patch("user-1", { name: "Updated" });
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

The `set()` callback receives a transaction object with these methods:

- `tx.put(value, options?)` – Insert a new document. Returns the generated or provided ID.
- `tx.patch(key, partial)` – Merge a partial update into an existing document.
- `tx.merge(document)` – Apply a previously encoded `Document.EncodedDocument` (used by sync and persistence plugins).
- `tx.del(key)` – Soft-delete a document by stamping `~deletedAt`.
- `tx.get(key)` – Get a document by key if it exists (ignores soft-deleted docs).
- `tx.rollback()` – Abort the transaction and discard all changes.

### Custom Plugin with Hooks

Hooks are provided via plugins. Create a custom plugin to listen to store mutations:

```typescript
import type { Store } from "@byearlybird/starling";

// Create a custom plugin with hooks
const loggingPlugin = <T extends Record<string, unknown>>(): Store.Plugin<T> => ({
  init: (store) => {
    console.log("Logging plugin initialized with store");
  },
  dispose: () => {
    console.log("Logging plugin disposed");
  },
  hooks: {
    // Hooks receive batched entries after mutations commit
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

// Use the plugin
const store = await Store.create<{ name: string }>()
  .use(loggingPlugin())
  .init();
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
