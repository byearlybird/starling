# @byearlybird/starling-plugins-query

Reactive query helpers for Starling stores. The package exposes a lightweight manager that listens to store hooks and keeps filtered `Map` snapshots synchronized with your predicates.

## Installation

```bash
bun add @byearlybird/starling-plugins-query
```

## Usage

```typescript
import { Store } from "@byearlybird/starling";
import { createQueryManager } from "@byearlybird/starling-plugins-query";

const store = Store.create<{ text: string; completed: boolean }>();
const queries = createQueryManager<{ text: string; completed: boolean }>();

// Wire the query plugin into the store before init
store.use(queries.plugin());
await store.init();

const activeTodos = queries.query((todo) => !todo.completed);

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

### `createQueryManager<T>()`

Returns an object with:

- `query(predicate: (value: T) => boolean)` – registers a predicate and returns a `Query<T>`.
- `plugin()` – Returns a Starling plugin that wires `onPut`, `onPatch`, and `onDelete` so all queries stay in sync. Call `store.use(queries.plugin())` before `store.init()`.

### `Query<T>`

Objects returned by `query()` expose:

- `results(): Map<string, T>` – defensive copy of the latest matching entries. Treat it as immutable.
- `onChange(callback)` – registers a listener; returns an unsubscribe function. Fired only when the predicate's truthiness changes for at least one entry.
- `dispose()` – removes the query from the manager and clears all listeners. Call this when the query is no longer needed.

## Behavioral Notes

- **Initialization**: When `store.init()` is called, the plugin automatically populates all registered queries by running their predicates against existing store entries. This ensures queries are immediately hydrated when used with persistence plugins (like `unstoragePlugin`).
- Hooks batch per store commit, so a transaction that mutates multiple records results in a single change notification per query.
- `results()` only reflects non-deleted entries. Deletions automatically evict the corresponding keys from every query `Map`.
- You can create multiple managers per store if you want to isolate lifecycles across environments (e.g., UI vs. background worker).
