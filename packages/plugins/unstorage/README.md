# @byearlybird/starling-plugin-unstorage

Persistence adapter for Starling built on top of [`unstorage`](https://github.com/unjs/unstorage). The plugin saves store snapshots after every mutation and hydrates them back on boot.

## Installation

```bash
bun add @byearlybird/starling-plugin-unstorage unstorage
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling-plugin-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

const storage = createStorage({
	driver: localStorageDriver({ base: "app:" }),
});

const store = await Store.create<{ text: string }>()
	.use(unstoragePlugin("todos", storage, { debounceMs: 300 }))
	.init();

// Automatic persistence on every mutation
store.put({ "~id": "todo1", text: "Buy milk" }); // automatically schedules a snapshot write
store.patch("todo1", { text: "Buy almond milk" }); // automatically persists
store.del("todo1"); // automatically persists
```

## API

### `unstoragePlugin(namespace, storage, config?)`

Returns a Starling plugin that automatically persists store snapshots to storage.

**Parameters:**

- `namespace` – Unique key for the dataset inside your storage backend.
- `storage` – Any `Storage<Document.EncodedDocument[]>` instance returned by `createStorage()`.
- `config.debounceMs` – Optional delay (in ms) used to collapse rapid mutations into a single persistence call. Defaults to `0` (write immediately).
- `config.pollIntervalMs` – Optional interval (in ms) to poll storage for external changes. When set, the plugin will periodically check storage and merge any external updates. Useful for multi-process or shared storage scenarios.
- `config.onBeforeSet` – Optional hook invoked before snapshots are persisted. Receives a readonly array of encoded documents and must return (or resolve to) the array that should be written.
- `config.onAfterGet` – Optional hook invoked after loading from storage but before hydrating the store. Receives a readonly array of encoded documents and must return the documents that should be merged back in.

## Behavior

- During `init`, the plugin loads `storage.get(namespace)` and replays each document inside a transaction. Provide `onAfterGet` to modify or filter the payload before it touches the store.
- `onPut`, `onPatch`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation writes the snapshot.
- `onBeforeSet` fires right before a snapshot write, enabling custom serialization or filtering.
- When `pollIntervalMs` is set, the plugin will periodically poll storage and merge any external changes.
- `dispose()` clears any pending debounce timer and polling interval. Call it when the surrounding store shuts down to avoid writes after teardown.

## Multiple Storage Instances

One of Starling's key benefits is **storage multiplexing** - you can register multiple unstorage plugins and they work together seamlessly:

```typescript
const localStorage = createStorage({
  driver: localStorageDriver({ base: "app:" }),
});

const httpStorage = createStorage({
  driver: httpDriver({ base: "https://api.example.com" }),
});

const store = Store.create<Todo>()
  .use(unstoragePlugin('todos', localStorage))
  .use(unstoragePlugin('todos', httpStorage, { pollIntervalMs: 5000 }));

await store.init(); // Hydrates from both storages, CRDT merge handles conflicts

// Every mutation automatically persists to BOTH storages
store.put({ "~id": 'todo-1', text: 'Learn Starling' }); // → localStorage + httpStorage
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
