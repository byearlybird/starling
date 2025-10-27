# @byearlybird/starling-plugin-query

Reactive query helpers for Starling stores. The plugin listens to store hooks and keeps filtered `Map` snapshots synchronized with your predicates. With the improved plugin system, query methods are available directly on the store.

## Installation

```bash
bun add @byearlybird/starling-plugin-query
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling-plugin-query";

const store = await Store.create<{ text: string; completed: boolean }>()
	.use(queryPlugin())
	.init();

// Query directly on the store - no separate manager needed!
const activeTodos = store.query((todo) => !todo.completed);

// Read the current results (a fresh Map copy)
for (const [id, todo] of activeTodos.results()) {
	console.log(id, todo);
}

// React to predicate changes
const unsubscribe = activeTodos.onChange(() => {
	console.log("Active todos changed:", activeTodos.results());
});

// Clean up when the consumer unmounts
unsubscribe();
activeTodos.dispose();
await store.dispose();
```

## API

### `queryPlugin<T>()`

Returns a Starling plugin that adds query functionality to the store. The plugin wires `onPut`, `onPatch`, and `onDelete` hooks to keep queries synchronized.

**Added Methods:**

- `store.query(predicate: (value: T) => boolean)` – registers a predicate and returns a `Query<T>`.

### `Query<T>`

Objects returned by `query()` expose:

- `results(): Map<string, T>` – defensive copy of the latest matching entries. Treat it as immutable.
- `onChange(callback)` – registers a listener; returns an unsubscribe function. Fired only when the predicate's truthiness changes for at least one entry.
- `dispose()` – removes the query from the manager and clears all listeners. Call this when the query is no longer needed.

## Behavioral Notes

- **Initialization**: When `store.init()` is called, the plugin automatically populates all registered queries by running their predicates against existing store entries. This ensures queries are immediately hydrated when used with persistence plugins (like `unstoragePlugin`).
- Hooks batch per store commit, so a transaction that mutates multiple records results in a single change notification per query.
- `results()` only reflects non-deleted entries. Deletions automatically evict the corresponding keys from every query `Map`.
