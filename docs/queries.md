# Queries

Starling ships with reactive queries built directly into the `Store` class. Register predicates with `store.query()` to receive filtered arrays that automatically stay synchronized with mutations.

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

See the `QueryConfig` and `Query` types in your IDE for parameter details, or check the [Store class source](../../packages/core/src/store/store.ts#L92-L127) for full documentation.

## How Queries Work

- Queries hydrate automatically when registered and when `store.init()` completes, so persisted data is available immediately.
- Mutations are batched per transaction. A `begin()` call that touches multiple records triggers at most one `onChange` notification per query.
- Deleted documents are automatically evicted from every query result.
- `order` is applied on demand. The underlying results are stored in a Map for efficient lookups; sorting is only performed when retrieving results as an array.
