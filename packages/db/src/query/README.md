# Query System Architecture

This query system follows **Functional Core, Imperative Shell** design principles.

## Structure

```
query/
├── core.ts                    # Functional core (pure functions)
├── types.ts                   # Shared types
├── collection-accessor.ts     # Read-only collection wrappers
├── single-collection-query.ts # Single-collection query factory
├── multi-collection-query.ts  # Multi-collection query factory
└── index.ts                   # Public API (overloaded createQuery)
```

## Functional Core (core.ts)

All query operations are implemented as **pure functions**:

- `filterItems()` - Filter items by predicate
- `mapItems()` - Map items to new values
- `sortItems()` - Sort items by comparator
- `buildIndex()` - Build index from items
- `applyAdds()` - Apply added items to index
- `applyUpdates()` - Apply updated items to index
- `applyRemovals()` - Apply removed items to index
- `indexToArray()` - Convert index to array
- `indexToSortedArray()` - Convert index to sorted array

**Characteristics:**
- No side effects
- Immutable inputs/outputs (returns new Map instances)
- Easily testable
- Composable

## Imperative Shell

### Single-Collection Queries (single-collection-query.ts)

**Factory function:** `createSingleCollectionQuery()`

**Strategy:** Incremental index updates

1. Hydrates initial index from collection data
2. Subscribes to collection mutation events
3. Applies mutations using functional core
4. Notifies listeners when index changes
5. Computes results on-demand (with optional sorting)

**Performance:** O(1) per mutation, O(n log n) for sorted results

### Multi-Collection Queries (multi-collection-query.ts)

**Factory function:** `createMultiCollectionQuery()`

**Strategy:** Dependency tracking + full recompute

1. Creates read-only collection accessors
2. Runs compute function to discover dependencies
3. Subscribes only to accessed collections
4. Marks query as dirty on any mutation
5. Recomputes results on next `results()` call

**Performance:** O(compute function) per recompute

## Collection Accessors (collection-accessor.ts)

Provides **read-only** access to collections:

```typescript
type CollectionAccessor<T> = {
  getAll(): T[];
  get(id: string): T | null;
  find(filter: (item: T) => boolean): T[];
  // ❌ NO mutation methods (add, update, remove, merge)
};
```

Tracks which collections are accessed during query computation.

## Type Flow

```typescript
// User creates query
createQuery(db, "todos", (todo) => !todo.completed)
              ↓
// Resolves to single-collection factory
createSingleCollectionQuery(collection, filter, options)
              ↓
// Returns Query instance
{ results(), onChange(), dispose() }
```

## Principles Applied

### 1. Functional Core
- Pure functions handle all data transformations
- Index updates return new Maps (immutable)
- No global state in core logic

### 2. Imperative Shell
- Factory functions manage subscriptions
- Mutable state limited to query instances
- Side effects isolated to event handlers

### 3. Dependency Injection
- Factories receive dependencies as parameters
- No hard-coded imports of database internals
- Easy to test in isolation

### 4. Single Responsibility
- `core.ts` - Data transformations
- `collection-accessor.ts` - Access control
- `single-collection-query.ts` - Single-collection reactivity
- `multi-collection-query.ts` - Multi-collection reactivity
- `index.ts` - Public API routing

## Testing Strategy

### Functional Core Tests (core.test.ts)
- Test pure functions in isolation
- No mocking required
- Fast and deterministic

### Integration Tests (index.test.ts)
- Test full query lifecycle
- Use real database instances
- Verify reactivity and subscriptions

## Example: Single-Collection Flow

```typescript
// 1. User creates query
const query = createQuery(db, "todos", (todo) => !todo.completed);

// 2. Factory hydrates index (functional core)
const index = buildIndex(items, filter, map);

// 3. Factory subscribes to mutations (imperative shell)
collection.on("mutation", (event) => {
  // 4. Apply mutations (functional core)
  const { index: newIndex, changed } = applyAdds(index, event.added, filter);

  // 5. Notify if changed (imperative shell)
  if (changed) notifyListeners();
});

// 6. User reads results (functional core)
query.results(); // indexToSortedArray(index, sort)
```

## Example: Multi-Collection Flow

```typescript
// 1. User creates query
const query = createQuery(db, (collections) => {
  const todos = collections.todos.getAll(); // ← Tracked
  const users = collections.users.getAll(); // ← Tracked
  return join(todos, users);
});

// 2. Factory discovers dependencies
const accessed = ["todos", "users"];

// 3. Factory subscribes to accessed collections
for (const key of accessed) {
  db[key].on("mutation", markDirty);
}

// 4. User reads results (functional core)
query.results(); // Recomputes if dirty
```

## Trade-offs

### Single-Collection
**Pros:**
- Incremental updates (efficient)
- Predictable performance

**Cons:**
- Limited to one collection
- More complex implementation

### Multi-Collection
**Pros:**
- Maximum flexibility
- Simple to understand
- Supports any join logic

**Cons:**
- Full recompute on changes
- Performance depends on compute function
- No optimization for partial updates

## Future Optimizations

### Memoization
Cache results by collection versions:
```typescript
const version = computeVersion(accessedCollections);
if (version === lastVersion) return cachedResults;
```

### Incremental Joins
Track join keys and only re-join affected items:
```typescript
// On users.update(userId):
//   - Find todos with ownerId === userId
//   - Re-join only those specific todos
//   - Update result index incrementally
```

### Query Planning
Analyze compute function and optimize execution:
- Reorder joins for efficiency
- Build indexes for frequently-accessed fields
- Parallelize independent operations
