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

## Behavior

- During `init`, the plugin loads `storage.get(namespace)` and replays each document inside a transaction committed with `{ silent: true }`, so other plugins do not react while hydrating.
- `onPut`, `onPatch`, and `onDelete` hooks share the same persistence scheduler. When `debounceMs > 0`, only the trailing invocation writes the snapshot.
- `dispose()` clears any pending debounce timer. Call it when the surrounding store shuts down to avoid writes after teardown.
