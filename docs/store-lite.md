# StoreLite

StoreLite is a lightweight async variant of Store without built-in queries or plugins. It focuses exclusively on CRDT sync and async storage adapters, letting you bring your own query library (TanStack Query, TanStack DB, MobX, etc.).

**Key Feature:** Each mutation operation reads and writes only the specific document it affects - no loading entire datasets into memory. Perfect for large-scale storage with IndexedDB, SQLite, or remote databases.

## When to Use StoreLite

### Use StoreLite when:
- ✅ You already use TanStack Query, MobX, Jotai, or similar
- ✅ You need IndexedDB or other async storage
- ✅ You want a smaller bundle (~2-2.5KB vs 4KB)
- ✅ You have large datasets (>10k documents)
- ✅ You want full control over querying and caching

### Use Store when:
- ✅ Building a simple app with <1000 documents
- ✅ Want built-in reactive queries
- ✅ Need persistence plugins (localStorage, HTTP)
- ✅ Prefer synchronous API
- ✅ Don't want external dependencies

## Installation

StoreLite ships with the core package:

```bash
bun add @byearlybird/starling
```

## Quick Start

```typescript
import { StoreLite } from "@byearlybird/starling/lite";
import { InMemoryAdapter } from "@byearlybird/starling/adapter/memory";

// Create store with async adapter
const store = await new StoreLite<{ text: string; completed: boolean }>({
  adapter: new InMemoryAdapter(),
}).init();

// Direct mutations (each operates on a single document)
const id = await store.add({ text: "Buy milk", completed: false });
await store.update(id, { completed: true });
await store.del(id);

// Read operations
const todo = await store.get(id);
const allTodos = await store.entries();
```

## API

### Constructor

```typescript
new StoreLite<T>(config: {
  adapter: StoreAdapter<EncodedDocument>;
  getId?: () => string;
})
```

- `adapter` - Storage adapter implementing the `StoreAdapter` interface
- `getId` - Optional custom ID generator (defaults to `crypto.randomUUID()`)

### Read Operations

#### `get(key: string): Promise<T | null>`

Get a document by ID. Returns `null` if not found or deleted.

```typescript
const todo = await store.get("todo-1");
```

#### `entries(): Promise<Array<[string, T]>>`

Get all non-deleted documents as `[id, document]` tuples.

```typescript
const allTodos = await store.entries();
for (const [id, todo] of allTodos) {
  console.log(id, todo);
}
```

### Sync Operations

#### `collection(): Promise<Collection>`

Get the complete store state for persistence or sync.

```typescript
const snapshot = await store.collection();
// snapshot = { "~docs": [...], "~eventstamp": "..." }
```

#### `merge(collection: Collection): Promise<void>`

Merge a collection from storage or another replica using field-level LWW.

```typescript
const remoteSnapshot = await fetchFromServer();
await store.merge(remoteSnapshot);
```

### Mutations

Each mutation operates on a single document - reading, merging via CRDT, and writing back only what's needed.

#### `add(value: T, options?: { withId?: string }): Promise<string>`

Add a document to the store.

```typescript
const id = await store.add({ text: "Buy milk", completed: false });
await store.add({ text: "Task 2" }, { withId: "custom-id" });
```

#### `update(key: string, value: DeepPartial<T>): Promise<void>`

Update a document with partial value (field-level merge).

```typescript
await store.update("todo-1", { completed: true });
```

Updates use CRDT field-level LWW - only specified fields are updated. If the document doesn't exist, it will be created.

#### `del(key: string): Promise<void>`

Soft-delete a document.

```typescript
await store.del("todo-1");
```

Deleted documents remain in storage for sync purposes but are excluded from queries and reads.

### Lifecycle

#### `init(): Promise<this>`

Initialize the store. Must be called before using the store.

```typescript
const store = await new StoreLite({ adapter }).init();
```

#### `dispose(): Promise<void>`

Clean up resources. Call when shutting down.

```typescript
await store.dispose();
```

## Storage Adapters

### Built-in: InMemoryAdapter

Simple in-memory storage for testing and development.

```typescript
import { InMemoryAdapter } from "@byearlybird/starling/adapter/memory";

const store = await new StoreLite({
  adapter: new InMemoryAdapter(),
}).init();
```

### Custom Adapters

Implement the `StoreAdapter` interface:

```typescript
import type { StoreAdapter } from "@byearlybird/starling/adapter";
import type { EncodedDocument } from "@byearlybird/starling";

class MyAdapter implements StoreAdapter<EncodedDocument> {
  async get(key: string): Promise<EncodedDocument | undefined> {
    // Your implementation
  }

  async set(key: string, value: EncodedDocument): Promise<void> {
    // Your implementation
  }

  async delete(key: string): Promise<boolean> {
    // Your implementation
  }

  async has(key: string): Promise<boolean> {
    // Your implementation
  }

  async entries(): Promise<Array<[string, EncodedDocument]>> {
    // Your implementation
  }

  async clear(): Promise<void> {
    // Your implementation
  }

  async size(): Promise<number> {
    // Your implementation
  }
}
```

