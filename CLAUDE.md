# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Starling is a reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. It provides:
- A reactive store with event-driven hooks
- Plugin system for queries, persistence, and synchronization
- Conflict-free merging using eventstamps (ISO8601 + hex counter)
- Transaction support with batched operations

## Project Structure and Architecture

Starling is a **monorepo** organized with four packages:

1. **Core Package** (`packages/core/`) - Framework-agnostic data management
   - `src/store.ts` - Main store with transaction support and plugin system
   - `src/document.ts` - Document encoding/decoding with `__id`, `__data`, `__deletedAt`
   - `src/record.ts` - Record-level CRDT operations
   - `src/value.ts` - Value-level encoding with eventstamps
   - `src/map.ts` - Internal key-value map with CRDT merge
   - `src/clock.ts` - Monotonic clock with forward() support
   - `src/eventstamp.ts` - Eventstamp encoding (ISO8601 + hex counter)
   - Exports: `@byearlybird/starling` with namespace pattern (`Store`, `Document`, etc.)

2. **Query Plugin** (`packages/plugins/query/`) - Reactive filtered views
   - `src/plugin.ts` - Query manager with predicate-based filtering
   - Exports: `@byearlybird/starling-plugins-query`
   - Depends on: `@byearlybird/starling`

3. **Poll Sync Plugin** (`packages/plugins/poll-sync/`) - Bidirectional HTTP synchronization
   - `src/plugin.ts` - Pull-interval + push-on-change semantics
   - Exports: `@byearlybird/plugins-poll-sync`
   - Depends on: `@byearlybird/starling`

4. **Unstorage Plugin** (`packages/plugins/unstorage/`) - Persistence abstraction
   - `src/plugin.ts` - Storage via `unstorage` (localStorage, filesystem, Redis, etc.)
   - Exports: `@byearlybird/starling-plugins-unstorage`
   - Depends on: `@byearlybird/starling`, `unstorage`

## Key Architecture Concepts

### Store Implementation
- Manages collections of typed objects in-memory with CRDT-like merge semantics
- Each value field gets an eventstamp (monotonic timestamp: `ISO8601|hexCounter`)
- Stores use `Map<string, EncodedDocument>` internally for O(1) key lookup
- Transaction support: stage operations, commit atomically, or rollback
- **Core methods**: `put()`, `patch()`, `del()`, `begin()`, `get()`, `has()`, `values()`, `entries()`, `snapshot()`, `use()`, `init()`, `dispose()`
- **Hooks**: Available only via plugins - `onPut`, `onPatch`, `onDelete` (fire on commit with batched entries)
- **Before hooks**: Available only via plugins - `onBeforePut`, `onBeforePatch`, `onBeforeDelete` (throw to reject)

### Eventstamps & CRDT Merging
- Custom clock generates `YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter` format (8-digit hex counter)
- Ensures monotonically increasing timestamps even when called multiple times per millisecond
- Field-level Last-Write-Wins (LWW) merge: higher eventstamp always wins
- Clock can be forwarded when merging remote data to maintain monotonicity
- Enables conflict-free synchronization without requiring coordination between clients

### Transactions
- `begin()` returns a transaction object with staged operations
- Operations: `tx.put()`, `tx.patch()`, `tx.del()`, `tx.merge()`
- `tx.commit()` applies all staged operations atomically and fires hooks
- `tx.commit({ silent: true })` applies operations without firing hooks (used during initial sync)
- `tx.rollback()` discards all staged operations
- Hooks fire once per commit with all operations batched together

### Plugins
Stores are extensible via a plugin system. Plugins are functions that receive a store and return lifecycle hooks.

**Plugin Pattern:**
```typescript
type Plugin<T> = (store: Store<T>) => PluginHandle<T>;
type PluginHandle<T> = {
  init: () => Promise<void> | void;
  dispose: () => Promise<void> | void;
  hooks?: StoreHooks<T>;
};
```

**Available Plugins:**
- **`createQueryManager<T>()`** - Query manager for reactive filtered views
  - Create queries with predicates
  - Automatically updates results when store changes
  - Returns `manager.plugin()` to attach to store

- **`pollSyncPlugin<T>(config)`** - Bidirectional synchronization
  - Config: `{ push, pull, pullInterval?, preprocess?, immediate? }`
  - Pull interval defaults to 5 minutes
  - Push happens immediately on any mutation
  - Optional `preprocess` hook for encryption/compression

- **`unstoragePlugin<T>(key, storage, config?)`** - Persistence layer
  - Config: `{ debounceMs? }` (defaults to 0)
  - Restores state on init with silent commit
  - Persists mutations automatically

**Usage Pattern:**
```typescript
const store = Store.create<T>()
  .use(plugin1)
  .use(plugin2);

await store.init();  // Initialize all plugins
await store.dispose(); // Cleanup all plugins
```

