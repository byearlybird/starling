# Query System Usage

## Installation

The query system is available as a subpath export:

```typescript
import { createQuery } from "@byearlybird/starling-db/query";
```

## Single-Collection Queries

Reactive queries for a single collection:

```typescript
import { createDatabase } from "@byearlybird/starling-db";
import { createQuery } from "@byearlybird/starling-db/query";

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id }
  }
}).init();

// Create reactive query
const activeTodos = createQuery(db, "todos",
  (todo) => !todo.completed
);

// Read results
console.log(activeTodos.results());

// Subscribe to changes
const unsubscribe = activeTodos.onChange(() => {
  console.log("Active todos changed:", activeTodos.results());
});

// With map and sort
const todoTexts = createQuery(db, "todos",
  (todo) => !todo.completed,
  {
    map: (todo) => todo.text,
    sort: (a, b) => a.localeCompare(b)
  }
);

// Cleanup
activeTodos.dispose();
```

## Multi-Collection Queries

Query across multiple collections with automatic dependency tracking:

```typescript
const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id }
  }
}).init();

// Multi-collection query
const todosWithOwners = createQuery(db, (collections) => {
  const results = [];
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();

  // Build lookup map for efficiency
  const userMap = new Map(users.map(u => [u.id, u]));

  for (const todo of todos) {
    const owner = userMap.get(todo.ownerId);
    if (owner) {
      results.push({
        id: todo.id,
        text: todo.text,
        ownerName: owner.name,
        ownerEmail: owner.email
      });
    }
  }

  return results;
});

// Automatically reacts to changes in BOTH collections
todosWithOwners.onChange(() => {
  console.log("Results updated:", todosWithOwners.results());
});
```

## Read-Only Collection Accessors

Multi-collection queries receive read-only accessors that exclude mutation methods:

```typescript
// ✅ Available methods:
collections.todos.getAll()
collections.todos.get(id)
collections.todos.find(filter)

// ❌ NOT available (mutations happen outside queries):
collections.todos.add(item)      // Error
collections.todos.update(id, data) // Error
collections.todos.remove(id)     // Error
```

## Dependency Tracking

The query system automatically tracks which collections you access:

```typescript
// This query only subscribes to "todos" mutations
const simpleTodos = createQuery(db, (collections) => {
  return collections.todos.getAll(); // Only accesses todos
});

// This query subscribes to BOTH "todos" and "users" mutations
const enrichedTodos = createQuery(db, (collections) => {
  const todos = collections.todos.getAll(); // Accesses todos
  const users = collections.users.getAll(); // Accesses users
  return join(todos, users);
});
```

## Query Lifecycle

```typescript
const query = createQuery(db, "todos", (todo) => !todo.completed);

// Read results (computed on-demand)
const results = query.results();

// Subscribe to changes
const unsubscribe1 = query.onChange(callback1);
const unsubscribe2 = query.onChange(callback2);

// Unsubscribe individual listeners
unsubscribe1();

// Dispose query (cleans up all listeners and subscriptions)
query.dispose();

// After dispose, returns empty array
query.results(); // []
```

## One-Off Queries

For non-reactive one-off queries, call `.results()` immediately:

```typescript
// Get current results without reactivity
const currentResults = createQuery(db, (collections) => {
  return collections.todos.getAll();
}).results();

// Or just use collection methods directly
const todos = db.todos.getAll();
const users = db.users.getAll();
```

## Performance Tips

### Single-Collection Queries
- Uses incremental index updates
- O(1) per mutation
- Very efficient for filtering

### Multi-Collection Queries
- Recomputes entire result on any mutation
- Use Map lookups for joins (not nested loops)

```typescript
// ❌ Inefficient: O(n*m)
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  return todos.map(todo => ({
    ...todo,
    owner: users.find(u => u.id === todo.ownerId) // O(n) for each todo
  }));
});

// ✅ Efficient: O(n+m)
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  // Build lookup map once: O(m)
  const userMap = new Map(users.map(u => [u.id, u]));

  return todos.map(todo => ({
    ...todo,
    owner: userMap.get(todo.ownerId) // O(1) for each todo
  }));
});
```

## Type Safety

TypeScript fully infers types throughout:

```typescript
// Single-collection: type flows through
const texts = createQuery(db, "todos",
  (todo) => !todo.completed, // todo is Todo
  { map: (todo) => todo.text } // todo is Todo
);
texts.results(); // string[]

// Multi-collection: return type inferred
const joined = createQuery(db, (collections) => {
  return collections.todos.getAll().map(t => ({
    id: t.id,
    text: t.text
  }));
});
joined.results(); // Array<{ id: string; text: string }>
```
