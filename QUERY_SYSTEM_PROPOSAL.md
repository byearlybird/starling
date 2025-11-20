# Query System Design Proposal

## Executive Summary

This proposal extends the v1 database with a reactive query system that:
- ✅ Mirrors the existing `collection.find()` API
- ✅ Supports single-collection queries with incremental updates
- ✅ **Enables multi-collection queries via collection accessors**
- ✅ Provides automatic dependency tracking and reactivity
- ✅ Maintains full type safety

---

## Design Philosophy

### 1. **Consistency with `find()`**

The v1 branch already has a great API in `collection.find()`:

```typescript
collection.find(
  filter: (item: T) => boolean,
  opts?: {
    map?: (item: T) => U,
    sort?: (a: U, b: U) => number
  }
): U[]
```

Our query system extends this with **reactivity**, not new concepts.

### 2. **Two Modes: Simple and Advanced**

**Simple** - Single collection (most common case):
```typescript
createQuery(db, "todos", (todo) => !todo.completed)
```

**Advanced** - Multi-collection (power users):
```typescript
createQuery(db, (collections) => {
  // Access any collection, write custom join logic
})
```

### 3. **Automatic Dependency Tracking**

The system automatically discovers which collections your query accesses:
- Only subscribes to mutations on those collections
- No manual subscription management needed
- Prevents unnecessary recomputation

---

## API Design

### Single-Collection Query

```typescript
function createQuery<
  Schemas,
  K extends keyof Schemas,
  U = InferOutput<Schemas[K]>
>(
  db: Database<Schemas>,
  collectionKey: K,
  filter: (item: InferOutput<Schemas[K]>) => boolean,
  opts?: {
    map?: (item: InferOutput<Schemas[K]>) => U;
    sort?: (a: U, b: U) => number;
  }
): Query<U>
```

**Example:**
```typescript
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

### Multi-Collection Query

```typescript
function createQuery<Schemas, Result>(
  db: Database<Schemas>,
  compute: (collections: CollectionAccessors<Schemas>) => Result[]
): Query<Result>

type CollectionAccessors<Schemas> = {
  [K in keyof Schemas]: {
    getAll(): InferOutput<Schemas[K]>[];
    get(id: string): InferOutput<Schemas[K]> | null;
    find(filter: (item) => boolean): InferOutput<Schemas[K]>[];
  }
}
```

**Example:**
```typescript
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
todosWithOwners.onChange(() => updateUI(todosWithOwners.results()));
```

### Query Interface

```typescript
type Query<T> = {
  /** Get current results (computed on-demand) */
  results(): T[];

  /** Register a change listener. Returns unsubscribe function. */
  onChange(callback: () => void): () => void;

  /** Dispose this query and clean up listeners */
  dispose(): void;
};
```

---

## Implementation Strategy

### Single-Collection Query

**Incremental Index Maintenance:**
```
Maintains: Map<id, value>

On add: if filter(item) → add to map
On update:
  - if matches && !inMap → add
  - if !matches && inMap → remove
  - if matches && inMap → update
On remove: if inMap → remove

Only notify if map changed
```

**Performance:** O(1) for most mutations, O(n log n) for sorting (on-demand)

### Multi-Collection Query

**Dependency Tracking:**
```typescript
// Track which collections are accessed
const accessedCollections = new Set<keyof Schemas>();

// Wrap collection accessors
const accessors = {
  todos: {
    getAll() {
      accessedCollections.add("todos"); // ← Track access
      return db.todos.getAll();
    }
  }
};

// Run compute to discover dependencies
const results = compute(accessors);

