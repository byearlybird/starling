# @byearlybird/starling

A reactive, framework-agnostic data synchronization library with CRDT-like merge capabilities. Starling provides a simple yet powerful way to manage, query, and synchronize application state across clients and servers with automatic conflict resolution.

## Features

- **Reactive Stores**: Event-driven data stores with automatic change notifications
- **Query System**: Predicate-based filtering with reactive updates
- **CRDT-like Merging**: Conflict-free state synchronization using eventstamps (ULID-based monotonic timestamps)
- **HTTP Synchronization**: Bidirectional client-server sync with customizable push/pull strategies
- **Framework Agnostic**: Works standalone or with React and Solid via dedicated hooks
- **Storage Abstraction**: Powered by `unstorage` for flexible persistence (localStorage, filesystem, Redis, etc.)
- **TypeScript First**: Full type safety with strict TypeScript support

## Installation

```bash
# npm
npm install @byearlybird/starling unstorage

# bun
bun add @byearlybird/starling unstorage

# yarn
yarn add @byearlybird/starling unstorage
```

### Optional Framework Dependencies

For React:
```bash
npm install react@^19 react-dom@^19
```

For Solid:
```bash
npm install solid-js@^1.9.9
```

## Quick Start

```typescript
import { createStore } from "@byearlybird/starling";
import { createStorage } from "unstorage";

// Create a store
const todoStore = createStore<{ text: string; completed: boolean }>("todos", {
  storage: createStorage(),
});

// Insert items
await todoStore.insert("todo-1", {
  text: "Learn Starling",
  completed: false,
});

// Update items (supports partial updates)
await todoStore.update("todo-1", { completed: true });

// Get all values
const todos = await todoStore.values();
console.log(todos); // { "todo-1": { text: "Learn Starling", completed: true, __eventstamp: "..." } }

// Listen to changes
const unsubscribe = todoStore.on("update", (updates) => {
  console.log("Updated:", updates);
});
```

## Core API

### Creating a Store

```typescript
import { createStore } from "@byearlybird/starling";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

const store = createStore<YourType>("collectionName", {
  storage: createStorage({
    driver: localStorageDriver({ base: "app:" }),
  }),
});
```

### Store Methods

#### `insert(key: string, value: T): Promise<void>`
Insert a new item into the store. Each value is automatically encoded with an `__eventstamp` for conflict resolution.

```typescript
await store.insert("user-1", { name: "Alice", email: "alice@example.com" });
```

#### `update(key: string, value: DeepPartial<T>): Promise<void>`
Update an existing item with partial data. Supports nested updates via dot notation.

```typescript
await store.update("user-1", { email: "alice@newdomain.com" });
```

#### `values(): Promise<Record<string, T>>`
Get all decoded values from the store.

```typescript
const allUsers = await store.values();
```

#### `state(): Promise<EncodedRecord>`
Get the raw encoded state with eventstamps (useful for synchronization).

```typescript
const encodedState = await store.state();
```

#### `mergeState(data: EncodedRecord): Promise<void>`
Merge external state into the store. Conflicts are resolved using eventstamp comparison (Last-Write-Wins).

```typescript
await store.mergeState(incomingState);
```

### Store Events

Subscribe to store changes using the event emitter:

```typescript
// Listen for new insertions
store.on("insert", (items) => {
  items.forEach(({ key, value }) => console.log(`Inserted: ${key}`, value));
});

// Listen for updates
store.on("update", (items) => {
  items.forEach(({ key, value }) => console.log(`Updated: ${key}`, value));
});

// Listen for any mutation (insert or update)
store.on("mutate", () => {
  console.log("Store has changed");
});

// Unsubscribe
const unsubscribe = store.on("update", callback);
unsubscribe();
```

## Queries

Queries provide reactive, filtered views of store data.

```typescript
import { createQuery } from "@byearlybird/starling";

const query = createQuery(
  todoStore,
  (todo) => !todo.completed // Predicate function
);

// Listen for initial data load
query.on("init", (todos) => {
  console.log("Initial todos:", todos);
});

// Listen for changes
query.on("change", (todos) => {
  console.log("Todos updated:", todos);
});

// Clean up
query.dispose();
```

