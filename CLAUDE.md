# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Starling is a reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. It provides:
- A reactive store with event-driven updates
- Query system with predicate-based filtering
- HTTP synchronization layer with conflict-free merging

## Project Structure and Architecture

Starling uses a **two-layer architecture**:

1. **Core Layer** (`lib/core/`) - Framework-agnostic data management
   - `store.ts` - Main store with CRDT-like merge semantics
   - `query.ts` - Reactive, filtered views of store data
   - `clock.ts` - Monotonic timestamp generation (ISO + hex counter)
   - `operations.ts` - Encode/decode/merge operations with conflict resolution
   - `types.ts` - Shared type definitions (EncodedObject, EncodedValue, etc.)

2. **Plugins Layer** (`lib/plugins/`)
   - `push-pull-plugin.ts` - Bidirectional sync with pull-interval and push-on-change semantics
   - `unstorage-plugin.ts` - Persistence abstraction via `unstorage` (localStorage, filesystem, Redis, etc.)

## Key Architecture Concepts

### Store Implementation
- Manages collections of typed objects in-memory with CRDT-like merge semantics
- Each value field gets an `__eventstamp` (custom monotonic timestamp: `ISO|hexCounter`)
- Stores use `Map<string, EncodedObject>` internally for O(1) key lookup
- Single-pass operations for performance (merge/update happen atomically)
- **Core methods**: `put()`, `putMany()`, `update()`, `updateMany()`, `delete()`, `deleteMany()`, `merge()`, `values()`, `snapshot()`
- **Events emitted**: `put`, `update`, `delete`, `change` (wildcard event when any mutation occurs)

### Eventstamps & CRDT Merging
- Custom clock generates `YYYY-MM-DDTHH:mm:ss.SSSZ|hexCounter` format
- Ensures monotonically increasing timestamps even when called multiple times per millisecond
- Field-level Last-Write-Wins (LWW) merge: higher eventstamp always wins
- Enables conflict-free synchronization without requiring coordination between clients
- Example: If two clients update the same field, the one with the newer eventstamp takes precedence

### Queries
- Create reactive, filtered views using a predicate function
- Maintain a `Set<string>` of matching keys for efficiency
- Only decode results when accessed (lazy evaluation)
- Automatically update query results when store changes
- **Event system**: `onChange()` callback triggered when results change

### Synchronization
- **Pull-based polling**: Configurable interval to fetch remote state
- **Push-on-change**: Automatically sends mutations to server
- **Merge semantics**: Server and clients merge independently using eventstamps
- **Optional preprocessing**: `preprocess` hook for encryption/compression before merge
- Results in eventual consistency across all clients

### Plugins
Stores are extensible via a plugin system. Plugins are functions that receive a store and return lifecycle hooks (`init` and `dispose`).

**Available Plugins:**
- **`pushPullPlugin`** - Bidirectional synchronization with pull-interval and push-on-change semantics
  - Configured with `pullInterval` (milliseconds between pulls) and `push`/`pull` async functions
  - Automatically syncs mutations to remote and periodically fetches updates
- **`unstoragePlugin`** - Persistence layer using `unstorage` abstraction
  - Supports multiple backends: localStorage, filesystem, Redis, memory, etc.
  - Automatically persists mutations and restores state on initialization

**Usage Pattern:**
```typescript
const store = createStore<T>("collection")
  .use(plugin1(config1))
  .use(plugin2(config2));

await store.init();  // Initialize all plugins
await store.dispose(); // Cleanup all plugins
```

## Development Commands

### Testing & Quality
```bash
# Run all tests
bun test

# Run specific test file
bun test lib/core/store.test.ts

# Run tests matching pattern
bun test --test-name-pattern "merge"

# Watch mode
bun test --watch

# Run benchmarks
bun lib/core/store/store.bench.ts
bun lib/core/crdt/operations.bench.ts
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
# Build JavaScript bundles + TypeScript declarations
bun run build
```

Note: `tsdown` handles bundling all entry points (`lib/core/`, `lib/plugins/`) and generating TypeScript declarations automatically. The build output is written to `dist/`.


## Code Style

