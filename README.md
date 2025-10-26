# @byearlybird/starling

A reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. Starling provides a simple yet powerful way to manage, query, and synchronize application state across clients and servers with automatic conflict resolution.

## Features

- **Reactive Stores**: Event-driven data stores with hook-based notifications
- **Query System**: Predicate-based filtering with reactive updates (via plugin)
- **CRDT-like Merging**: Conflict-free state synchronization using eventstamps (ISO8601 + hex counter)
- **HTTP Synchronization**: Bidirectional client-server sync with customizable push/pull strategies (via plugin)
- **Storage Abstraction**: Powered by `unstorage` for flexible persistence (via plugin)
- **Transaction Support**: Stage operations and commit/rollback atomically
- **TypeScript First**: Full type safety with strict TypeScript support
- **Zero Dependencies**: Core package has no external dependencies

## Repository Layout

| Path | Notes |
| --- | --- |
| `packages/core` | Core CRDT store (`Store`, `Document`, `Eventstamp`, `Record`, `Value`, `KV`, `Clock`) plus exhaustive unit tests. |
| `packages/plugins/query` | Reactive query manager (`createQueryManager`) that listens to store hooks to keep filtered `Map`s in sync. |
| `packages/plugins/poll` | Bidirectional HTTP poller (`pollSyncPlugin`) with push/pull/preprocess hooks. |
| `packages/plugins/unstorage` | Persistence bridge (`unstoragePlugin`) that replays snapshots on boot and debounces writes. |
| `index.ts` | Convenience export surface if you want to consume packages from the monorepo during local development. |

## Installation

```bash
# Core package
bun add @byearlybird/starling

# Optional plugins
bun add @byearlybird/starling-plugins-query
bun add @byearlybird/starling-plugins-poll
bun add @byearlybird/starling-plugins-unstorage unstorage
```

## Quick Start

```typescript
import { Store } from "@byearlybird/starling";

// Create a store
const todoStore = Store.create<{ text: string; completed: boolean }>();

// Insert items
todoStore.put("todo-1", {
  text: "Learn Starling",
  completed: false,
});

// Update items (supports partial updates)
todoStore.patch("todo-1", { completed: true });

// Get values
const todo = todoStore.get("todo-1");
console.log(todo); // { text: "Learn Starling", completed: true }
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
- `tx.commit({ silent })` – atomically publish the staged map. Pass `{ silent: true }` when you are hydrating state and do not want hooks to fire.
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

### Query (`@byearlybird/starling-plugins-query`)

Attach predicate-based, reactive views that stay synchronized with store mutations. The manager exposes a `query()` helper and a store plugin. See [`packages/plugins/query/README.md`](packages/plugins/query/README.md) for usage patterns and API notes.

### Poll Sync (`@byearlybird/starling-plugins-poll`)

Bidirectional HTTP polling that batches push/pull operations and merges remote documents via transactions. Configuration details, networking tips, and server-merging guidance live in [`packages/plugins/poll/README.md`](packages/plugins/poll/README.md).

### Unstorage (`@byearlybird/starling-plugins-unstorage`)

Persists snapshots to any `unstorage` backend, replays them with `{ silent: true }` during boot, and optionally debounces writes. Installation instructions and option descriptions are in [`packages/plugins/unstorage/README.md`](packages/plugins/unstorage/README.md).

## Architecture

### Eventstamps

Every value in Starling is encoded with eventstamps for conflict resolution. The eventstamp format is:

```
YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter
```

Example: `2025-10-26T10:00:00.000Z|00000001`

This enables:

- **Monotonic timestamps**: Later events always have higher eventstamps
- **Conflict resolution**: When two clients update the same field, the update with the higher eventstamp wins (Last-Write-Wins)
- **Distributed consistency**: Multiple clients can sync without coordination

### CRDT-like Merging

When merging states, Starling compares eventstamps at the field level:

```typescript
// Client A updates
{ name: "Alice", email: "alice@old.com" }

// Client B updates (newer eventstamp for email only)
{ email: "alice@new.com" }

// Merged result: email takes precedence due to higher eventstamp
{ name: "Alice", email: "alice@new.com" }
```

### Plugin System

Stores are extensible via plugins that provide lifecycle hooks:

```typescript
type Plugin<T> = (store: Store<T>) => PluginHandle<T>;
type PluginHandle<T> = {
  init: () => Promise<void> | void;
  dispose: () => Promise<void> | void;
  hooks?: StoreHooks<T>;
};

// Usage
const store = Store.create<T>()
  .use(plugin1)
  .use(plugin2);

await store.init();
```

### Modules at a Glance

- [`clock.ts`](packages/core/src/clock.ts) – monotonic logical clock that increments a hex counter whenever the OS clock stalls and can `forward` itself when it sees newer remote stamps.
- [`eventstamp.ts`](packages/core/src/eventstamp.ts) – encoder/decoder for the sortable `YYYY-MM-DDTHH:mm:ss.sssZ|counter` strings.
- [`value.ts`](packages/core/src/value.ts) – wraps primitives with their eventstamp and merges values by comparing stamps.
- [`record.ts`](packages/core/src/record.ts) – walks nested objects, encoding/decoding each field and recursively merging sub-records.
- [`document.ts`](packages/core/src/document.ts) – attaches metadata (`~id`, `~deletedAt`) and knows how to tombstone or merge entire documents.
- [`kv.ts`](packages/core/src/kv.ts) – immutable map plus transactional staging used by the store to guarantee atomic commits.
- [`store.ts`](packages/core/src/store.ts) – user-facing API layer plus plugin orchestration and hook batching.

## Package Exports

Starling is organized as a monorepo with four packages:

- **`@byearlybird/starling`** - Core library (stores, CRDT operations, transactions)
  - Exports: `Store`, `Document`, `Eventstamp`, `Clock`, `KV`, `Record`, `Value`
  - Zero dependencies

- **`@byearlybird/starling-plugins-query`** - Query plugin for reactive filtered views
  - Exports: `createQueryManager`

- **`@byearlybird/starling-plugins-poll`** - Poll-based plugin for bidirectional HTTP sync
  - Exports: `pollSyncPlugin`, `PollSyncConfig`

- **`@byearlybird/starling-plugins-unstorage`** - Persistence plugin
  - Exports: `unstoragePlugin`
  - Peer dependency: `unstorage@^1.17.1`

## Development

### Running Tests

```bash
bun test

# Watch mode
bun test --watch

# Specific test file
bun test packages/core/src/store.test.ts
```

- The suite under `packages/core/src/*.test.ts` exercises every CRDT building block (values, records, documents, clocks, store hooks). Run it before publishing plugin updates to avoid subtle merge regressions.
- Plugin packages currently rely on focused integration tests; adapt the usage snippets above into your own harnesses when extending sync/persistence flows.

### Linting and Formatting

```bash
# Check code
bun biome check .

# Format code
bun biome format --write .

# Lint code
bun biome lint .
```

### Building

```bash
# Build core package
bun run build:core

# Build plugin packages
cd packages/plugins/poll && bun run build.ts
cd packages/plugins/query && bun run build.ts
cd packages/plugins/unstorage && bun run build.ts
```

## License

MIT

## Credits

Built with [Bun](https://bun.sh) by [@byearlybird](https://github.com/byearlybird)
