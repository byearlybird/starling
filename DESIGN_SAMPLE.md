# Mutation Events Design - Code Samples

## 1. Event Types

```typescript
// In collection.ts or a new types file
export type CollectionMutationEvent<T> = {
  added: Array<{ id: string; item: T }>;
  updated: Array<{ id: string; before: T; after: T }>;
  removed: Array<{ id: string; item: T }>;
};

export type CollectionEvents<T> = {
  mutation: CollectionMutationEvent<T>;
};

// In db.ts
export type DatabaseMutationEvent<Schemas extends Record<string, AnyObjectSchema>> = {
  [K in keyof Schemas]: {
    collection: K;
    added: Array<{ id: string; item: StandardSchemaV1.InferOutput<Schemas[K]> }>;
    updated: Array<{ id: string; before: StandardSchemaV1.InferOutput<Schemas[K]>; after: StandardSchemaV1.InferOutput<Schemas[K]> }>;
    removed: Array<{ id: string; item: StandardSchemaV1.InferOutput<Schemas[K]> }>;
  };
}[keyof Schemas][];

export type DatabaseEvents<Schemas extends Record<string, AnyObjectSchema>> = {
  mutation: DatabaseMutationEvent<Schemas>;
};
```

## 2. Collection Changes

```typescript
// collection.ts
import { createEmitter, type Emitter } from "./emitter";

export type Collection<T extends AnyObjectSchema> = {
  // ... existing methods ...
  on(
    event: 'mutation',
    handler: (payload: CollectionMutationEvent<StandardSchemaV1.InferOutput<T>>) => void
  ): () => void;
  // Internal method to flush pending mutations
  _flushMutations(): void;
};

export function createCollection<T extends AnyObjectSchema>(
  name: string,
  schema: T,
  getId: (item: StandardSchemaV1.InferOutput<T>) => string,
  getEventstamp: () => string,
  initialData?: Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>,
): Collection<T> {
  const data = initialData ?? new Map();
  const emitter = createEmitter<CollectionEvents<StandardSchemaV1.InferOutput<T>>>();

  // Pending mutations buffer
  const pendingMutations: CollectionMutationEvent<StandardSchemaV1.InferOutput<T>> = {
    added: [],
    updated: [],
    removed: [],
  };

  const flushMutations = () => {
    if (
      pendingMutations.added.length > 0 ||
      pendingMutations.updated.length > 0 ||
      pendingMutations.removed.length > 0
    ) {
      emitter.emit('mutation', { ...pendingMutations });

      // Clear the buffer
      pendingMutations.added = [];
      pendingMutations.updated = [];
      pendingMutations.removed = [];
    }
  };

  return {
    // ... existing methods ...

    add(item: StandardSchemaV1.InferInput<T>) {
      const validated = standardValidate(schema, item);
      const id = getId(validated);

      if (data.has(id)) {
        throw new DuplicateIdError(id);
      }

      const resource = makeResource(name, id, validated, getEventstamp());
      data.set(id, resource);

      // Buffer the add mutation
      pendingMutations.added.push({ id, item: validated });

      // Flush immediately for non-transaction operations
      flushMutations();

      return validated;
    },

    update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>) {
      const existing = data.get(id);

      if (!existing) {
        throw new IdNotFoundError(id);
      }

      // Capture the before state
      const before = existing.attributes;

      const merged = mergeResources(
        existing,
        makeResource(name, id, updates, getEventstamp()),
      );

      standardValidate(schema, merged.attributes);
      data.set(id, merged);

      // Buffer the update mutation
      pendingMutations.updated.push({
        id,
        before,
        after: merged.attributes
      });

      // Flush immediately for non-transaction operations
      flushMutations();
    },

    remove(id: string) {
      const existing = data.get(id);
      if (!existing) {
        throw new IdNotFoundError(id);
      }

      // Capture the item before deletion
      const item = existing.attributes;

      const removed = deleteResource(existing, getEventstamp());
      data.set(id, removed);

      // Buffer the remove mutation
      pendingMutations.removed.push({ id, item });

      // Flush immediately for non-transaction operations
      flushMutations();
    },

    on(event, handler) {
      return emitter.on(event, handler);
    },

    _flushMutations() {
      flushMutations();
    },
  };
}
```

