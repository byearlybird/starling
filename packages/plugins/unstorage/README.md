# @byearlybird/starling-plugins-unstorage

Persistence adapter for Starling built on top of [`unstorage`](https://github.com/unjs/unstorage). The plugin saves store snapshots after every mutation and hydrates them back on boot.

## Installation

```bash
bun add @byearlybird/starling-plugins-unstorage unstorage
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";

const storage = createStorage({
	driver: localStorageDriver({ base: "app:" }),
});

const store = Store.create<{ text: string }>().use(
	unstoragePlugin("todos", storage, { debounceMs: 300 }),
);

await store.init(); // replays persisted docs via tx.merge(..., { silent: true })
store.put("todo1", { text: "Buy milk" }); // automatically schedules a snapshot write
```

## Options

`unstoragePlugin(namespace, storage, config?)`

- `namespace` – Unique key for the dataset inside your storage backend.
- `storage` – Any `Storage<Document.EncodedDocument[]>` instance returned by `createStorage()`.
- `config.debounceMs` – Optional delay (in ms) used to collapse rapid mutations into a single persistence call. Defaults to `0` (write immediately).
- `config.pollIntervalMs` – Optional interval (in ms) to poll storage for external changes. When set, the plugin will periodically check storage and merge any external updates. Useful for multi-process or shared storage scenarios.
- `config.onBeforeSet` – Optional hook invoked before snapshots are persisted. Receives a readonly array of encoded documents and must return (or resolve to) the array that should be written.
- `config.onAfterGet` – Optional hook invoked after loading from storage but before hydrating the store. Receives a readonly array of encoded documents and must return the documents that should be merged back in.

## Behavior

- During `init`, the plugin loads `storage.get(namespace)` and replays each document inside a transaction committed with `{ silent: true }`, so other plugins do not react while hydrating. Provide `onAfterGet` to modify or filter the payload before it touches the store.
- `onPut`, `onPatch`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation writes the snapshot.
- `onBeforeSet` fires right before a snapshot write, enabling custom serialization or filtering.
- When `pollIntervalMs` is set, the plugin will periodically poll storage and merge any external changes using `tx.commit({ silent: true })` to avoid triggering downstream hooks.
- `dispose()` clears any pending debounce timer and polling interval. Call it when the surrounding store shuts down to avoid writes after teardown.
