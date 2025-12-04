# Lazy Loading Implementation Plan

**Status:** Proposed
**Created:** 2025-12-04
**Goal:** Transition Starling from in-memory storage to lazy-loaded IndexedDB-backed collections

---

## Overview

Currently, Starling loads all collection data into memory on startup and persists to IndexedDB via a plugin. This plan outlines transitioning to a lazy-loading architecture where:

- Data is stored directly in IndexedDB (one resource per key)
- Resources are read from IndexedDB on demand
- Merge operations only touch resources that changed (partial merge)
- Transactions buffer operations and commit atomically to IndexedDB

**Key insight:** Last-Write-Wins CRDTs support partial merges - we only need to process resources present in the remote document, not the entire local state.

---

## Goals

### Primary Goals
- ✅ Reduce memory footprint (no full in-memory Map)
- ✅ Instant startup (no upfront data loading)
- ✅ Efficient incremental sync (partial merge)
- ✅ Leverage IDB transactions for atomicity
- ✅ Preserve Starling's transaction API shape

### Non-Goals
- ❌ Optimize query performance (accept slower cursor-based scanning)
- ❌ Add conflict detection across tabs (keep implementation simple)
- ❌ Support synchronous operations (everything becomes async)
- ❌ Add IDB indexes (can be added later if needed)

---

## Architecture Changes

### Current Architecture

```
┌─────────────────────────────────────┐
│ Database                            │
│  ├─ tasks: Map<id, ResourceObject>  │ ← In memory
│  └─ users: Map<id, ResourceObject>  │ ← In memory
└─────────────────────────────────────┘
           ↓ (on mutation)
┌─────────────────────────────────────┐
│ IDB Plugin                          │
│  Saves entire JsonDocument          │
└─────────────────────────────────────┘
```

### New Architecture

```
┌─────────────────────────────────────┐
│ Database                            │
│  ├─ tasks: IDBCollection            │ ← Lazy reads from IDB
│  └─ users: IDBCollection            │ ← Lazy reads from IDB
└─────────────────────────────────────┘
           ↓ (direct access)
┌─────────────────────────────────────┐
│ IndexedDB                           │
│  Object Store: "tasks"              │
│    ├─ "task-1" → ResourceObject     │
│    ├─ "task-2" → ResourceObject     │
│    └─ "task-3" → ResourceObject     │
└─────────────────────────────────────┘
```

### IndexedDB Structure

**Before (current):**
```
Object Store: "tasks"
└─ Key: "document" → Full JsonDocument with all tasks
```

**After (lazy loading):**
```
Object Store: "tasks" (keyPath: "id")
├─ Key: "task-1" → ResourceObject
├─ Key: "task-2" → ResourceObject
└─ Key: "task-3" → ResourceObject

Object Store: "_meta"
└─ Key: "clock" → { latest: "2025-01-15T10:00:00.000Z|0001|abc123" }
```

---

## Implementation Plan

### Phase 1: Core Collection Refactor (Week 1)

**Goal:** Replace in-memory Map with IDB-backed storage

#### Step 1.1: Create IDBCollection Base (2 days)

**File:** `packages/starling/src/database/idb-collection.ts`

```typescript
export class IDBCollection<T extends AnyObjectSchema> {
  constructor(
    private idb: IDBDatabase,
    private storeName: string,
    private schema: T,
    private getId: (item: InferData<T>) => string,
    private getEventstamp: () => string
  ) {}

  // Implement basic CRUD operations
  async get(id: string): Promise<InferData<T> | null>
  async getAll(): Promise<InferData<T>[]>
  async find(filter: (item: InferData<T>) => boolean): Promise<InferData<T>[]>
  async add(item: StandardSchemaV1.InferInput<T>): Promise<InferData<T>>
  async update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>): Promise<void>
  async remove(id: string): Promise<void>
  async merge(document: JsonDocument<InferData<T>>): Promise<void>
  async toDocument(): Promise<JsonDocument<InferData<T>>>
}
```

**Implementation details:**
- `get()`: Direct IDB read with `readonly` transaction
- `getAll()`: IDB cursor scan, filtering out deleted resources
- `find()`: IDB cursor with predicate evaluation
- `add()`: IDB write with `readwrite` transaction
- `update()`: Read → merge → write in single IDB transaction
- `remove()`: Soft delete (set `deletedAt` eventstamp)
- `merge()`: Partial merge - only process resources in remote document
- `toDocument()`: Cursor scan to build full JsonDocument