// Subscribe only to accessed collections
for (const key of accessedCollections) {
  db[key].on("mutation", recompute);
}
```

**Recomputation:**
- Marks query as "dirty" on any mutation
- Recomputes entire result on next `results()` call
- Can be optimized with memoization/versioning

---

## Real-World Examples

### Dashboard with Statistics

```typescript
const projectDashboard = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const projects = collections.projects.find(p => !p.archived);

  return projects.map(project => {
    const projectTodos = todos.filter(t => t.projectId === project.id);
    const completed = projectTodos.filter(t => t.completed).length;

    return {
      projectId: project.id,
      projectName: project.name,
      totalTodos: projectTodos.length,
      completedTodos: completed,
      completionRate: projectTodos.length > 0
        ? (completed / projectTodos.length) * 100
        : 0
    };
  });
});
```

### Three-Way Join

```typescript
const enrichedTodos = createQuery(db, (collections) => {
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();
  const projects = collections.projects.getAll();

  const userMap = new Map(users.map(u => [u.id, u]));
  const projectMap = new Map(projects.map(p => [p.id, p]));

  return todos
    .map(todo => {
      const owner = userMap.get(todo.ownerId);
      const project = projectMap.get(todo.projectId);

      return owner && project ? {
        ...todo,
        ownerName: owner.name,
        ownerAvatar: owner.avatarUrl,
        projectName: project.name,
        projectColor: project.color
      } : null;
    })
    .filter(Boolean);
});
```

---

## Type Safety

TypeScript fully infers types throughout:

```typescript
// Single-collection: type flows through
const texts = createQuery(db, "todos",
  (todo) => !todo.completed,
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

// Autocomplete works everywhere
collections.todos.find(todo => todo.completed) // ✅
collections.todos.unknown() // ❌ Error
```

---

## Performance Characteristics

### Single-Collection
- **Space:** O(matching items)
- **Add/Update/Delete:** O(1) average
- **Results:** O(n log n) for sorted, O(n) for unsorted
- **Notification:** O(callbacks)

### Multi-Collection (Full Recompute)
- **Space:** O(result size)
- **Mutation:** O(1) to mark dirty
- **Results:** O(compute function) on first access after dirty
- **Notification:** O(callbacks)

### Optimization: Memoization
```typescript
// Cache by collection versions
const version = computeVersion(accessedCollections);
if (version === lastVersion) return cachedResults;
```

---

## Migration from Old Plugin

The old query plugin used `[id, value]` tuples:

```typescript
// Old plugin
const query = store.query({ where: (todo) => !todo.completed });
query.results(); // Array<[string, Todo]>

// New system (returns values, not tuples)
const query = createQuery(db, "todos", (todo) => !todo.completed);
query.results(); // Array<Todo>
```

To get IDs, use `map`:
```typescript
const query = createQuery(db, "todos",
  (todo) => !todo.completed,
  {
    map: (todo) => ({ id: getId(todo), ...todo })
  }
);
```

---

## Open Questions

### 1. Should queries auto-dispose with the database?

**Option A:** Explicit disposal only
```typescript
const query = createQuery(db, ...);
query.dispose(); // Must call manually
```

**Option B:** Track in database + auto-dispose
```typescript
const query = createQuery(db, ...);
await db.dispose(); // Also disposes all queries
```

**Recommendation:** Option B - track queries in `db._queries` set, auto-dispose on `db.dispose()`

### 2. Should we expose query metadata?

```typescript
query.metadata = {
  collectionDependencies: ["todos", "users"],
  resultCount: () => query.results().length
}
```

**Recommendation:** Defer until needed

### 3. Caching strategy for multi-collection queries?

**Option A:** Always recompute (simple)
**Option B:** Memoize by collection versions (optimized)
**Option C:** Incremental updates (complex)

**Recommendation:** Start with A, add B if performance is an issue

---

## Implementation Checklist

### Phase 1: Single-Collection MVP
- [x] Design API
- [ ] Implement `createQuery` for single collection
- [ ] Incremental index updates
- [ ] Test reactivity
- [ ] Test filtering, mapping, sorting
- [ ] Add to exports

### Phase 2: Multi-Collection
- [x] Design collection accessor API
- [ ] Implement dependency tracking
- [ ] Test multi-collection joins
- [ ] Test selective reactivity
- [ ] Performance benchmarks

### Phase 3: Polish
- [ ] Documentation
- [ ] Examples
- [ ] Integration with React/Solid hooks
- [ ] DevTools integration?

---

## Conclusion

This design:
- ✅ Matches the spirit of `collection.find()`
- ✅ Provides escape hatch for complex queries
- ✅ Maintains type safety throughout
- ✅ Enables powerful cross-collection queries
- ✅ Keeps implementation tractable

The multi-collection callback approach strikes a good balance between power and simplicity - it's flexible enough to handle any join logic while being simple to implement and reason about.

**Recommendation:** Implement Phase 1 + Phase 2 together. The overhead is minimal and the multi-collection capability is a killer feature that justifies the query system's existence beyond just "reactive find()".