## Development Commands

### Testing & Quality
```bash
# Run all tests
bun test

# Run specific test file
bun test packages/core/src/store.test.ts
bun test packages/plugins/query/src/plugin.test.ts

# Run tests matching pattern
bun test --test-name-pattern "merge"

# Watch mode
bun test --watch
```

### Linting & Formatting
```bash
# Check code with Biome (formatting + linting)
bun biome check .

# Format code with Biome
bun biome format --write .

# Lint code with Biome (show issues only)
bun biome lint .
```

### Building & Publishing
```bash
# Build all packages (no root script, run individually)
bun run build:core
bun run build:plugins-poll-sync
bun run build:plugins-unstorage
# Note: query plugin uses its own build.ts

# Build specific package (from package directory)
cd packages/core && bun run build.ts
cd packages/plugins/query && bun run build.ts
```

Note: `tsdown` handles bundling each package's entry point and generating TypeScript declarations automatically. The build output for each package is written to its local `dist/` directory.

## Code Style

- **Formatting**: Tab indentation, double quotes (see [biome.json](biome.json))
- **TypeScript**: Strict mode with maximum type safety (see [tsconfig.json](tsconfig.json))
- **Imports**: Use `.ts` extensions in import paths
- **Testing**: Use `bun:test` framework (built-in to Bun)
- **Async**: Store operations are synchronous; plugins handle async I/O

## Common Patterns

### Creating a Store
```typescript
import { Store } from "@byearlybird/starling";

const store = Store.create<{ name: string; email: string }>();

// Insert new items
store.put("user1", { name: "Alice", email: "alice@example.com" });

// Update with partial data
store.patch("user1", { email: "alice@newdomain.com" });

// Delete (adds __deletedAt marker)
store.del("user1");

// Get values
const user = store.get("user1"); // { name: string; email: string } | null
const hasUser = store.has("user1"); // boolean

// Iterate all values (returns only non-deleted items)
for (const user of store.values()) {
  console.log(user); // { name: string; email: string }
}

// Iterate entries
for (const [key, value] of store.entries()) {
  console.log(key, value); // string, { name: string; email: string }
}

// Get snapshot (includes deleted items with __deletedAt)
const snapshot = store.snapshot(); // EncodedDocument[]
```

### Using Transactions
```typescript
// Create transaction
const tx = store.begin();

// Stage operations
tx.put("user1", { name: "Alice", email: "alice@example.com" });
tx.patch("user1", { email: "alice@newdomain.com" });
tx.del("user2");

// Operations not visible until commit
console.log(store.has("user1")); // false

// Commit atomically (fires hooks with all operations batched)
tx.commit();

// Or commit silently (no hooks fired, used during sync)
tx.commit({ silent: true });

// Or rollback (discard all staged operations)
tx.rollback();
```

### Custom Plugin with Hooks
Hooks are provided via plugins. Here's how to create a custom plugin with hooks:

```typescript
import { Store } from "@byearlybird/starling";

// Create a custom plugin with hooks
const loggingPlugin = <T extends Record<string, unknown>>(): Store.Plugin<T> => {
  return (store) => ({
    init: () => {
      console.log("Plugin initialized");
    },
    dispose: () => {
      console.log("Plugin disposed");
    },
    hooks: {
      // Before hooks (throw to reject)
      onBeforePut: (key, value) => {
        console.log(`Before put: ${key}`);
        // Throw to reject operation
        // if (invalid) throw new Error("Invalid data");
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

### Setting Up Queries
```typescript
import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";

// Create store and query manager
const store = Store.create<{ text: string; completed: boolean }>();
const queries = createQueryManager<{ text: string; completed: boolean }>();

// Attach query plugin to store
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
const unsubscribe = activeTodos.onChange(() => {
  console.log("Active todos changed:", activeTodos.results());
});

// Clean up
unsubscribe();
activeTodos.dispose();
```

### Setting Up Bidirectional Synchronization
```typescript
import { Store } from "@byearlybird/starling";
import { pollSyncPlugin } from "@byearlybird/plugins-poll-sync";

// Create and initialize store with sync plugin
const store = Store
  .create<{ text: string; completed: boolean }>()
  .use(pollSyncPlugin({
    pullInterval: 5000, // Poll server every 5 seconds (default: 5 minutes)
    immediate: true, // Pull immediately on init (default: true)

    push: async (data) => {
      // Send local changes to server (data is EncodedDocument[])
      await fetch("/api/todos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: data }),
      });
    },

    pull: async () => {
      // Fetch remote state from server (must return EncodedDocument[])
      const res = await fetch("/api/todos");
      const { todos } = await res.json();
      return todos;
    },

    // Optional: preprocess data before push/pull (e.g., encryption)
    preprocess: async (event, data) => {
      if (event === "push") {
        // Encrypt before sending
        return encryptData(data);
      } else {
        // Decrypt after receiving
        return decryptData(data);
      }
    },
  }));