**Key pattern:**
```typescript
async get(id: string): Promise<T | null> {
  const txn = this.idb.transaction([this.storeName], 'readonly');
  const store = txn.objectStore(this.storeName);
  const resource = await store.get(id);

  if (!resource || resource.meta.deletedAt) return null;
  return resource.attributes;
}
```

**Tests:**
- Create `idb-collection.test.ts` with comprehensive tests
- Test CRUD operations
- Test soft deletion
- Test cursor-based scanning
- Test merge behavior

---

#### Step 1.2: Implement Partial Merge (1 day)

**Key insight:** Only touch resources in the remote document

```typescript
async merge(remoteDoc: JsonDocument<T>): Promise<void> {
  const txn = this.idb.transaction([this.storeName], 'readwrite');
  const store = txn.objectStore(this.storeName);

  for (const remoteResource of remoteDoc.data) {
    const local = await store.get(remoteResource.id);

    const merged = local
      ? mergeResources(local, remoteResource)
      : remoteResource;

    await store.put(merged);
  }

  // Forward clock
  this.clock.forward(remoteDoc.meta.latest);

  // Transaction auto-commits
}
```

**Tests:**
- Test merging new resources (add)
- Test merging existing resources (update)
- Test merge doesn't affect resources not in remote doc
- Test clock forwarding
- Test transaction atomicity (all-or-nothing)

---

#### Step 1.3: Update Database Factory (1 day)

**File:** `packages/starling/src/database/db.ts`

Changes:
1. Initialize IDBDatabase connection in `createDatabase()`
2. Replace `createCollection()` with `createIDBCollection()`
3. Make database initialization async (open IDB connection)
4. Store IDB reference in database instance

```typescript
export async function createDatabase<Schemas extends SchemasMap>(
  config: DbConfig<Schemas>,
): Promise<Database<Schemas>> {
  const { name, schema, version = 1 } = config;

  // Open IndexedDB connection
  const idb = await openIndexedDB(name, version, Object.keys(schema));

  const clock = createClock();
  const getEventstamp = () => clock.now();

  // Create IDB-backed collections
  const collections = makeIDBCollections(idb, schema, getEventstamp);

  // ... rest of database setup
}
```

**Helper function:**
```typescript
async function openIndexedDB(
  dbName: string,
  version: number,
  collectionNames: string[]
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store per collection
      for (const name of collectionNames) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }

      // Meta store for clock
      if (!db.objectStoreNames.contains('_meta')) {
        db.createObjectStore('_meta');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

**Breaking change:** `createDatabase()` becomes async

```typescript
// Before:
const db = createDatabase({ name: "my-app", schema });

// After:
const db = await createDatabase({ name: "my-app", schema });
```

---

### Phase 2: Transaction Refactor (Week 1)

**Goal:** Make transactions work with lazy-loaded collections

#### Step 2.1: Async Transaction API (2 days)

**File:** `packages/starling/src/database/transaction.ts`

Rewrite `executeTransaction` to:
1. Buffer reads in memory (read cache)
2. Buffer writes in memory (write operations queue)
3. Execute callback with lazy-loading proxies
4. Commit all writes in single IDB transaction

```typescript
export async function executeTransaction<Schemas extends SchemasMap, R>(
  idb: IDBDatabase,
  configs: CollectionConfigMap<Schemas>,
  getEventstamp: () => string,
  callback: (tx: TransactionContext<Schemas>) => Promise<R>,
): Promise<R> {
  const readCache = new Map<string, Map<string, ResourceObject>>();
  const writeOps: WriteOperation[] = [];

  // Build transaction context with lazy-loading proxies
  const txHandles = {} as TransactionCollectionHandles<Schemas>;

  for (const name of Object.keys(configs)) {
    txHandles[name] = createLazyTransactionHandle(
      name,
      idb,
      configs[name],
      getEventstamp,
      readCache,
      writeOps
    );
  }

  // Execute user callback
  const result = await callback(txHandles as TransactionContext<Schemas>);

  // Commit all writes atomically
  const collections = [...new Set(writeOps.map(op => op.collection))];
  const commitTxn = idb.transaction(collections, 'readwrite');

  for (const op of writeOps) {
    await executeWriteOp(commitTxn, op, readCache, getEventstamp);
  }

  // Auto-commits when transaction completes
  return result;
}
```

**Key insight:** Keep the callback-based API, just make it async

```typescript
// User API stays similar:
await db.begin(async (tx) => {
  const task = await tx.tasks.get('task-1');  // ← Now async
  tx.tasks.update('task-1', { completed: !task.completed });
  // Auto-commits at end
});
```

**Tests:**
- Test transaction commits all writes atomically
- Test transaction rollback on error
- Test cross-collection transactions
- Test read-your-writes within transaction
- Test lazy loading during transaction

---

#### Step 2.2: Remove Copy-on-Write Logic (1 day)

Current transactions clone the entire collection Map. With lazy loading:
- No Map to clone
- Reads are cached in memory during transaction
- Writes are buffered and applied in IDB transaction at end

Remove:
- `CollectionInternals.data()` (no longer needed)
- `CollectionInternals.replaceData()` (no longer needed)
- Collection cloning logic

**Simplification:** Transaction isolation is now implicit in the read cache + write buffer pattern.

---

### Phase 3: Remove IDB Plugin (Week 2)

**Goal:** IDB is now the primary storage, not a plugin

#### Step 3.1: Remove IDB Plugin (1 day)

**File:** `packages/starling/src/plugins/idb/index.ts`

This file becomes obsolete because:
- IDB is now integral to collection storage
- No separate persistence layer needed
- No need to serialize/deserialize full documents

**Migration:**
- Mark `idbPlugin()` as deprecated
- Users just call `createDatabase()` - IDB is automatic
- Document breaking change in migration guide

**Before:**
```typescript
const db = await createDatabase({ name: "my-app", schema })
  .use(idbPlugin())
  .init();
