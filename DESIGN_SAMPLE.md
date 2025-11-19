# Mutation Events Design - Code Samples

## 1. Event Types

```typescript
// In collection.ts or a new types file
export type CollectionEvents<T> = {
  add: { id: string; item: T };
  update: { id: string; before: T; after: T };
  remove: { id: string; item: T };
};

// In db.ts
export type DatabaseEvent<Schemas extends Record<string, AnyObjectSchema>> =
  | {
      type: 'add';
      collection: keyof Schemas;
      id: string;
      item: any; // Would be properly typed per collection
    }
  | {
      type: 'update';
      collection: keyof Schemas;
      id: string;
      before: any;
      after: any;
    }
  | {
      type: 'remove';
      collection: keyof Schemas;
      id: string;
      item: any;
    };
```

## 2. Collection Changes

```typescript
// collection.ts
import { createEmitter, type Emitter } from "./emitter";

export type Collection<T extends AnyObjectSchema> = {
  // ... existing methods ...
  on<K extends keyof CollectionEvents<StandardSchemaV1.InferOutput<T>>>(
    event: K,
    handler: (payload: CollectionEvents<StandardSchemaV1.InferOutput<T>>[K]) => void
  ): () => void;
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

      // Emit the add event
      emitter.emit('add', { id, item: validated });

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

      // Emit the update event with before/after
      emitter.emit('update', {
        id,
        before,
        after: merged.attributes
      });
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

      // Emit the remove event
      emitter.emit('remove', { id, item });
    },

    on(event, handler) {
      return emitter.on(event, handler);
    },
  };
}
```

## 3. CollectionHandle Changes

```typescript
// collection-handle.ts
export type CollectionHandle<Schema extends AnyObjectSchema> = {
  // ... existing methods ...
  on<K extends keyof CollectionEvents<StandardSchemaV1.InferOutput<Schema>>>(
    event: K,
    handler: (payload: CollectionEvents<StandardSchemaV1.InferOutput<Schema>>[K]) => void
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
    event: 'add' | 'update' | 'remove',
    handler: (payload: DatabaseEvent<Schemas>) => void
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
  const dbEmitter = createEmitter<{
    add: DatabaseEvent<Schemas>;
    update: DatabaseEvent<Schemas>;
    remove: DatabaseEvent<Schemas>;
  }>();

  // Subscribe to all collection events and re-emit at database level
  for (const collectionName of Object.keys(collections) as (keyof Schemas)[]) {
    const collection = collections[collectionName];

    collection.on('add', ({ id, item }) => {
      dbEmitter.emit('add', {
        type: 'add',
        collection: collectionName,
        id,
        item,
      });
    });

    collection.on('update', ({ id, before, after }) => {
      dbEmitter.emit('update', {
        type: 'update',
        collection: collectionName,
        id,
        before,
        after,
      });
    });

    collection.on('remove', ({ id, item }) => {
      dbEmitter.emit('remove', {
        type: 'remove',
        collection: collectionName,
        id,
        item,
      });
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

  // Buffer to accumulate events during transaction
  const eventBuffer: Array<{
    collection: keyof Schemas;
    replay: () => void;
  }> = [];

  // Create lazy transaction handles
  const txHandles = {} as {
    [K in keyof Schemas]: CollectionHandle<Schemas[K]>;
  };

  for (const name of Object.keys(collections) as (keyof Schemas)[]) {
    const originalCollection = collections[name];
    const config = configs[name];

    const getClonedCollection = () => {
      if (!clonedCollections.has(name)) {
        // Create a cloned collection WITHOUT event emitting during transaction
        const cloned = createCollection(
          name as string,
          config.schema,
          config.getId,
          getEventstamp,
          originalCollection.data(),
        );

        // Intercept events from the cloned collection and buffer them
        cloned.on('add', (payload) => {
          eventBuffer.push({
            collection: name,
            replay: () => originalCollection.emit('add', payload),
          });
        });

        cloned.on('update', (payload) => {
          eventBuffer.push({
            collection: name,
            replay: () => originalCollection.emit('update', payload),
          });
        });

        cloned.on('remove', (payload) => {
          eventBuffer.push({
            collection: name,
            replay: () => originalCollection.emit('remove', payload),
          });
        });

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
    // Update collections
    for (const [name, clonedCollection] of clonedCollections.entries()) {
      const config = configs[name];
      collections[name] = createCollection(
        name as string,
        config.schema,
        config.getId,
        getEventstamp,
        clonedCollection.data(),
      );
    }

    // Replay all buffered events atomically
    for (const bufferedEvent of eventBuffer) {
      bufferedEvent.replay();
    }
  }

  return result;
}
```

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

