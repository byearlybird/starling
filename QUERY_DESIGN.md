# Query System Design Proposal

## Single-Collection Queries (Simple)

Mirrors the `find` API but reactive:

```typescript
import { createDatabase } from "@byearlybird/starling-db";
import { createQuery } from "@byearlybird/starling-db/query";

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id }
  }
}).init();

// Basic reactive query
const activeTodos = createQuery(db, "todos",
  (todo) => !todo.completed,
  {
    map: (todo) => todo.text,
    sort: (a, b) => a.localeCompare(b)
  }
);

activeTodos.results(); // string[]
activeTodos.onChange(() => console.log("Changed!"));
activeTodos.dispose();
```

---

## Multi-Collection Queries (Advanced)

### **Approach 1: Collection Accessors (Recommended)**

Provides a callback with type-safe collection accessors:

```typescript
const todosWithOwners = createQuery(db, (collections) => {
  const results = [];

  // Get all collections
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();

  // Manual join logic
  for (const todo of todos) {
    if (!todo.completed) {
      const owner = users.find(u => u.id === todo.ownerId);
      if (owner) {
        results.push({
          id: todo.id,
          text: todo.text,
          ownerName: owner.name,
          ownerEmail: owner.email
        });
      }
    }
  }

  return results;
});

// Results are computed on-demand
todosWithOwners.results(); // Array<{ id, text, ownerName, ownerEmail }>

// Reactively updates when EITHER collection changes
todosWithOwners.onChange(() => {
  console.log("Todos or users changed:", todosWithOwners.results());
});
```

**Type Signature:**
```typescript
function createQuery<Schemas, Result>(
  db: Database<Schemas>,
  compute: (collections: CollectionAccessors<Schemas>) => Result[]
): Query<Result>

type CollectionAccessors<Schemas> = {
  [K in keyof Schemas]: {
    getAll(): InferOutput<Schemas[K]>[];
    get(id: string): InferOutput<Schemas[K]> | null;
    find(filter: (item: InferOutput<Schemas[K]>) => boolean): InferOutput<Schemas[K]>[];
  }
}
```

**Pros:**
- Maximum flexibility - write any join logic you want
- Type-safe - collections are fully typed
- Familiar - looks like normal JavaScript
- Can handle complex scenarios (multiple joins, aggregations, etc.)

**Cons:**
- Re-computes entire result set on every change (performance concern)
- Manual join logic can be verbose
- No optimization for incremental updates

---

### **Approach 2: Declarative Joins (Optimized)**

Provides a declarative API that can be optimized:

```typescript
const todosWithOwners = createQuery(db, {
  from: "todos",
  filter: (todo) => !todo.completed,
  join: {
    owner: {
      collection: "users",
      on: (todo, user) => todo.ownerId === user.id,
      type: "left" as const  // "inner" | "left"
    }
  },
  map: ({ todo, owner }) => ({
    id: todo.id,
    text: todo.text,
    ownerName: owner?.name ?? "Unknown",
    ownerEmail: owner?.email
  }),
  sort: (a, b) => a.text.localeCompare(b.text)
});

// Multiple joins
const enrichedTodos = createQuery(db, {
  from: "todos",
  filter: (todo) => !todo.completed,
  join: {
    owner: {
      collection: "users",
      on: (todo, user) => todo.ownerId === user.id
    },
    assignee: {
      collection: "users",
      on: (todo, user) => todo.assigneeId === user.id
    },
    project: {
      collection: "projects",
      on: (todo, project) => todo.projectId === project.id
    }
  },
  map: ({ todo, owner, assignee, project }) => ({
    ...todo,
    ownerName: owner?.name,
    assigneeName: assignee?.name,
    projectName: project?.name
  })
});
```

**Type Signature:**
```typescript
function createQuery<
  Schemas,
  FromKey extends keyof Schemas,
  Joins extends JoinConfig<Schemas, FromKey>,
  Result
>(
  db: Database<Schemas>,
  config: {
    from: FromKey;
    filter?: (item: InferOutput<Schemas[FromKey]>) => boolean;
    join?: Joins;
    map?: (items: JoinedItems<Schemas, FromKey, Joins>) => Result;
    sort?: (a: Result, b: Result) => number;
  }
): Query<Result>

type JoinConfig<Schemas, FromKey> = {
  [alias: string]: {
    collection: keyof Schemas;
    on: (
      from: InferOutput<Schemas[FromKey]>,
      to: InferOutput<Schemas[any]>
    ) => boolean;
    type?: "inner" | "left";
  }
}

type JoinedItems<Schemas, FromKey, Joins> = {
  [K in keyof Schemas as K extends FromKey ? K : never]: InferOutput<Schemas[K]>
} & {
  [Alias in keyof Joins]: Joins[Alias]["type"] extends "left"
    ? InferOutput<Schemas[Joins[Alias]["collection"]]> | null
    : InferOutput<Schemas[Joins[Alias]["collection"]>>
}
```

**Pros:**
- Can optimize incremental updates (only re-join affected items)
- Declarative - less code, clearer intent
- Standard join semantics (inner/left)
- Type-safe nullability for left joins

**Cons:**
- More complex implementation
- Less flexible than manual joins
- Limited to predefined join types

---

## Hybrid Approach: Best of Both Worlds

Support both APIs with function overloading:

```typescript
// Simple single-collection
createQuery(db, "todos", (todo) => !todo.completed)

// Advanced multi-collection (callback)
createQuery(db, (collections) => {
  // Custom logic
})

// Declarative multi-collection (optimized)
createQuery(db, {
  from: "todos",
  join: { ... },
  map: ({ todo, owner }) => ...
})
```