```

**After:**
```typescript
const db = await createDatabase({ name: "my-app", schema });
```

---

#### Step 3.2: Update Database Lifecycle (1 day)

**Changes:**
- Remove `.use()` and `.init()` methods (no plugin system needed)
- `createDatabase()` returns ready-to-use database
- Add `.dispose()` method to close IDB connection

```typescript
export async function createDatabase<Schemas extends SchemasMap>(
  config: DbConfig<Schemas>,
): Promise<Database<Schemas>> {
  const idb = await openIndexedDB(config.name, config.version, ...);
  const clock = await loadClock(idb);  // Load saved clock from IDB

  // ... create collections, etc.

  return {
    // ... collection handles

    async dispose() {
      // Save clock state
      await saveClock(idb, clock.latest());

      // Close IDB connection
      idb.close();
    }
  };
}
```

---

### Phase 4: Query Refactor (Week 2)

**Goal:** Update reactive queries to work with lazy collections

#### Step 4.1: Update Query Execution (2 days)

**File:** `packages/starling/src/database/query.ts`

Changes:
- Make `executeQuery()` async
- Query callbacks receive async collection handles
- Re-execution happens on mutation events (same as now)

```typescript
export function executeQuery<Schemas extends SchemasMap, R>(
  db: Database<Schemas>,
  callback: (ctx: QueryContext<Schemas>) => Promise<R>,  // ← Now async
): QueryHandle<R> {
  let currentResult: R;

  const runQuery = async (): Promise<R> => {
    const handles = createTrackingHandles(db);
    return await callback(handles);  // ← Await result
  };

  // Initial execution (async)
  runQuery().then(result => {
    currentResult = result;
  });

  // Re-run on mutations
  db.on('mutation', async (event) => {
    if (accessedCollections.has(event.collection)) {
      currentResult = await runQuery();
      // Notify subscribers
    }
  });

  return { /* query handle */ };
}
```

**User impact:**
```typescript
// Before:
const completedTasks = db.query(q =>
  q.tasks.find(task => task.completed)
);

