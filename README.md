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

## Installation

```bash
# Core package
bun add @byearlybird/starling

# Optional plugins
bun add @byearlybird/starling-plugins-query
bun add @byearlybird/plugins-poll-sync
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
Delete an item (adds `__deletedAt` timestamp).

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
Get the raw encoded state with eventstamps (includes deleted items with `__deletedAt`).

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

## Queries

Queries provide reactive, filtered views of store data.

```typescript
import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";

// Create store and query manager
const store = Store.create<{ text: string; completed: boolean }>();
const queries = createQueryManager<{ text: string; completed: boolean }>();

// Attach query plugin
store.use(() => queries.plugin());
await store.init();

// Create query with predicate
const activeTodos = queries.query((todo) => !todo.completed);

// Get results (returns Map<string, T>)
const results = activeTodos.results();
for (const [key, todo] of results) {
  console.log(key, todo);
}

// Listen for changes
activeTodos.onChange(() => {
  console.log("Active todos changed:", activeTodos.results());
});

// Clean up
activeTodos.dispose();
```

## Synchronization

Starling provides a poll-based sync plugin for bidirectional client-server sync.

```typescript
import { Store } from "@byearlybird/starling";
import { pollSyncPlugin } from "@byearlybird/plugins-poll-sync";

const store = $store
  .create<{ text: string; completed: boolean }>()
  .use(pollSyncPlugin({
    pullInterval: 5000, // Pull from server every 5 seconds

    // Push local changes to server
    push: async (data) => {
      await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: data }),
      });
    },

    // Pull remote changes from server
    pull: async () => {
      const response = await fetch("/api/todos");
      const { todos } = await response.json();
      return todos;
    },

    // Optional: preprocess data before merging (e.g., encryption)
    preprocess: async (event, data) => {
      // Transform or decrypt data before merging
      return data;
    },
  }));

// Start synchronization
await store.init();

// Stop synchronization
await store.dispose();
```

### Server-Side Merging

On the server, use transactions to merge incoming updates:

```typescript
import { Store, Document } from "@byearlybird/starling";

// Server store
const serverStore = Store.create<{ text: string; completed: boolean }>();

// Merge endpoint
app.put("/api/todos", async (c) => {
  const { todos } = await c.req.json<{ todos: Document.EncodedDocument[] }>();

  // Merge client state into server store
  const tx = serverStore.begin();
  for (const doc of todos) {
    tx.merge(doc);
  }
  tx.commit();

  return c.json({ success: true });
});

// Pull endpoint
app.get("/api/todos", async (c) => {
  const snapshot = serverStore.snapshot();
  return c.json({ todos: snapshot });
});
```

## Persistence

Store data persistently using the unstorage plugin:

```typescript
import { Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

// Create storage
const storage = createStorage({
  driver: localStorageDriver({ base: "app:" }),
});

// Create store with persistence
const store = $store
  .create<{ text: string }>()
  .use(unstoragePlugin("todos", storage, {
    debounceMs: 300, // Debounce persistence by 300ms
  }));

await store.init(); // Restores state from storage
store.put("todo1", { text: "Buy milk" }); // Automatically persisted
```

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

## Package Exports

Starling is organized as a monorepo with four packages:

- **`@byearlybird/starling`** - Core library (stores, CRDT operations, transactions)
  - Exports: `$store`, `$document`, `$record`, `$value`, `$map`, `$clock`, `$eventsamp`
  - Zero dependencies

- **`@byearlybird/starling-plugins-query`** - Query plugin for reactive filtered views
  - Exports: `createQueryManager`

- **`@byearlybird/plugins-poll-sync`** - Sync plugin for bidirectional HTTP sync
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
cd packages/plugins/poll-sync && bun run build.ts
cd packages/plugins/query && bun run build.ts
cd packages/plugins/unstorage && bun run build.ts
```

## License

MIT

## Credits

Built with [Bun](https://bun.sh) by [@byearlybird](https://github.com/byearlybird)