await store.init(); // Initialize store and start syncing
await store.dispose(); // Clean up and push any pending changes
```

### Setting Up Persistence
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
const store = Store
  .create<{ text: string }>()
  .use(unstoragePlugin("todos", storage, {
    debounceMs: 300, // Debounce persistence by 300ms (default: 0)
  }));

await store.init(); // Restores state from storage
store.put("todo1", { text: "Buy milk" }); // Automatically persisted

await store.dispose(); // Clean up
```

### Server-Side Merge
```typescript
import { Store, Document } from "@byearlybird/starling";

// On server, create store
const serverStore = Store.create<{ text: string; completed: boolean }>();

// Merge incoming client updates
app.put("/api/todos", async (c) => {
  const { todos } = await c.req.json<{ todos: Document.EncodedDocument[] }>();

  // Merge using CRDT semantics (Last-Write-Wins by eventstamp)
  const tx = serverStore.begin();
  for (const doc of todos) {
    tx.merge(doc);
  }
  tx.commit();

  return c.json({ success: true });
});

app.get("/api/todos", async (c) => {
  // Send current state back to client
  const snapshot = serverStore.snapshot();
  return c.json({ todos: snapshot });
});
```

## Monorepo Packages

This is a monorepo with four independent packages:

- **`@byearlybird/starling`** - Core store, CRDT operations, and types (in `packages/core/`)
  - Exports: `Store`, `Document`, `Record`, `Value`, `Map`, `Clock`, `Eventstamp`
  - Zero production dependencies (custom listener system)

- **`@byearlybird/starling-plugins-query`** - Query plugin for reactive filtered views (in `packages/plugins/query/`)
  - Exports: `createQueryManager`
  - Depends on: `@byearlybird/starling`

- **`@byearlybird/plugins-poll-sync`** - Sync plugin for bidirectional HTTP sync (in `packages/plugins/poll-sync/`)
  - Exports: `pollSyncPlugin`, `PollSyncConfig`
  - Depends on: `@byearlybird/starling`

- **`@byearlybird/starling-plugins-unstorage`** - Persistence plugin (in `packages/plugins/unstorage/`)
  - Exports: `unstoragePlugin`
  - Depends on: `@byearlybird/starling`
  - Peer dependency: `unstorage@^1.17.1`

## Dependencies

**Production**: None (core is zero-dependency)

**Peer Dependencies** (optional):
- `unstorage@^1.17.1` - Required only for `unstoragePlugin`

**Dev Dependencies**:
- `@biomejs/biome@2.2.5` - Fast code formatter and linter
- `@types/bun` - TypeScript definitions for Bun runtime
- `tinybench@^5.0.1`, `mitata@^1.0.34` - Benchmarking frameworks
- `tsdown@^0.15.9` - Bundler for building packages
- `typescript@^5` - TypeScript compiler

## Performance Considerations

- **Lazy Query Decoding**: Query results are cached until a change occurs; decoding only happens when accessed
- **Transaction Batching**: Multiple operations fire hooks once with all entries batched
- **Efficient Hook System**: Custom listener implementation (no external dependencies)
- **In-Memory Storage**: All data stays in-memory; optional persistence is async via plugins

## Testing Strategy

- **Unit Tests** (`*.test.ts`) - Cover core functionality: store operations, hooks, transactions, CRDT merging, queries
- Tests use `bun:test` for fast, native execution
- Test files located alongside implementation files
- No external test utilities needed; `expect()` and `mock()` from `bun:test` sufficient

## Type System

All packages export types alongside implementations. The core uses namespace exports:

```typescript
import { Store, Document } from "@byearlybird/starling";

// Access types via namespace
type Store<T> = ReturnType<typeof Store.create<T>>;
type EncodedDoc = Document.EncodedDocument;
```

## Important Implementation Details

### EncodedDocument Structure
```typescript
type EncodedDocument = {
  __id: string;              // Document key
  __data: EncodedRecord;     // Encoded fields with eventstamps
  __deletedAt: string | null; // Deletion timestamp (null if active)
};
```

### Eventstamp Format
- Format: `YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter`
- Example: `2025-10-26T10:00:00.000Z|00000001`
- Counter is 8-digit zero-padded hex (increments on same millisecond)
- Lexicographically sortable for simple string comparison

### Clock Forward
When merging remote data, the clock automatically forwards to maintain monotonicity:
```typescript
// If incoming eventstamp is newer than local clock, clock forwards
tx.merge(remoteDoc); // Clock may advance based on remote eventstamps
```

### Silent Commits
Use silent commits during initial sync to prevent triggering queries and other hooks:
```typescript
const tx = store.begin();
for (const doc of initialData) {
  tx.merge(doc);
}
tx.commit({ silent: true }); // No hooks fire
```
