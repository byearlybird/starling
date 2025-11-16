# Query Plugin

Reactive query plugin for Starling that provides automatic filtering, projection, and sorting of store data.

## Installation

The query plugin ships within the core package via the `@byearlybird/starling/plugin-query` subpath. It has zero dependencies and is included in the core bundle.

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

// Create a reactive query
const activeTodos = store.query({
	where: (todo) => !todo.completed,
});

// Access results
console.log(activeTodos.results()); // Array of [id, todo] tuples

// Listen for changes
activeTodos.onChange(() => {
	console.log("Active todos changed:", activeTodos.results());
});

// Clean up when done
activeTodos.dispose();
```

## API

### `queryPlugin()`

Returns a Starling plugin that adds the `query()` method to the store.

**Returns:** `Plugin<T, QueryMethods<T>>`

### `store.query(config)`

Create a reactive query that automatically updates when matching documents change.

**Parameters:**

- `config.where` – Predicate function that returns `true` to include a document in results
- `config.select` – Optional projection function to transform documents before returning
- `config.order` – Optional comparator function for stable ordering of results

**Returns:** `Query<U>` - A query handle with `results()`, `onChange()`, and `dispose()` methods

## Features

### Filtering

Use the `where` predicate to filter documents:

```typescript
// Simple filter
const active = store.query({
	where: (todo) => !todo.completed,
});

// Complex filter
const urgentIncomplete = store.query({
	where: (todo) => !todo.completed && todo.priority > 5,
});

// All documents
const all = store.query({
	where: () => true,
});
```

### Projection

Use the `select` option to transform results:

```typescript
// Extract just the text
const todoTexts = store.query({
	where: (todo) => !todo.completed,
	select: (todo) => todo.text,
});

// Results are now Array<[id, string]>
console.log(todoTexts.results());
// [["todo1", "Buy milk"], ["todo2", "Walk dog"]]

// Complex projection
const summaries = store.query({
	where: () => true,
	select: (todo) => ({
		title: todo.text,
		status: todo.completed ? "done" : "pending",
	}),
});
```

### Sorting

Use the `order` option to sort results:

```typescript
// Alphabetical
const sorted = store.query({
	where: () => true,
	order: (a, b) => a.text.localeCompare(b.text),
});