// Collection-level events
const unsubscribe = db.tasks.on('add', ({ id, item }) => {
  console.log('Task added:', id, item);
  // { id: '1', item: { id: '1', title: 'Buy milk', completed: false } }
});

db.tasks.on('update', ({ id, before, after }) => {
  console.log('Task updated:', id);
  console.log('Before:', before);
  console.log('After:', after);
  // Before: { id: '1', title: 'Buy milk', completed: false }
  // After: { id: '1', title: 'Buy milk', completed: true }
});

db.tasks.on('remove', ({ id, item }) => {
  console.log('Task removed:', id, item);
  // { id: '1', item: { id: '1', title: 'Buy milk', completed: true } }
});

// Database-level events (cross-collection)
db.on('add', ({ type, collection, id, item }) => {
  auditLog.write(`[${collection}] Added: ${id}`, item);
});

db.on('update', ({ type, collection, id, before, after }) => {
  auditLog.write(`[${collection}] Updated: ${id}`, { before, after });
});

// Individual operations emit immediately
db.tasks.add({ id: '1', title: 'Buy milk', completed: false });
// -> Fires 'add' event immediately

db.tasks.update('1', { completed: true });
// -> Fires 'update' event immediately

// Transactions batch events
db.begin((tx) => {
  tx.tasks.add({ id: '2', title: 'Walk dog', completed: false });
  tx.tasks.add({ id: '3', title: 'Read book', completed: false });
  tx.users.add({ id: 'u1', name: 'Alice', email: 'alice@example.com' });

  // No events fired yet...
});
// -> All 3 events fire here after commit (in order)

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

## 7. Alternative: Simpler Event Batching

If the above transaction event buffering is too complex, here's a simpler approach:

```typescript
// Instead of buffering and replaying, we could:
// 1. Disable events during transaction execution
// 2. After commit, manually emit events based on what changed

export function executeTransaction<
  Schemas extends Record<string, AnyObjectSchema>,
  R,
>(
  configs: { [K in keyof Schemas]: CollectionConfig<Schemas[K]> },
  collections: { [K in keyof Schemas]: Collection<Schemas[K]> },
  getEventstamp: () => string,
  callback: (tx: TransactionContext<Schemas>) => R,
): R {
  // ... cloning logic ...

  // Capture before state
  const beforeState = new Map<keyof Schemas, Map<string, any>>();
  for (const [name, collection] of clonedCollections.entries()) {
    beforeState.set(name, new Map(collection.data()));
  }

  // ... execute transaction ...

  if (!shouldRollback) {
    // Commit and compute diffs
    for (const [name, clonedCollection] of clonedCollections.entries()) {
      const before = beforeState.get(name)!;
      const after = clonedCollection.data();

      // Emit events based on diffs
      for (const [id, afterResource] of after.entries()) {
        const beforeResource = before.get(id);

        if (!beforeResource) {
          // Added
          collections[name].emit('add', { id, item: afterResource.attributes });
        } else if (!isEqual(beforeResource, afterResource)) {
          // Updated
          collections[name].emit('update', {
            id,
            before: beforeResource.attributes,
            after: afterResource.attributes
          });
        }
      }

      // Check for removals
      for (const [id, beforeResource] of before.entries()) {
        if (!after.has(id) || after.get(id)!.meta.deletedAt) {
          collections[name].emit('remove', { id, item: beforeResource.attributes });
        }
      }
    }
  }

  return result;
}
```
