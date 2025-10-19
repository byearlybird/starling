# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Flock is a reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. It provides:
- A reactive store with event-driven updates
- Query system with predicate-based filtering
- HTTP synchronization layer with conflict-free merging
- Framework bindings for React and Solid

## Project Structure

```
lib/
├── core/           # Core library (framework-agnostic)
│   ├── store.ts    # Main store implementation with eventstamps
│   ├── query.ts    # Reactive query system
│   ├── operations.ts # Encode/decode/merge operations
│   └── types.ts    # Shared types (EncodedValue, EncodedObject, etc.)
├── react/          # React hooks (useData, useQuery)
├── solid/          # Solid hooks (useData, useQuery)
└── sync/           # HTTP synchronizer for client-server sync

demo-react/         # React demo app (Vite + React)
demo-solid/         # Solid demo app (Vite + Solid)
demo-server/        # Demo backend (Hono + Bun)
```

## Key Architecture Concepts

### Stores
- Stores manage collections of objects with CRDT-like merge semantics
- Each value is encoded with an `__eventstamp` (ULID-based monotonic timestamp)
- Uses `unstorage` for storage abstraction (supports localStorage, filesystem, etc.)
- Operations: `insert()`, `update()`, `mergeState()`, `values()`, `state()`
- Event emitters: `insert`, `update`, `mutate`

### Queries
- Queries provide reactive, filtered views of store data
- Accept a predicate function to filter items
- Emit `init` (on load) and `change` (on updates) events
- Automatically handle concurrent loads and pending operations

### Synchronization
- `createHttpSynchronizer` enables client-server sync over HTTP
- Supports bidirectional sync: push on mutations, pull on interval
- Optional `preprocess` hook for encryption/transformation
- Merge conflicts resolved via eventstamp comparison (Last-Write-Wins)

### Framework Bindings
- React: `useData(store)`, `useQuery(store, predicate, deps)`
- Solid: `useData(store)`, `useQuery(store, predicate)`
- Both provide reactive updates when store data changes

## Development Commands

### Testing
```bash
# Run all tests
bun test

# Run specific test file
bun test lib/core/store.test.ts

# Watch mode
bun test --watch
```

### Linting and Formatting
```bash
# Check code with Biome
bun biome check .

# Format code with Biome
bun biome format --write .

# Lint code with Biome
bun biome lint .
```

### Running Demos
```bash
# Run demo server (port 3000)
cd demo-server && bun run index.ts

# Run React demo (separate terminal)
cd demo-react && bun run dev

# Run Solid demo (separate terminal)
cd demo-solid && bun run dev
```

## Code Style

- **Formatting**: Tabs for indentation, double quotes (see [biome.json](biome.json))
- **TypeScript**: Strict mode enabled with maximum type safety (see [tsconfig.json](tsconfig.json))
- **Imports**: Use `.ts` extensions in import paths
- **Testing**: Use `bun:test` framework (not Jest or Vitest)

## Common Patterns

### Creating a Store
```typescript
import { createStore } from "@byearlybird/flock";
import { createStorage } from "unstorage";

const store = createStore<{ name: string }>("users", {
  storage: createStorage(),
});

// Insert and update
await store.insert("user1", { name: "Alice" });
await store.update("user1", { name: "Bob" });
```

### Using Queries in React
```typescript
import { useQuery } from "@byearlybird/flock/react";

function Component() {
  const { data, isLoading } = useQuery(
    todoStore,
    (todo) => !todo.completed,
    [] // dependency list
  );
  // ...
}
```

### Setting Up Sync
```typescript
import { createHttpSynchronizer } from "@byearlybird/flock/sync";

const sync = createHttpSynchronizer(store, {
  pullInterval: 5000,
  push: async (data) => {
    await fetch("/api/todos", {
      method: "PUT",
      body: JSON.stringify({ todos: data }),
    });
  },
  pull: async () => {
    const res = await fetch("/api/todos");
    const { todos } = await res.json();
    return todos;
  },
});

await sync.start();
```

## Package Exports

The package provides multiple entry points:
- `@byearlybird/flock` - Core library
- `@byearlybird/flock/react` - React hooks
- `@byearlybird/flock/solid` - Solid hooks
- `@byearlybird/flock/sync` - HTTP synchronizer

## Dependencies

- `unstorage` - Storage abstraction layer (peer dependency)
- `mitt` - Tiny event emitter
- `ulid` - Monotonic timestamp generation
- `flat` - Object flattening for nested updates
- React 19+ (peer, optional)
- Solid 1.9+ (peer, optional)
