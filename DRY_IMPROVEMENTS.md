# DRY Improvements & db.find() Proposal

## Current Patterns

### Collection Handle Pattern (db.ts)
```typescript
function makeHandles<Schemas>(collections) {
  const handles = {} as { [K in keyof Schemas]: CollectionHandle<Schemas[K]> };

  for (const name of Object.keys(collections)) {
    handles[name] = {
      add(item) { return collections[name].add(item); },
      update(id, updates) { collections[name].update(id, updates); },
      remove(id) { collections[name].remove(id); },
      get(id, opts) { return collections[name].get(id, opts); },
      getAll(opts) { return collections[name].getAll(opts); },
      find(filter, opts) { return collections[name].find(filter, opts); },
      // ... other methods
    };
  }

  return handles;
}
```

**Pattern:**
- Plain objects with delegation
- No fancy wrappers or factories
- Simple, direct forwarding

### Our Collection Accessor Pattern (query/collection-accessor.ts)
```typescript
export function createCollectionAccessor<Schema>(
  collectionHandle,
  collectionKey,
  trackAccess
): CollectionAccessor<Schema> {
  return {
    getAll() {
      trackAccess(collectionKey);
      return collectionHandle.getAll();
    },
    get(id) {
      trackAccess(collectionKey);
      return collectionHandle.get(id);
    },
    find(filter) {
      trackAccess(collectionKey);
      return collectionHandle.find(filter);
    }
  };
}
```

**Pattern:**
- ✅ Same delegation style
- ✅ Added tracking hook
- ✅ Subset of methods (read-only)

---

## Proposed: db.find() Convenience Method

### Problem
Current multi-collection query syntax is verbose for simple cases:

```typescript
// Current: Verbose
const todosWithOwners = createQuery(db, (collections) => {
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();

  return todos.map(todo => {
    const owner = users.find(u => u.id === todo.ownerId);
    return { ...todo, ownerName: owner?.name };
  });
});
```

### Solution: Add `db.find()` method

```typescript
// Proposed: Simpler
const todosWithOwners = db.find((collections) => {
  const todos = collections.todos.find(t => !t.completed);
  const users = collections.users.getAll();

  return todos.map(todo => {
    const owner = users.find(u => u.id === todo.ownerId);
    return { ...todo, ownerName: owner?.name };
  });
});
```

**Benefits:**
- ✅ Shorter, more discoverable
- ✅ `db.find()` feels natural alongside `collection.find()`
- ✅ Non-reactive queries don't need `createQuery`
- ✅ Reactive queries still use `createQuery`

---

## Implementation Options

### Option 1: db.find() returns static results

```typescript
// In db.ts
export type Database<Schemas> = {
  [K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
  begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R;
  toDocuments(): { ... };
  on(event, handler): () => void;
  init(): Promise<void>;
  dispose(): Promise<void>;

  // NEW: Non-reactive find
  find<Result>(
    compute: (collections: CollectionAccessors<Schemas>) => Result[]
  ): Result[];
};

// Implementation
function createDatabase<Schemas>(config) {
  // ... existing code ...

  return {
    ...handles,
    begin() { ... },
    toDocuments() { ... },
    on() { ... },
    init() { ... },
    dispose() { ... },

    // NEW: Non-reactive find
    find<Result>(
      compute: (collections: CollectionAccessors<Schemas>) => Result[]
    ): Result[] {
      const accessors = createCollectionAccessors(
        db,
        Object.keys(collections) as (keyof Schemas)[],
        () => {} // No tracking needed for non-reactive
      );
      return compute(accessors);
    }
  };
}
```

**Usage:**
```typescript
// One-off query (no reactivity)
const results = db.find((collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();
  return join(todos, users);
});

// Reactive query (still use createQuery)
const query = createQuery(db, (collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();
  return join(todos, users);
});
query.onChange(() => updateUI());
```

---

### Option 2: db.find() creates reactive Query

