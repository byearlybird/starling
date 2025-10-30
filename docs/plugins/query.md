# Query Plugin

Reactive query helpers for Starling stores. The plugin listens to store hooks and keeps filtered `Map` snapshots synchronized with your predicates. With the improved plugin system, query methods are available directly on the store.

## Installation

No additional package is required—`@byearlybird/starling` exposes the plugin via the `@byearlybird/starling/plugin-query` subpath. Install the core package as usual:

```bash
bun add @byearlybird/starling
```

## Usage

```typescript
import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";

const store = await createStore<{ text: string; completed: boolean }>()
	.use(queryPlugin())
	.init();

// Query directly on the store with a where clause
const activeTodos = store.query({
	where: (todo) => !todo.completed,
});

// Optional: transform results with select
const activeTodoNames = store.query({
	where: (todo) => !todo.completed,
	select: (todo) => todo.text,
});

// Read the current results (a fresh Map copy)
for (const [id, todo] of activeTodos.results()) {
	console.log(id, todo);
}

// React to predicate changes
const unsubscribe = activeTodos.onChange(() => {
	console.log("Active todos changed:", activeTodos.results());
});

// Clean up when your component unmounts or the store is no longer needed
unsubscribe();
activeTodos.dispose();
await store.dispose();
```

## API

### `queryPlugin<T>()`

Returns a Starling plugin that adds query functionality to the store. The plugin wires `onAdd`, `onUpdate`, and `onDelete` hooks to keep queries synchronized.

**Added Methods:**

- `store.query(config)` – registers a query with a config object and returns a `Query<U>`.

### Query Config

The config object passed to `query()` has the following shape:

```typescript
type QueryConfig<T, U = T> = {
	where: (data: T) => boolean;      // Filter predicate
	select?: (data: T) => U;          // Optional transformation function
};
```

- `where` – A predicate function that returns `true` for items to include in the query results.
- `select` – An optional transformation function that projects each matching item to a different type. If omitted, results will be of type `T`.

### `Query<U>`

Objects returned by `query()` expose:

- `results(): Map<string, U>` – defensive copy of the latest matching entries. Treat it as immutable. The value type `U` is determined by the `select` function if provided, otherwise it's `T`.
- `onChange(callback)` – registers a listener; returns an unsubscribe function. Fired only when the query's results change (items added, updated, or removed).
- `dispose()` – removes the query from the manager and clears all listeners. Call this when the query is no longer needed.

## Behavioral Notes

- **Initialization**: When `store.init()` is called, the plugin automatically populates all registered queries by running their predicates against existing store entries. This ensures queries are immediately hydrated when used with persistence plugins (like `unstoragePlugin`).
- Hooks batch per store commit, so a transaction that mutates multiple records results in a single change notification per query.
- `results()` only reflects non-deleted entries. Deletions automatically evict the corresponding keys from every query `Map`.