## 3. CollectionHandle Changes

```typescript
// collection-handle.ts
export type CollectionHandle<Schema extends AnyObjectSchema> = {
  // ... existing methods ...
  on(
    event: 'mutation',
    handler: (payload: CollectionMutationEvent<StandardSchemaV1.InferOutput<Schema>>) => void
  ): () => void;
};

export function createCollectionHandle<Schema extends AnyObjectSchema>(
  collection: Collection<Schema>,
): CollectionHandle<Schema> {
  return {
    // ... existing methods ...

    on(event, handler) {
      return collection.on(event, handler);
    },
  };
}
```

## 4. Database Changes

```typescript
// db.ts
import { createEmitter, type Emitter } from "./emitter";

export type Database<Schemas extends Record<string, AnyObjectSchema>> = {
  [K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
  begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R;
  on(
    event: 'mutation',
    handler: (payload: DatabaseMutationEvent<Schemas>) => void
  ): () => void;
};

export function createDatabase<Schemas extends Record<string, AnyObjectSchema>>(
  config: DbConfig<Schemas>,
): Database<Schemas> {
  const clock = new Clock();
  const getEventstamp = () => clock.now();
  const collections = makeCollections(config.schema, getEventstamp);
  const handles = makeHandles(collections);

  // Database-level emitter
  const dbEmitter = createEmitter<DatabaseEvents<Schemas>>();

  // Subscribe to all collection events and re-emit at database level
  for (const collectionName of Object.keys(collections) as (keyof Schemas)[]) {
    const collection = collections[collectionName];

    collection.on('mutation', (mutations) => {
      // Only emit if there were actual changes
      if (
        mutations.added.length > 0 ||
        mutations.updated.length > 0 ||
        mutations.removed.length > 0
      ) {
        dbEmitter.emit('mutation', [{
          collection: collectionName,
          added: mutations.added,
          updated: mutations.updated,
          removed: mutations.removed,
        }]);
      }
    });
  }

  return {
    ...handles,
    begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R {
      return executeTransaction(config.schema, collections, getEventstamp, callback);
    },
    on(event, handler) {
      return dbEmitter.on(event, handler);
    },
  };
}
```

## 5. Transaction Event Batching

```typescript
// transaction.ts - key changes

export function executeTransaction<
  Schemas extends Record<string, AnyObjectSchema>,
  R,
>(
  configs: { [K in keyof Schemas]: CollectionConfig<Schemas[K]> },
  collections: { [K in keyof Schemas]: Collection<Schemas[K]> },
  getEventstamp: () => string,
  callback: (tx: TransactionContext<Schemas>) => R,
): R {
  const clonedCollections = new Map<keyof Schemas, Collection<any>>();

  // Create lazy transaction handles
  const txHandles = {} as {
    [K in keyof Schemas]: CollectionHandle<Schemas[K]>;
  };

  for (const name of Object.keys(collections) as (keyof Schemas)[]) {
    const originalCollection = collections[name];
    const config = configs[name];

    const getClonedCollection = () => {
      if (!clonedCollections.has(name)) {
        // Create a cloned collection
        // It will buffer mutations internally but NOT flush them automatically
        const cloned = createCollection(
          name as string,
          config.schema,
          config.getId,
          getEventstamp,
          originalCollection.data(),
        );

        clonedCollections.set(name, cloned);
      }
      return clonedCollections.get(name)!;
    };

    txHandles[name] = createLazyTransactionHandle(
      originalCollection,
      getClonedCollection,
    );
  }

  let shouldRollback = false;

  const tx = {
    ...txHandles,
    rollback() {
      shouldRollback = true;
    },
  } as TransactionContext<Schemas>;

  // Execute callback
  let result: R;
  try {
    result = callback(tx);
  } catch (error) {
    // Automatic rollback on exception - don't emit events
    throw error;
  }

  // Commit only if not rolled back
  if (!shouldRollback) {
    // Update collections and flush their accumulated mutations
    for (const [name, clonedCollection] of clonedCollections.entries()) {
      const config = configs[name];

      // Replace the collection with the cloned version
      collections[name] = createCollection(
        name as string,
        config.schema,
        config.getId,
        getEventstamp,
        clonedCollection.data(),
      );

      // Flush all mutations from the cloned collection as a single batched event
      clonedCollection._flushMutations();
    }
  }

  return result;
}
```