```typescript
// In db.ts
export type Database<Schemas> = {
  // ... existing methods ...

  // NEW: Reactive find (alias for createQuery)
  find<Result>(
    compute: (collections: CollectionAccessors<Schemas>) => Result[]
  ): Query<Result>;
};

// Implementation
function createDatabase<Schemas>(config) {
  return {
    // ... existing methods ...

    find<Result>(
      compute: (collections: CollectionAccessors<Schemas>) => Result[]
    ): Query<Result> {
      return createQuery(db, compute);
    }
  };
}
```

**Usage:**
```typescript
// Always reactive
const query = db.find((collections) => {
  const todos = collections.todos.getAll();
  const users = collections.users.getAll();
  return join(todos, users);
});

query.onChange(() => updateUI());
query.dispose();
```

---

## Recommendation: Option 1 (Non-reactive db.find())

**Rationale:**
1. **Clear separation:**
   - `db.find()` - One-off queries
   - `createQuery()` - Reactive queries

2. **Matches collection API:**
   - `collection.find()` returns static results
   - `db.find()` should behave the same

3. **Simpler mental model:**
   - Methods on `db` are operations
   - `createQuery()` is a factory

4. **Less overhead:**
   - No query instance created
   - No subscription management
   - Faster for one-off queries

---

## Further DRY: Shared Accessor Factory

Both `db.find()` and `createQuery()` need collection accessors. Extract shared logic:

```typescript
// query/collection-accessor.ts

/**
 * Create collection accessors for database operations.
 *
 * @param db - Database instance
 * @param trackAccess - Optional callback to track which collections are accessed
 */
export function createAccessorsForDatabase<Schemas>(
  db: any,
  trackAccess?: (key: string) => void
): CollectionAccessors<Schemas> {
  const collectionKeys = Object.keys(db).filter(key => {
    return key !== "begin"
        && key !== "toDocuments"
        && key !== "on"
        && key !== "init"
        && key !== "dispose"
        && key !== "find"; // Exclude our new method
  }) as (keyof Schemas)[];

  return createCollectionAccessors(db, collectionKeys, trackAccess ?? (() => {}));
}
```

**Usage in db.find():**
```typescript
find<Result>(compute) {
  const accessors = createAccessorsForDatabase<Schemas>(this);
  return compute(accessors);
}
```

**Usage in createQuery():**
```typescript
function createMultiCollectionQuery<Schemas, Result>(db, compute) {
  const accessedCollections = new Set<keyof Schemas>();
  const trackAccess = (key: string) => accessedCollections.add(key);

  const accessors = createAccessorsForDatabase<Schemas>(db, trackAccess);
  // ... rest of implementation
}
```

---

## Summary of Changes

### 1. DRY Improvements ✅
- [x] Use simple delegation pattern (matches `createCollectionHandle`)
- [x] Extract `createAccessorsForDatabase()` for reuse
- [x] Document pattern consistency

### 2. Add db.find() (Proposed)
- [ ] Add `find()` method to Database type
- [ ] Implement non-reactive version
- [ ] Update documentation
- [ ] Add tests

### 3. Benefits
- ✅ Consistent patterns across codebase
- ✅ Less boilerplate for simple queries
- ✅ Clear distinction: `find()` vs `createQuery()`
- ✅ Better developer experience

---

## Example: Before & After

### Before
```typescript
// Simple one-off query
const results = createQuery(db, (collections) => {
  return collections.todos.getAll();
}).results();

// Reactive query
const query = createQuery(db, (collections) => {
  return collections.todos.getAll();
});
query.onChange(() => updateUI());
```

### After
```typescript
// Simple one-off query
const results = db.find((collections) => {
  return collections.todos.getAll();
});

// Reactive query
const query = createQuery(db, (collections) => {
  return collections.todos.getAll();
});
query.onChange(() => updateUI());
```

**Cleaner, more intuitive!**