## Synchronization

Starling provides an HTTP synchronizer for bidirectional client-server sync.

```typescript
import { createHttpSynchronizer } from "@byearlybird/starling/sync";

const sync = createHttpSynchronizer(todoStore, {
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
  preprocess: (data) => {
    // Transform or decrypt data before merging
    return data;
  },
});

// Start synchronization
await sync.start();

// Stop synchronization
sync.stop();
```

### Server-Side Merging

On the server, use `mergeState` to handle incoming updates:

```typescript
// Server endpoint (e.g., using Hono, Express, etc.)
app.put("/api/todos", async (c) => {
  const { todos } = await c.req.json();

  // Merge client state into server store
  await serverTodoStore.mergeState(todos);

  return c.json({ success: true });
});

app.get("/api/todos", async (c) => {
  const state = await serverTodoStore.state();
  return c.json({ todos: state });
});
```

## Framework Bindings

### React

```typescript
import { useData, useQuery } from "@byearlybird/starling/react";

function TodoList() {
  // Get all data from store
  const { data: allTodos, isLoading } = useData(todoStore);

  // Or use a query for filtered data
  const { data: activeTodos, isLoading } = useQuery(
    todoStore,
    (todo) => !todo.completed,
    [] // dependency array (like useEffect)
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {Object.entries(activeTodos).map(([id, todo]) => (
        <li key={id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

### Solid

```typescript
import { useData, useQuery } from "@byearlybird/starling/solid";

function TodoList() {
  // Get all data from store
  const { data: allTodos, isLoading } = useData(todoStore);

  // Or use a query for filtered data
  const { data: activeTodos, isLoading } = useQuery(
    todoStore,
    (todo) => !todo.completed
  );

  return (
    <Show when={!isLoading()} fallback={<div>Loading...</div>}>
      <ul>
        <For each={Object.entries(activeTodos())}>
          {([id, todo]) => <li>{todo.text}</li>}
        </For>
      </ul>
    </Show>
  );
}
```

## Architecture

### Eventstamps

Every value in Starling is encoded with an `__eventstamp` field containing a ULID (Universally Unique Lexicographically Sortable Identifier). This enables:

- **Monotonic timestamps**: Later events always have higher eventstamps
- **Conflict resolution**: When two clients update the same field, the update with the higher eventstamp wins (Last-Write-Wins)
- **Distributed consistency**: Multiple clients can sync without coordination

### CRDT-like Merging

When merging states, Starling compares eventstamps at the field level:

```typescript
// Client A updates
{ name: "Alice", email: "alice@old.com", __eventstamp: "01H..." }

// Client B updates (newer eventstamp for email only)
{
  name: { value: "Alice", __eventstamp: "01H..." },
  email: { value: "alice@new.com", __eventstamp: "01J..." }
}

// Merged result: email takes precedence due to higher eventstamp
{ name: "Alice", email: "alice@new.com" }
```

## Package Exports

Starling provides multiple entry points for different use cases:

- `@byearlybird/starling` - Core library (stores, queries, operations)
- `@byearlybird/starling/react` - React hooks (`useData`, `useQuery`)
- `@byearlybird/starling/solid` - Solid hooks (`useData`, `useQuery`)
- `@byearlybird/starling/sync` - HTTP synchronizer

## Development

### Running Tests

```bash
bun test

# Watch mode
bun test --watch

# Specific test file
bun test lib/core/store.test.ts
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

### Running Demo Apps

```bash
# Start demo server (port 3000)
cd demo-server && bun run index.ts

# Start React demo (separate terminal)
cd demo-react && bun run dev

# Start Solid demo (separate terminal)
cd demo-solid && bun run dev
```

## License

MIT

## Credits

Built with [Bun](https://bun.sh) by [@byearlybird](https://github.com/byearlybird)
