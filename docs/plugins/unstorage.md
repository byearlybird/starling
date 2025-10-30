# Unstorage Plugin

Persistence adapter for Starling built on top of [`unstorage`](https://github.com/unjs/unstorage). The plugin saves store snapshots after every mutation and hydrates them back on boot.

## Installation

The plugin ships within the core package via the `@byearlybird/starling/plugin-unstorage` subpath. Install the core package and add `unstorage`, which remains an optional peer dependency:

```bash
bun add @byearlybird/starling
bun add unstorage
```

## Usage

```typescript
import { createStore } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

const storage = createStorage({
	driver: localStorageDriver({ base: "app:" }),
});

const store = await createStore<{ text: string }>()
	.use(unstoragePlugin("todos", storage, { debounceMs: 300 }))
	.init();

// Automatic persistence on every mutation
store.begin((tx) => {
  tx.add({ text: "Buy milk" }, { withId: "todo1" }); // automatically schedules a snapshot write
});

store.begin((tx) => {
  tx.update("todo1", { text: "Buy almond milk" }); // automatically persists
});

store.begin((tx) => {
  tx.del("todo1"); // automatically persists
});
```

## API

### `unstoragePlugin(namespace, storage, config?)`

Returns a Starling plugin that automatically persists store snapshots to storage.

**Parameters:**

- `namespace` – Unique key for the dataset inside your storage backend.
- `storage` – Any `Storage<{ docs: EncodedDocument[]; latestEventstamp: string }>` instance returned by `createStorage()`.
- `config.debounceMs` – Optional delay (in ms) used to collapse rapid mutations into a single persistence call. Defaults to `0` (write immediately).
- `config.pollIntervalMs` – Optional interval (in ms) to poll storage for external changes. When set, the plugin will periodically check storage and merge any external updates. Useful for multi-process or shared storage scenarios.
- `config.onBeforeSet` – Optional hook invoked before snapshots are persisted. Receives the persisted data object `{ docs: EncodedDocument[], latestEventstamp: string }` and must return the same structure.
- `config.onAfterGet` – Optional hook invoked after loading from storage but before hydrating the store. Receives the persisted data object and must return the same structure.

## Behavior

- During `init`, the plugin loads `storage.get(namespace)`, forwards the store's clock to the persisted `latestEventstamp`, and replays each document inside a transaction. Provide `onAfterGet` to modify or filter the payload before it touches the store.
- Clock forwarding ensures new writes receive timestamps higher than any remote data, preventing eventstamp collisions across sync boundaries.
- Without this plugin (or an equivalent), the store only keeps the latest clock in memory. A cold start will reset to the current wall clock.
- `onAdd`, `onUpdate`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation writes the snapshot.
- Each snapshot includes both the documents and the store's latest clock timestamp (`store.latest()`).
- `onBeforeSet` fires right before a snapshot write, enabling custom serialization or filtering.
- When `pollIntervalMs` is set, the plugin will periodically poll storage, forward the clock, and merge any external changes.
- `dispose()` clears any pending debounce timer and polling interval. Call it when the surrounding store shuts down to avoid writes after teardown.

## Multiple Storage Instances

One of Starling's key benefits is **storage multiplexing**—you can register multiple unstorage plugins and they work together seamlessly:

```typescript
const localStorage = createStorage({
  driver: localStorageDriver({ base: "app:" }),
});

const httpStorage = createStorage({
  driver: httpDriver({ base: "https://api.example.com" }),
});

const store = await createStore<Todo>()
  .use(unstoragePlugin('todos', localStorage))
  .use(unstoragePlugin('todos', httpStorage, { pollIntervalMs: 5000 }))
  .init();

// Every mutation automatically persists to BOTH storages
store.begin((tx) => {
  tx.add({ text: 'Learn Starling' }, { withId: 'todo-1' }); // → localStorage + httpStorage
});
```

**How it works:**
- Each plugin registers its own hooks independently
- Mutations trigger all registered hooks (persist to all storages)
- CRDT eventstamps resolve conflicts automatically
- No manual merge code required

This enables powerful patterns like:
- **Offline-first**: localStorage (immediate) + HTTP (synced later)
- **Multi-region**: Persist to multiple cloud providers
- **Backup strategies**: Local + remote storage
- **Development**: localStorage (dev) + mock storage (tests)