### IndexedDB Adapter Example

```typescript
import type { StoreAdapter } from "@byearlybird/starling/adapter";
import type { EncodedDocument } from "@byearlybird/starling";

export class IndexedDBAdapter implements StoreAdapter<EncodedDocument> {
  #dbName: string;
  #storeName: string;
  #db: IDBDatabase | null = null;

  constructor(dbName: string, storeName = "documents") {
    this.#dbName = dbName;
    this.#storeName = storeName;
  }

  async #getDB(): Promise<IDBDatabase> {
    if (this.#db) return this.#db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.#dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.#db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.#storeName)) {
          db.createObjectStore(this.#storeName);
        }
      };
    });
  }

  async get(key: string): Promise<EncodedDocument | undefined> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readonly");
      const store = tx.objectStore(this.#storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async set(key: string, value: EncodedDocument): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      const store = tx.objectStore(this.#storeName);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(key: string): Promise<boolean> {
    const db = await this.#getDB();
    const exists = await this.has(key);
    if (!exists) return false;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      const store = tx.objectStore(this.#storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== undefined;
  }

  async entries(): Promise<Array<[string, EncodedDocument]>> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readonly");
      const store = tx.objectStore(this.#storeName);
      const request = store.openCursor();
      const results: Array<[string, EncodedDocument]> = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          results.push([cursor.key as string, cursor.value]);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  async clear(): Promise<void> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readwrite");
      const store = tx.objectStore(this.#storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async size(): Promise<number> {
    const db = await this.#getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.#storeName, "readonly");
      const store = tx.objectStore(this.#storeName);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
```

## Integration with TanStack Query

StoreLite pairs perfectly with TanStack Query for reactive querying and caching:

```typescript
import { StoreLite } from "@byearlybird/starling/lite";
import { InMemoryAdapter } from "@byearlybird/starling/adapter/memory";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const store = await new StoreLite<Todo>({
  adapter: new InMemoryAdapter(),
}).init();

// Query active todos
function useActiveTodos() {
  return useQuery({
    queryKey: ["todos", "active"],
    queryFn: async () => {
      const entries = await store.entries();
      return entries.filter(([_, todo]) => !todo.completed);
    },
  });
}

// Query all todos
function useTodos() {
  return useQuery({
    queryKey: ["todos"],
    queryFn: () => store.entries(),
  });
}

// Mutation: Add todo
function useAddTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (text: string) => {
      return store.add({ text, completed: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

// Mutation: Update todo
function useUpdateTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Todo> }) => {
      await store.update(id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

// Mutation: Delete todo
function useDeleteTodo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await store.del(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todos"] });
    },
  });
}

// Usage in component
function TodoList() {
  const { data: todos, isLoading } = useActiveTodos();
  const addTodo = useAddTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {todos?.map(([id, todo]) => (
        <div key={id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => updateTodo.mutate({ id, updates: { completed: !todo.completed } })}
          />
          <span>{todo.text}</span>
          <button onClick={() => deleteTodo.mutate(id)}>Delete</button>
        </div>
      ))}
      <button onClick={() => addTodo.mutate("New todo")}>Add Todo</button>
    </div>
  );
}
```

## Integration with MobX

```typescript
import { StoreLite } from "@byearlybird/starling/lite";
import { InMemoryAdapter } from "@byearlybird/starling/adapter/memory";
import { makeAutoObservable, runInAction } from "mobx";

class TodoStore {
  todos: Map<string, Todo> = new Map();
  store: StoreLite<Todo>;

  constructor(store: StoreLite<Todo>) {
    this.store = store;
    makeAutoObservable(this);
    this.hydrate();
  }

  async hydrate() {
    const entries = await this.store.entries();
    runInAction(() => {
      this.todos = new Map(entries);
    });
  }

  get activeTodos() {
    return Array.from(this.todos.entries()).filter(
      ([_, todo]) => !todo.completed
    );
  }

  async addTodo(text: string) {
    const id = await this.store.add({ text, completed: false });

    runInAction(() => {
      this.todos.set(id, { text, completed: false });
    });
  }

  async toggleTodo(id: string) {
    const todo = this.todos.get(id);
    if (!todo) return;

    await this.store.update(id, { completed: !todo.completed });

    runInAction(() => {
      this.todos.set(id, { ...todo, completed: !todo.completed });
    });
  }

  async deleteTodo(id: string) {
    await this.store.del(id);

    runInAction(() => {
      this.todos.delete(id);
    });
  }
}
```