**Type Signature:**
```typescript
function createQuery<Schemas, K extends keyof Schemas, U>(
  db: Database<Schemas>,
  collectionKey: K,
  filter: (item: InferOutput<Schemas[K]>) => boolean,
  opts?: { map?, sort? }
): Query<U>

function createQuery<Schemas, Result>(
  db: Database<Schemas>,
  compute: (collections: CollectionAccessors<Schemas>) => Result[]
): Query<Result>

function createQuery<Schemas, FromKey, Joins, Result>(
  db: Database<Schemas>,
  config: { from, filter?, join?, map?, sort? }
): Query<Result>
```

---

## Reactivity Handling

### Single-Collection
Only watches the specified collection:

```typescript
createQuery(db, "todos", ...)
// ✅ Watches: todos mutations
```

### Multi-Collection (Callback)
Watches ALL collections accessed in the callback:

```typescript
createQuery(db, (collections) => {
  const todos = collections.todos.getAll();  // ← Track this
  const users = collections.users.getAll();  // ← Track this
  // ...
})
// ✅ Watches: todos + users mutations
```

**Implementation:** Track which collection accessors are called during initial execution, subscribe to those collections only.

### Multi-Collection (Declarative)
Only watches collections in the join config:

```typescript
createQuery(db, {
  from: "todos",
  join: { owner: { collection: "users", ... } }
})
// ✅ Watches: todos + users mutations
```

---

## Performance Considerations

### Incremental Updates (Single-Collection)
Maintains an index of matching items:

```typescript
// On mutation:
if (matches && !inIndex) → add to index
if (!matches && inIndex) → remove from index
if (matches && inIndex) → update in index
```

### Full Recompute (Multi-Collection Callback)
Re-runs the entire compute function:

```typescript
// On any watched collection mutation:
const newResults = compute(collections);
if (changed(newResults, oldResults)) {
  notify();
}
```

**Optimization:** Memoize by collection versions
```typescript
const version = computeVersion(collections);
if (version === lastVersion) return cachedResults;
```

### Smart Incremental (Multi-Collection Declarative)
Only re-join affected items:

```typescript
// If todos.add(todo):
//   - Check filter(todo)
//   - Find matching joins
//   - Add to result index

// If users.update(userId):
//   - Find todos that joined with userId
//   - Re-join those specific todos
//   - Update result index
```

---

## Implementation Phases

### Phase 1: Single-Collection (MVP)
- Matches `find` API
- Incremental index updates
- Basic reactivity

```typescript
createQuery(db, "todos", filter, { map, sort })
```

### Phase 2: Multi-Collection Callback
- Collection accessors
- Dependency tracking
- Full recompute on changes

```typescript
createQuery(db, (collections) => { ... })
```

### Phase 3: Declarative Joins (Optional)
- Join config parsing
- Incremental join updates
- Left/inner join support

```typescript
createQuery(db, { from, join, map })
```

---

## Recommendation

**Start with Phase 1 + Phase 2:**

1. **Single-collection** covers 80% of use cases with great performance
2. **Multi-collection callback** provides escape hatch for complex queries
3. **Defer declarative joins** until there's proven need

This gives maximum flexibility while keeping implementation tractable.

---

## Example: Real-World Multi-Collection Query

```typescript
type Todo = { id: string; text: string; completed: boolean; ownerId: string; projectId: string };
type User = { id: string; name: string; email: string; active: boolean };
type Project = { id: string; name: string; archived: boolean };

const db = await createDatabase({
  schema: {
    todos: { schema: todoSchema, getId: (t) => t.id },
    users: { schema: userSchema, getId: (u) => u.id },
    projects: { schema: projectSchema, getId: (p) => p.id }
  }
}).init();

// Multi-collection query with callback accessors
const activeTodosDashboard = createQuery(db, (collections) => {
  const results = [];

  // Get active data
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.find(u => u.active);
  const projects = collections.projects.find(p => !p.archived);

  // Build lookup maps for efficiency
  const userMap = new Map(users.map(u => [u.id, u]));
  const projectMap = new Map(projects.map(p => [p.id, p]));

  // Enrich todos
  for (const todo of todos) {
    const owner = userMap.get(todo.ownerId);
    const project = projectMap.get(todo.projectId);

    if (owner && project) {
      results.push({
        id: todo.id,
        text: todo.text,
        ownerName: owner.name,
        ownerEmail: owner.email,
        projectName: project.name
      });
    }
  }

  // Sort by project, then text
  results.sort((a, b) => {
    const projectCmp = a.projectName.localeCompare(b.projectName);
    return projectCmp !== 0 ? projectCmp : a.text.localeCompare(b.text);
  });

  return results;
});

// Use it
console.log(activeTodosDashboard.results());

// Reacts to changes in ANY of the three collections
activeTodosDashboard.onChange(() => {
  console.log("Dashboard updated:", activeTodosDashboard.results());
});

// Cleanup
activeTodosDashboard.dispose();
```

---

## Type Safety Example

```typescript
// TypeScript infers result type based on callback return
const query = createQuery(db, (collections) => {
  return collections.todos.find(t => !t.completed).map(t => ({
    id: t.id,
    text: t.text.toUpperCase()
  }));
});

// TypeScript knows the result type:
const results: Array<{ id: string; text: string }> = query.results();

// Autocomplete works:
results[0].text // ✅ string
results[0].completed // ❌ Error: Property 'completed' does not exist
```
