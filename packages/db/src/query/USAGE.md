# Query System Usage

## Installation

The query system is available as a subpath export:

```typescript
import { createQuery } from "@byearlybird/starling-db/query";
```

## Basic Usage

All queries use the same simple API - a compute function that receives collection accessors:

```typescript
import { createDatabase } from "@byearlybird/starling-db";
import { createQuery } from "@byearlybird/starling-db/query";

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id }
  }
}).init();

// Create reactive query
const activeTodos = createQuery(db, (collections) => {
  return collections.todos.find(todo => !todo.completed);
});

// Read results
console.log(activeTodos.results());

// Subscribe to changes
const unsubscribe = activeTodos.onChange(() => {
  console.log("Active todos changed:", activeTodos.results());
});

// Cleanup
activeTodos.dispose();
```

## Map and Sort

Use standard JavaScript array methods:

```typescript
const todoTexts = createQuery(db, (collections) => {
  return collections.todos
    .find(todo => !todo.completed)
    .map(todo => todo.text)
    .sort((a, b) => a.localeCompare(b));
});

todoTexts.results(); // string[]
```

## Multi-Collection Queries

Query across multiple collections - dependency tracking is automatic:

```typescript
const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id }
  }
}).init();

const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();

  // Build lookup map for efficiency
  const userMap = new Map(users.map(u => [u.id, u]));

  return todos.map(todo => ({
    id: todo.id,
    text: todo.text,
    ownerName: userMap.get(todo.ownerId)?.name,
    ownerEmail: userMap.get(todo.ownerId)?.email
  }));
});

// Automatically reacts to changes in BOTH collections
todosWithOwners.onChange(() => {
  console.log("Results updated:", todosWithOwners.results());
});
```

## Read-Only Collection Accessors

The compute function receives read-only accessors (no mutations allowed):

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

The query automatically tracks which collections you access:

```typescript
// This query only subscribes to "todos" mutations
const simpleTodos = createQuery(db, (collections) => {
  return collections.todos.getAll();
});

// This query subscribes to BOTH "todos" and "users" mutations
const enrichedTodos = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();
  return join(todos, users);
});
```

## Query Lifecycle

```typescript
const query = createQuery(db, (collections) => {
  return collections.todos.find(todo => !todo.completed);
});

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
```

## Performance Tips

### Efficient Joins

Use Map lookups instead of nested loops:

```typescript
// ❌ Inefficient: O(n*m)
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  return todos.map(todo => ({
    ...todo,
    owner: users.find(u => u.id === todo.ownerId) // O(m) for each todo
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

### Recomputation Behavior

Queries recompute entirely when any accessed collection changes. For most use cases with reasonable data sizes, this performs well. If you need more control, optimize your compute function.

## Real-World Example

```typescript
const projectDashboard = createQuery(db, (collections) => {
  // Get active data
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.find(u => u.active);
  const projects = collections.projects.find(p => !p.archived);

  // Build efficient lookups
  const userMap = new Map(users.map(u => [u.id, u]));
  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Group todos by project
  const byProject = new Map();
  for (const todo of todos) {
    const projectId = todo.projectId;
    if (!byProject.has(projectId)) {
      byProject.set(projectId, []);
    }
    byProject.get(projectId).push({
      ...todo,
      ownerName: userMap.get(todo.ownerId)?.name
    });
  }

  // Build final result
  return Array.from(byProject.entries()).map(([projectId, todos]) => ({
    project: projectMap.get(projectId),
    todos,
    stats: {
      total: todos.length,
      highPriority: todos.filter(t => t.priority === 'high').length
    }
  }));
});
```

## Type Safety

TypeScript fully infers types throughout:

```typescript
// Return type automatically inferred
const query = createQuery(db, (collections) => {
  return collections.todos.find(t => !t.completed).map(t => ({
    id: t.id,
    text: t.text
  }));
});

// TypeScript knows the exact shape:
const results: Array<{ id: string; text: string }> = query.results();

// Autocomplete works:
results[0].text // ✅ string
results[0].completed // ❌ Error: Property doesn't exist
```