**Key difference**: Collections now buffer their mutations internally. During normal operations, they flush immediately. During transactions, the flush is deferred until commit, creating a batched event.

## 6. Usage Examples

```typescript
// Create a database
const db = createDatabase({
  schema: {
    tasks: {
      schema: taskSchema,
      getId: (task) => task.id,
    },
    users: {
      schema: userSchema,
      getId: (user) => user.id,
    },
  },
});

// Collection-level events - batched mutations
const unsubscribe = db.tasks.on('mutation', ({ added, updated, removed }) => {
  console.log('Tasks changed:');
  console.log('Added:', added);
  // [{ id: '1', item: { id: '1', title: 'Buy milk', completed: false } }]

  console.log('Updated:', updated);
  // [{ id: '2', before: {...}, after: {...} }]

  console.log('Removed:', removed);
  // [{ id: '3', item: { id: '3', title: '...', completed: true } }]
});

// Database-level events (cross-collection)
db.on('mutation', (collections) => {
  for (const { collection, added, updated, removed } of collections) {
    if (added.length > 0) {
      auditLog.write(`[${collection}] Added ${added.length} items`);
    }
    if (updated.length > 0) {
      auditLog.write(`[${collection}] Updated ${updated.length} items`);
    }
    if (removed.length > 0) {
      auditLog.write(`[${collection}] Removed ${removed.length} items`);
    }
  }
});

// Individual operations emit immediately (batched with single item)
db.tasks.add({ id: '1', title: 'Buy milk', completed: false });
// -> Fires 'mutation' event: { added: [{ id: '1', item: {...} }], updated: [], removed: [] }

db.tasks.update('1', { completed: true });
// -> Fires 'mutation' event: { added: [], updated: [{ id: '1', before: {...}, after: {...} }], removed: [] }

db.tasks.remove('1');
// -> Fires 'mutation' event: { added: [], updated: [], removed: [{ id: '1', item: {...} }] }

// Transactions batch ALL changes into a single event
db.begin((tx) => {
  tx.tasks.add({ id: '2', title: 'Walk dog', completed: false });
  tx.tasks.add({ id: '3', title: 'Read book', completed: false });
  tx.tasks.update('1', { title: 'Buy organic milk' });
  tx.users.add({ id: 'u1', name: 'Alice', email: 'alice@example.com' });

  // No events fired yet...
});
// -> Fires single 'mutation' event with ALL changes:
// Collection-level (tasks): { added: [2 items], updated: [1 item], removed: [] }
// Collection-level (users): { added: [1 item], updated: [], removed: [] }
// Database-level: [
//   { collection: 'tasks', added: [...], updated: [...], removed: [] },
//   { collection: 'users', added: [...], updated: [], removed: [] }
// ]

// Rollback example - no events emitted
db.begin((tx) => {
  tx.tasks.add({ id: '4', title: 'Something', completed: false });
  tx.rollback();
});
// -> No events fired

// Exception example - no events emitted
try {
  db.begin((tx) => {
    tx.tasks.add({ id: '5', title: 'Something', completed: false });
    throw new Error('Oops');
  });
} catch (e) {
  // No events fired due to exception
}

// Unsubscribe
unsubscribe();
```

## 7. How Batching Works

**For individual operations:**
1. Mutation happens (add/update/remove)
2. Change is added to pending mutations buffer
3. Buffer is immediately flushed, emitting a mutation event with single item

**For transactions:**
1. Transaction begins
2. Multiple mutations accumulate in the cloned collection's buffer
3. Buffer does NOT auto-flush during transaction
4. On commit:
   - Collection is replaced with cloned version
   - `_flushMutations()` is called
   - Single mutation event emitted with ALL changes
5. On rollback/exception:
   - Cloned collection is discarded
   - No flush happens, no events emitted

This provides a clean, consistent API: both individual operations and transactions use the same event structure, just with different batch sizes.
