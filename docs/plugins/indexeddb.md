# IndexedDB Plugin

Persistence adapter for Starling using the native browser IndexedDB API. The plugin saves store snapshots after every mutation and hydrates them back on boot.

## Installation

The plugin ships within the core package via the `@byearlybird/starling/plugin-indexeddb` subpath. No additional dependencies are required:

```bash
bun add @byearlybird/starling
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { indexedDBPlugin } from "@byearlybird/starling/plugin-indexeddb";

const store = await new Store<{ text: string }>()
	.use(indexedDBPlugin("todos", { debounceMs: 300 }))
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

### `indexedDBPlugin(key, config?)`

Returns a Starling plugin that automatically persists store snapshots to IndexedDB.

**Parameters:**

- `key` – Unique key for the dataset within the IndexedDB object store.
- `config.debounceMs` – Optional delay (in ms) used to collapse rapid mutations into a single persistence call. Defaults to `0` (write immediately).
- `config.pollIntervalMs` – Optional interval (in ms) to poll storage for external changes. When set, the plugin will periodically check storage and merge any external updates. Useful for multi-tab or shared storage scenarios.
- `config.skip` – Optional function that returns `true` to skip persistence operations. Useful for conditional persistence (e.g., `skip: () => !navigator.onLine` to skip when offline).
- `config.onBeforeSet` – Optional hook invoked before snapshots are persisted. Receives the Collection object `{ "~docs": EncodedDocument[], "~eventstamp": string }` and must return the same structure. Use this for custom serialization or filtering.
- `config.onAfterGet` – Optional hook invoked after loading from storage but before hydrating the store. Receives the Collection object and must return the same structure. Use this to transform or validate loaded data.
- `config.dbName` – Optional IndexedDB database name. Defaults to `"starling"`.
- `config.dbVersion` – Optional IndexedDB database version. Defaults to `1`.
- `config.storeName` – Optional IndexedDB object store name. Defaults to `"collections"`.

## Behavior

- During `init`, the plugin opens the IndexedDB database, loads the data at `key`, forwards the store's clock to the persisted `"~eventstamp"`, and replays each document inside a transaction. Provide `onAfterGet` to modify or filter the payload before it touches the store.
- Clock forwarding ensures new writes receive timestamps higher than any remote data, preventing eventstamp collisions across sync boundaries.
- Without this plugin (or an equivalent), the store only keeps the latest clock in memory. A cold start will reset to the current wall clock.
- `onAdd`, `onUpdate`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation writes the snapshot.
- Each snapshot is obtained via `store.collection()`, which returns both the documents (`"~docs"`) and the store's latest eventstamp (`"~eventstamp"`).
- `onBeforeSet` fires right before a snapshot write, enabling custom serialization or filtering.
- When `pollIntervalMs` is set, the plugin will periodically poll storage, forward the clock, and merge any external changes.
- When `skip` is provided and returns `true`, persistence operations are skipped. This is checked before each write and poll operation.
- `dispose()` clears any pending debounce timer and polling interval, and closes the IndexedDB connection. Call it when the surrounding store shuts down to avoid writes after teardown.

## Multiple Storage Instances

You can register multiple persistence plugins and they work together seamlessly. For example, combine IndexedDB with the HTTP unstorage plugin:

```typescript
import { Store } from "@byearlybird/starling";
import { indexedDBPlugin } from "@byearlybird/starling/plugin-indexeddb";
import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
import { createStorage } from "unstorage";
import httpDriver from "unstorage/drivers/http";

const httpStorage = createStorage({
  driver: httpDriver({ base: "https://api.example.com" }),
});

const store = await new Store<Todo>()
  .use(indexedDBPlugin('todos'))
  .use(unstoragePlugin('todos', httpStorage, { pollIntervalMs: 5000 }))
  .init();

// Every mutation automatically persists to BOTH storages
store.begin((tx) => {
  tx.add({ text: 'Learn Starling' }, { withId: 'todo-1' }); // → IndexedDB + httpStorage
});
```

**How it works:**
- Each plugin registers its own hooks independently
- Mutations trigger all registered hooks (persist to all storages)
- CRDT eventstamps resolve conflicts automatically
- No manual merge code required

This enables powerful patterns like:
- **Offline-first**: IndexedDB (immediate) + HTTP (synced later)
- **Multi-tab sync**: Use `pollIntervalMs` to keep tabs synchronized via IndexedDB
- **Backup strategies**: Local + remote storage
- **Development**: IndexedDB (browser) + mock storage (tests)

## Multi-Tab Synchronization

IndexedDB is perfect for synchronizing state across browser tabs. Use `pollIntervalMs` to enable automatic cross-tab sync:

```typescript
const store = await new Store<Todo>()
  .use(indexedDBPlugin('todos', {
    pollIntervalMs: 1000 // Check for changes every second
  }))
  .init();
```

When one tab makes changes:
1. Changes are immediately written to IndexedDB
2. Other tabs poll IndexedDB at the configured interval
3. Changes are automatically merged using Starling's field-level LWW

For even better UX, combine with the [StorageEvent API](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event) or [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) to trigger immediate syncs when changes occur.

## Comparison with Unstorage Plugin

**Use IndexedDB plugin when:**
- You only need browser storage
- You want zero external dependencies
- You're building a browser-only app
- You want to avoid the unstorage peer dependency

**Use Unstorage plugin when:**
- You need flexibility to switch storage backends
- You're targeting multiple platforms (Node.js, Cloudflare Workers, etc.)
- You want to use unstorage's extensive driver ecosystem (HTTP, filesystem, Redis, etc.)
- You need cross-platform storage abstraction

Both plugins can be used together for hybrid storage strategies.