// After:
const completedTasks = db.query(async q =>
  await q.tasks.find(task => task.completed)
);
```

**Tests:**
- Test query execution with async collections
- Test query re-execution on mutations
- Test query disposal

---

### Phase 5: Event System Updates (Week 2)

**Goal:** Ensure mutation events work with IDB-backed collections

#### Step 5.1: Update Event Emission (1 day)

**Challenges:**
- Mutations now happen in IDB transactions (async)
- Events should fire after IDB commit (not before)
- Need to track what changed for event payload

**Solution:**
```typescript
async update(id: string, updates: Partial<T>): Promise<void> {
  const txn = this.idb.transaction([this.storeName], 'readwrite');
  const store = txn.objectStore(this.storeName);

  const before = await store.get(id);
  const merged = mergeResources(before, makeResource(...));

  await store.put(merged);

  // Wait for transaction to complete
  await new Promise((resolve, reject) => {
    txn.oncomplete = resolve;
    txn.onerror = reject;
  });

  // Emit event AFTER successful commit
  this.emit('mutation', {
    updated: [{ id, before: before.attributes, after: merged.attributes }]
  });
}
```

---

### Phase 6: HTTP Plugin Updates (Week 3)

**Goal:** Update HTTP sync plugin to work with lazy collections

#### Step 6.1: Update HTTP Plugin (2 days)

**File:** `packages/starling/src/plugins/http/index.ts`

Changes:
- Make push/pull operations async (already are)
- `collection.merge()` is now async - await it
- `collection.toDocument()` is now async - await it

Minimal changes needed since HTTP operations are already async.

**Test:**
- Test pull syncs with partial merges
- Test push sends correct documents
- Test polling continues to work

---

### Phase 7: Migration & Compatibility (Week 3)

**Goal:** Provide migration path and maintain compatibility where possible

#### Step 7.1: Data Migration Utility (2 days)

Create migration script to convert old IDB structure to new structure:

**File:** `packages/starling/src/migrations/migrate-to-lazy-loading.ts`

```typescript
export async function migrateToLazyLoading(dbName: string): Promise<void> {
  // Open old database
  const oldDb = await indexedDB.open(dbName, currentVersion);

  // For each collection:
  for (const collectionName of oldDb.objectStoreNames) {
    const txn = oldDb.transaction([collectionName], 'readonly');
    const store = txn.objectStore(collectionName);

    // Read old document
    const oldDoc = await store.get('document');

    if (oldDoc && oldDoc.data) {
      // Close old DB
      oldDb.close();

      // Open new DB with higher version
      const newDb = await indexedDB.open(dbName, currentVersion + 1);

      // Migrate: write each resource individually
      const newTxn = newDb.transaction([collectionName], 'readwrite');
      const newStore = newTxn.objectStore(collectionName);

      for (const resource of oldDoc.data) {
        await newStore.put(resource);  // Uses keyPath: 'id'
      }

      // Delete old document key
      await newStore.delete('document');
    }
  }
}
```

**Usage:**
```typescript
// Run migration before creating database
await migrateToLazyLoading('my-app');

