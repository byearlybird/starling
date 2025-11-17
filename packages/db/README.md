# @byearlybird/starling-db

Database utilities and extensions for Starling stores.

## Purpose

This package provides higher-level functionality that was removed from `@byearlybird/starling` core to keep the core store lightweight and minimal. The core store now provides only basic CRUD operations and event-based reactivity, while this package will implement:

- **Plugin system** - Extensible architecture for adding custom behavior
- **Reactive queries** - Predicate-based queries that automatically update
- **Persistence** - Storage adapters for various backends
- **Additional utilities** - Helper functions for common patterns

## Background

The core `@byearlybird/starling` package previously included:

1. A plugin system with lifecycle hooks
2. A built-in query plugin for reactive queries
3. An unstorage plugin for persistence

These features have been removed to simplify the core and will be reimplemented here with improvements based on lessons learned.

## Removed Features (To Be Reimplemented)

### Plugin System

The core store previously supported a plugin architecture that allowed extending the store with hooks and methods:

**Previous API:**
```typescript
type Plugin<T, TMethods = {}> = {
  hooks?: {
    onInit?: (collectionKey: string, store: StoreBase<T>) => Promise<void> | void;
    onDispose?: (collectionKey: string) => Promise<void> | void;
    onAdd?: (collectionKey: string, entries: ReadonlyArray<readonly [string, T]>) => void;
    onUpdate?: (collectionKey: string, entries: ReadonlyArray<readonly [string, T]>) => void;
    onDelete?: (collectionKey: string, keys: ReadonlyArray<string>) => void;
  };
  methods?: (store: StoreBase<T>) => TMethods;
};

// Usage
const store = createStore<Todo>('todos')
  .use(queryPlugin())
  .use(customPlugin())
  .init();
```

**New approach (to be implemented):**
- Simplified plugin registration without complex type accumulation
- Focus on composition over inheritance
- Clear separation between hooks and methods

### Query Plugin

Reactive queries that automatically updated when matching documents changed:

**Previous API:**
```typescript
type QueryConfig<T, U = T> = {
  where: (data: T) => boolean;
  select?: (data: T) => U;
  order?: (a: U, b: U) => number;
};

type Query<U> = {
  results: () => Array<readonly [string, U]>;
  onChange: (callback: () => void) => () => void;
  dispose: () => void;
};

// Usage
const activeTodos = store.query({
  where: (todo) => !todo.completed,
  select: (todo) => todo.text,
  order: (a, b) => a.localeCompare(b)
});

activeTodos.onChange(() => {
  console.log('Todos changed:', activeTodos.results());
});
```

**Implementation details:**
- Queries hydrated on registration and during `init()`
- Mutations batched per transaction
- Automatic cleanup on `dispose()`
- Change detection based on predicate re-evaluation

### Unstorage Plugin

Persistence layer supporting any `unstorage` backend:

**Previous API:**
```typescript
type UnstorageConfig<T> = {
  debounceMs?: number;
  pollIntervalMs?: number;
  onBeforeSet?: (data: JsonDocument<T>) => MaybePromise<JsonDocument<T>>;
  onAfterGet?: (data: JsonDocument<T>) => MaybePromise<JsonDocument<T>>;
  skip?: () => boolean;
};

// Usage
const store = createStore<Todo>('todos')
  .use(unstoragePlugin(storage, {
    debounceMs: 300,
    pollIntervalMs: 5000,
    skip: () => !navigator.onLine
  }))
  .init();
```

**Key features:**
- Automatic snapshot persistence after mutations
- Debouncing to reduce write frequency
- Polling for external changes
- Conditional persistence (skip function)
- Transform hooks for encryption/compression
- Multiple storage instances (storage multiplexing)

## Current Core Store API

The simplified core store now provides:

```typescript
type Store<T> = {
  // CRUD operations
  has: (key: string) => boolean;
  get: (key: string) => T | null;
  add: (value: T, options?: { withId?: string }) => string;
  update: (key: string, value: DeepPartial<T>) => void;
  remove: (key: string) => void;

  // Batch operations
  begin: <R>(callback: (tx: StoreSetTransaction<T>) => R, opts?: { silent?: boolean }) => R;

  // Sync
  collection: () => JsonDocument<T>;
  merge: (document: JsonDocument<T>) => void;
  entries: () => IterableIterator<readonly [string, T]>;

  // Events
  on: <E extends 'add' | 'update' | 'delete'>(
    event: E,
    listener: (data: ...) => void
  ) => () => void;
  dispose: () => void;
};
```

## Development Status

This package is in early development. Contributions welcome!

## Roadmap

- [ ] Implement plugin system
- [ ] Port query functionality
- [ ] Port persistence functionality
- [ ] Add framework integrations (React, Solid, Vue)
- [ ] Add additional storage adapters
- [ ] Performance optimizations

## License

MIT