// By priority (descending)
const byPriority = store.query({
	where: () => true,
	order: (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
});

// Combined with projection
const sortedTexts = store.query({
	where: (todo) => !todo.completed,
	select: (todo) => todo.text,
	order: (a, b) => a.localeCompare(b),
});
```

### Reactivity

Queries automatically update when the underlying data changes:

```typescript
const active = store.query({
	where: (todo) => !todo.completed,
});

console.log(active.results().length); // 0

// Add a todo
store.add({ text: "New task", completed: false }, { withId: "todo1" });
console.log(active.results().length); // 1

// Complete the todo
store.update("todo1", { completed: true });
console.log(active.results().length); // 0 - automatically removed
```

### Change Listeners

Subscribe to query changes with `onChange()`:

```typescript
const active = store.query({
	where: (todo) => !todo.completed,
});

const unsubscribe = active.onChange(() => {
	console.log("Active todos:", active.results());
	updateUI(active.results());
});

// Later, when you're done
unsubscribe();
```

**When onChange fires:**

- When documents are added that match the query
- When documents are updated and start/stop matching
- When documents are updated and remain in the query (values changed)
- When documents are deleted that were in the query

**When onChange does NOT fire:**

- When documents are added/updated/deleted that don't affect the query results

## Multiple Queries

You can create multiple independent queries on the same store:

```typescript
const active = store.query({ where: (todo) => !todo.completed });
const completed = store.query({ where: (todo) => todo.completed });
const highPriority = store.query({ where: (todo) => (todo.priority ?? 0) > 5 });

// All queries update independently
store.add({ text: "Important task", completed: false, priority: 10 }, { withId: "todo1" });
// ^ Updates both 'active' and 'highPriority' queries
```

## Query Lifecycle

### Creation and Hydration

Queries are hydrated immediately upon creation with existing store data:

```typescript
// Add data first
store.add({ text: "Existing task", completed: false }, { withId: "todo1" });

// Query is immediately hydrated with existing data
const active = store.query({ where: (todo) => !todo.completed });
console.log(active.results().length); // 1
```

### Cleanup

Always dispose queries when you're done to free resources:

```typescript
const query = store.query({ where: () => true });

// Use the query...

// Clean up
query.dispose(); // Removes listeners and clears internal state
```

### Store Lifecycle

Queries integrate with the store lifecycle:

```typescript
const store = createStore<Todo>().use(queryPlugin());

// Create queries before init
const active = store.query({ where: (todo) => !todo.completed });

// Add data
store.add({ text: "Task", completed: false }, { withId: "todo1" });

// Hydration happens during init
await store.init(); // Query is populated here

console.log(active.results().length); // 1

// Cleanup on dispose
await store.dispose(); // All queries are cleaned up
```

## Performance

### Query Efficiency

- **Hydration**: Queries iterate all documents once during creation/init
- **Updates**: Only affected queries are notified when data changes
- **Sorting**: Sort is applied on-demand when calling `results()`, not on every mutation
- **Memory**: Each query maintains a Map of matching [id, value] pairs

### Best Practices

**Create queries once, reuse:**

```typescript
// ✅ Good - create once
const activeQuery = store.query({ where: (todo) => !todo.completed });

function updateUI() {
	render(activeQuery.results());
}

// ❌ Bad - creates new query every time
function updateUI() {
	const active = store.query({ where: (todo) => !todo.completed });
	render(active.results());
}
```

**Dispose queries you no longer need:**

```typescript
// Component lifecycle
const query = store.query({ where: () => true });

// When component unmounts
query.dispose();
```

**Use select for expensive transformations:**

```typescript
// ✅ Good - transformation cached in query
const summaries = store.query({
	where: () => true,
	select: (todo) => computeExpensiveSummary(todo),
});

// ❌ Bad - transformation runs on every render
function render() {
	const todos = allQuery.results();
	const summaries = todos.map(([id, todo]) => computeExpensiveSummary(todo));
}
```

## TypeScript

The query plugin provides full type safety:

```typescript
type Todo = {
	text: string;
	completed: boolean;
	priority?: number;
};

const store = await createStore<Todo>().use(queryPlugin()).init();

// Inferred as Query<Todo>
const allTodos = store.query({ where: () => true });

// Inferred as Query<string>
const texts = store.query({
	where: () => true,
	select: (todo) => todo.text, // todo: Todo, return type: string
});

// Type error - wrong return type
const invalid = store.query({
	where: () => true,
	select: (todo) => todo.nonexistent, // ❌ Property doesn't exist
});
```

## Examples

### Filter + Project + Sort

```typescript
// Get incomplete todo texts, sorted alphabetically
const sortedActiveTodos = store.query({
	where: (todo) => !todo.completed,
	select: (todo) => todo.text,
	order: (a, b) => a.localeCompare(b),
});

// Results: Array<[string, string]>
// [["todo1", "Buy groceries"], ["todo2", "Walk dog"], ...]
```

### Computed Values

```typescript
// Calculate completion percentage
const stats = store.query({
	where: () => true,
	select: (todo) => (todo.completed ? 1 : 0),
});

function getCompletionRate() {
	const results = stats.results();
	const completed = results.reduce((sum, [, val]) => sum + val, 0);
	return results.length > 0 ? (completed / results.length) * 100 : 0;
}
```

### Dynamic Filtering

```typescript
// Filter by search term (requires recreating query)
function createSearchQuery(searchTerm: string) {
	return store.query({
		where: (todo) =>
			todo.text.toLowerCase().includes(searchTerm.toLowerCase()),
	});
}

let currentQuery = createSearchQuery("");

function updateSearch(newTerm: string) {
	currentQuery.dispose(); // Clean up old query
	currentQuery = createSearchQuery(newTerm);
	render(currentQuery.results());
}
```

## See Also

- [Core queries documentation](../queries.md) for conceptual overview
- [Store API](../../packages/core/src/store/store.ts) for complete type definitions
