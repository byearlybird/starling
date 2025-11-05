# Queries

Starling ships with reactive queries built directly into the `Store` class. Register predicates with `store.query()` to receive filtered `Map` snapshots that automatically stay synchronized with mutations.

## Usage

```typescript
import { Store } from "@byearlybird/starling";

const store = await new Store<{ text: string; completed: boolean }>().init();

// Filter incomplete todos
const activeTodos = store.query({
	where: (todo) => !todo.completed,
});

// Optionally project results
const activeTodoNames = store.query({
	where: (todo) => !todo.completed,
	select: (todo) => todo.text,
});

// Read the current results (returns a defensive copy)
for (const [id, todo] of activeTodos.results()) {
	console.log(id, todo);
}

// React to changes
const unsubscribe = activeTodos.onChange(() => {
	console.log("Active todos changed:", activeTodos.results());
});

// Clean up when the query is no longer needed
unsubscribe();
activeTodos.dispose();
await store.dispose();
```

## API

### `store.query(config)`

Registers a query against the store and returns a `Query<U>` handle that can be observed and disposed.

#### Query Config

```typescript
type QueryConfig<T, U = T> = {
	where: (data: T) => boolean;      // Filter predicate (required)
	select?: (data: T) => U;          // Optional projection
	order?: (a: U, b: U) => number;   // Optional comparator for stable ordering
};
```

- `where` — Predicate that returns `true` for records to include.
- `select` — Optional projector. When provided, query results contain the projected value type.
- `order` — Optional comparator used to sort query results whenever `results()` is called.

### `Query<U>`

The handle returned from `store.query()` exposes:

- `results(): Map<string, U>` — A fresh `Map` with the latest matching entries. Treat the returned instance as immutable.
- `onChange(callback)` — Registers a listener that fires whenever the query results change. Returns an unsubscribe function.
- `dispose()` — Removes the query from the store and clears all listeners. Call this when the query is no longer needed.

## Behavioral Notes

- Queries hydrate automatically when registered and when `store.init()` completes, so persisted data is available immediately.
- Mutations are batched per transaction. A `begin()` call that touches multiple records triggers at most one `onChange` notification per query.
- Deleted documents are automatically evicted from every query result.
- `order` is applied on demand. The underlying results `Map` preserves last mutation order; sorting is only performed when retrieving results.