- **Formatting**: Tab indentation, double quotes (see [biome.json](biome.json))
- **TypeScript**: Strict mode with maximum type safety (see [tsconfig.json](tsconfig.json))
- **Imports**: Use `.ts` extensions in import paths
- **Testing**: Use `bun:test` framework (built-in to Bun)
- **Async**: All store operations are synchronous; I/O (persistence, sync) is async

## Common Patterns

### Creating a Store
```typescript
import { createStore } from "@byearlybird/starling";

const store = createStore<{ name: string; email: string }>("users");

// Insert (put) new items
store.put("user1", { name: "Alice", email: "alice@example.com" });

// Update with partial data
store.update("user1", { email: "alice@newdomain.com" });

// Delete (soft delete with __deleted marker)
store.delete("user1");

// Get all values
const users = store.values(); // Map<string, T>
```

### Setting Up Bidirectional Synchronization
```typescript
import { pushPullPlugin } from "@byearlybird/starling/plugins";

// Create and initialize store with sync plugin
const store = createStore<{ text: string; completed: boolean }>("todos")
  .use(pushPullPlugin({
    pullInterval: 5000, // Poll server every 5 seconds

    push: async (encoded) => {
      // Send local changes to server
      await fetch("/api/todos", {
        method: "PUT",
        body: JSON.stringify({ todos: encoded }),
      });
    },

    pull: async () => {
      // Fetch remote state from server
      const res = await fetch("/api/todos");
      return res.json(); // Should be encoded state with __eventstamps
    },
  }));

await store.init(); // Initialize store and start syncing
await store.dispose(); // Clean up and stop syncing
```

### Server-Side Merge
```typescript
// On server, merge incoming client updates
app.put("/api/todos", async (c) => {
  const { todos: clientState } = await c.req.json();

  // Merge using CRDT semantics (Last-Write-Wins by eventstamp)
  serverStore.merge(clientState);

  // Send current state back to client
  const state = serverStore.snapshot();
  return c.json({ todos: state });
});
```

### Listening to Store Events
```typescript
// Subscribe to specific events
const unsubscribe = store.on("update", (items) => {
  items.forEach(({ key, value }) => {
    console.log(`Updated ${key}:`, value);
  });
});

// All events trigger "change" event
store.on("change", () => {
  console.log("Store mutated");
});

// Clean up
unsubscribe();
```

## Package Exports

The package provides multiple entry points for tree-shaking and bundling efficiency:

- `@byearlybird/starling` (or `@byearlybird/starling/core`) - Core store, query, and CRDT operations
- `@byearlybird/starling/plugins` - Sync and persistence plugins (`pushPullPlugin`, `unstoragePlugin`)

## Dependencies

**Production**:
- `mitt@^3.0.1` - Lightweight event emitter (2KB). Used for store's pub/sub event system.

**Peer Dependencies** (optional):
- `unstorage@^1.17.1` - Required only for persistence via `unstoragePlugin`; supports localStorage, filesystem, Redis, memory, etc.
- `typescript@^5` - Required for development; declarations exported for consumers

**Dev Dependencies**:
- `@biomejs/biome@2.2.5` - Fast code formatter and linter
- `@types/bun` - TypeScript definitions for Bun runtime
- `tinybench@^5.0.1`, `mitata@^1.0.34` - Benchmarking frameworks
- `tsdown@^0.15.9` - Bundler for building entry points and generating TypeScript declarations

## Performance Considerations

- **Lazy Query Decoding**: Query results are cached until a change occurs; decoding only happens on access
- **Single-Pass Merge**: Update operations encode, merge, and collect results in one iteration (no intermediate allocations)
- **Efficient Event Tracking**: Queries maintain a `Set<string>` of matching keys, avoiding predicate re-evaluation on non-matching items
- **In-Memory Storage**: All data stays in-memory; optional persistence is asynchronous via `unstorage`

## Testing Strategy

- **Unit Tests** (`*.test.ts`) - Cover core functionality: clock monotonicity, store operations, merge logic, query filtering
- **Benchmarks** (`*.bench.ts`) - Performance tests on realistic datasets (e.g., 100k items)
- Tests use `bun:test` for fast, native execution without extra tooling
- No external test utilities needed; `expect()` assertions sufficient for most cases