## Sync Pattern

StoreLite supports the same sync pattern as Store:

```typescript
// Client A
const storeA = await new StoreLite({ adapter: adapterA }).init();
await storeA.add({ text: "Task from A" }, { withId: "task-1" });

// Client B
const storeB = await new StoreLite({ adapter: adapterB }).init();
await storeB.add({ text: "Task from B" }, { withId: "task-2" });

// Sync: A pulls from B
const collectionB = await storeB.collection();
await storeA.merge(collectionB);

// Now A has both tasks
const entries = await storeA.entries();
// entries = [["task-1", ...], ["task-2", ...]]
```

## Comparison with Store

| Feature | Store | StoreLite |
|---------|-------|-----------|
| **Bundle size** | ~4KB | ~2-2.5KB |
| **API** | Synchronous | Asynchronous |
| **Storage** | In-memory (sync) | Any adapter (async) |
| **Queries** | Built-in reactive | Bring your own |
| **Plugins** | Yes | No |
| **Mutations** | `add()`, `update()`, `del()`, `begin()` | `begin()` only |
| **Use case** | Simple apps | Large datasets, custom queries |

## Migration from Store

If you're migrating from Store to StoreLite:

### Before (Store)
```typescript
const store = await new Store<Todo>()
  .use(unstoragePlugin('todos', storage))
  .init();

const id = store.add({ text: 'Buy milk' });
store.update(id, { completed: true });

const active = store.query({ where: (t) => !t.completed });
```

### After (StoreLite + TanStack Query)
```typescript
const store = await new StoreLite<Todo>({
  adapter: new IndexedDBAdapter('todos')
}).init();

const id = await store.add({ text: 'Buy milk' });
await store.update(id, { completed: true });

const { data: active } = useQuery({
  queryKey: ['todos', 'active'],
  queryFn: async () => {
    const entries = await store.entries();
    return entries.filter(([_, t]) => !t.completed);
  }
});
```

## Best Practices

### 1. Use TanStack DB for Transactions

StoreLite operates on individual documents for efficiency. For multi-document atomic operations, use TanStack DB's transactional mutators:

```typescript
// TanStack DB handles batching automatically
const mutation = useMutation({
  mutationFn: async (todos: Array<Todo>) => {
    // These run atomically with automatic rollback
    const ids = await Promise.all(
      todos.map(todo => store.add(todo))
    );
    return ids;
  },
});
```

### 2. Use Query Libraries for Reactivity

Don't poll `store.entries()`. Use TanStack Query or similar:

```typescript
// ✅ Good - reactive, cached, invalidated on mutations
const { data } = useQuery({
  queryKey: ['todos'],
  queryFn: () => store.entries()
});

// ❌ Bad - manual polling
useEffect(() => {
  const interval = setInterval(async () => {
    setTodos(await store.entries());
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### 3. Persist Adapter State

For IndexedDB or other persistent adapters, the adapter handles persistence. For in-memory adapters, manually persist snapshots:

```typescript
// Save to localStorage periodically
setInterval(async () => {
  const snapshot = await store.collection();
  localStorage.setItem('todos', JSON.stringify(snapshot));
}, 5000);

// Load on init
const stored = localStorage.getItem('todos');
if (stored) {
  await store.merge(JSON.parse(stored));
}
```

### 4. Implement Optimistic Updates

Use your query library's optimistic update features:

```typescript
const updateTodo = useMutation({
  mutationFn: async ({ id, updates }) => {
    await store.update(id, updates);
  },
  onMutate: async ({ id, updates }) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos'] });

    // Snapshot previous value
    const previous = queryClient.getQueryData(['todos']);

    // Optimistically update
    queryClient.setQueryData(['todos'], (old) => {
      return old.map(([key, todo]) =>
        key === id ? [key, { ...todo, ...updates }] : [key, todo]
      );
    });

    return { previous };
  },
  onError: (err, vars, context) => {
    // Rollback on error
    queryClient.setQueryData(['todos'], context.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['todos'] });
  },
});
```

## Future Adapter Ideas

Community adapters could include:

- `@byearlybird/starling-adapter-indexeddb` - IndexedDB with better typing
- `@byearlybird/starling-adapter-sqlite` - SQLite via OPFS
- `@byearlybird/starling-adapter-postgres` - PGlite for local-first Postgres
- `@byearlybird/starling-adapter-cloudflare-d1` - Cloudflare D1 integration
- `@byearlybird/starling-adapter-redis` - Redis for server-side use

## See Also

- [Architecture](./architecture.md) - CRDT implementation details
- [Queries](./queries.md) - Built-in queries in Store
- [Unstorage Plugin](./plugins/unstorage.md) - Persistence for Store