const db = await createDatabase({ name: 'my-app', schema });
```

---

#### Step 7.2: Update Documentation (2 days)

**Files to update:**
- `README.md`: Update API examples with `async`/`await`
- `docs/architecture.md`: Document new IDB-native architecture
- `CONTRIBUTING.md`: Update testing guidelines
- `CHANGELOG.md`: Document breaking changes

**Migration guide:**
- Document all breaking changes
- Provide before/after code examples
- Explain migration utility usage

---

### Phase 8: Testing & Performance (Week 4)

#### Step 8.1: Update Test Suite (3 days)

**Changes:**
- Make all collection tests async
- Update transaction tests for async API
- Update query tests for async execution
- Add IDB-specific tests (cursor behavior, etc.)

**Test coverage:**
- Unit tests for IDBCollection
- Integration tests for transactions
- E2E tests for full database lifecycle
- Performance benchmarks

---

#### Step 8.2: Performance Testing (2 days)

**Benchmark scenarios:**
1. Startup time (should be near-instant)
2. Single resource read latency (expect 1-5ms)
3. Cursor scan performance (1000 items)
4. Merge performance (100 resources)
5. Transaction commit time
6. Cross-tab sync latency

**Acceptance criteria:**
- Startup < 10ms
- Single read < 5ms (cached < 0.1ms)
- Merge (100 items) < 200ms
- Transaction commit < 50ms

---

## Breaking Changes

### API Changes

| Operation | Before | After |
|-----------|--------|-------|
| Create DB | `createDatabase(config)` | `await createDatabase(config)` |
| Plugin | `.use(idbPlugin()).init()` | Not needed (IDB is built-in) |
| Transaction | `db.begin((tx) => {...})` | `await db.begin(async (tx) => {...})` |
| Get | `tx.tasks.get(id)` | `await tx.tasks.get(id)` |
| GetAll | `tx.tasks.getAll()` | `await tx.tasks.getAll()` |
| Find | `tx.tasks.find(filter)` | `await tx.tasks.find(filter)` |
| Query | `db.query(q => ...)` | `db.query(async q => await ...)` |
| ToDocument | `db.tasks.toDocument()` | `await db.tasks.toDocument()` |

### Behavioral Changes

1. **Startup:** Instant (no data loading)
2. **Memory:** Minimal baseline (resources loaded on demand)
3. **Latency:** Every read has ~1-5ms IDB overhead (first access)
4. **Scanning:** Slower than in-memory (cursor-based)

### Migration Required

1. Add `await` to `createDatabase()`
2. Add `async` to transaction callbacks
3. Add `await` to all collection reads
4. Add `await` to query callbacks
5. Remove `.use(idbPlugin()).init()` calls
6. Run data migration utility for existing users

---

## Risks & Mitigations

### Risk 1: Performance Regression on Queries

**Risk:** Cursor-based `find()` is slower than in-memory iteration

**Mitigation:**
- Accept this as acceptable tradeoff (correctness > speed)
- Document performance characteristics
- Future: Add IDB indexes for common queries (follow-up work)

---

### Risk 2: Breaking Changes Impact

**Risk:** Async API change affects all users

**Mitigation:**
- Provide detailed migration guide
- Create automated migration tool
- Version bump to 2.0.0 (signal major change)
- Maintain 1.x branch for 6 months with bug fixes

---

### Risk 3: IDB Browser Compatibility

**Risk:** IndexedDB behavior varies across browsers

**Mitigation:**
- Test on all major browsers (Chrome, Firefox, Safari, Edge)
- Use well-established IDB patterns (no experimental APIs)
- Provide polyfill guidance for older browsers
- Document known limitations

---

### Risk 4: Cross-Tab Race Conditions

**Risk:** Two tabs modifying same resource simultaneously

**Current status:** No conflict detection in simple implementation

**Mitigation:**
- Document this limitation clearly
- For most personal apps, this is acceptable
- Future: Add OCC-based conflict detection (follow-up work)
- Use BroadcastChannel to notify tabs of changes

---

## Success Criteria

### Functional
- ✅ All existing tests pass (with async updates)
- ✅ Merge correctly handles partial state
- ✅ Transactions commit atomically
- ✅ Soft deletes work correctly
- ✅ Cross-tab sync works via BroadcastChannel

### Performance
- ✅ Startup time < 10ms (vs ~50ms current)
- ✅ Memory usage < 10MB baseline (vs ~50MB with 10k records)
- ✅ Merge (100 items) < 200ms (acceptable for incremental sync)

### Developer Experience
- ✅ Migration guide is clear
- ✅ Breaking changes are well-documented
- ✅ API changes are minimal (just add async/await)

---

## Timeline

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1 | Week 1 | Core collection refactor |
| Phase 2 | Week 1 | Transaction refactor |
| Phase 3 | Week 2 | Remove IDB plugin |
| Phase 4 | Week 2 | Query refactor |
| Phase 5 | Week 2 | Event system updates |
| Phase 6 | Week 3 | HTTP plugin updates |
| Phase 7 | Week 3 | Migration & docs |
| Phase 8 | Week 4 | Testing & performance |

**Total: 4 weeks**

---

## Follow-Up Work (Post-Launch)

### Phase 9: Optimizations (Optional)

1. **Add LRU cache** for hot resources (reduce IDB reads)
2. **Add IDB indexes** for common query patterns
3. **Batch IDB operations** for better merge performance
4. **Add OCC conflict detection** for cross-tab transactions

### Phase 10: Advanced Features (Future)

1. **Streaming cursors** for very large result sets
2. **Partial hydration** strategies for complex queries
3. **Background sync** with Web Workers
4. **Compression** for stored resources

---

## Open Questions

1. **Should we add a small LRU cache from the start?**
   - Pro: Better performance for hot resources
   - Con: More complexity, memory usage
   - Recommendation: Start without, add if needed

2. **Should we keep the old IDB plugin for compatibility?**
   - Pro: Easier migration for users
   - Con: Maintaining two code paths
   - Recommendation: Deprecate but keep for one major version

3. **Should we add IDB indexes in the initial implementation?**
   - Pro: Better query performance
   - Con: More complex setup
   - Recommendation: Add in Phase 9 (follow-up)

---

## Conclusion

This plan transitions Starling to a lazy-loading architecture with minimal API changes. The key insight - that Last-Write-Wins CRDTs support partial merges - makes this much simpler than initially thought.

**Difficulty:** 4-5/10 (medium)
**Timeline:** 4 weeks
**Value:** High for large datasets, acceptable tradeoffs for typical use cases

The biggest change is making everything async, but this is a natural fit for IDB and results in cleaner code overall.
