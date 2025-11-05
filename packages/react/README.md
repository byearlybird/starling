# @byearlybird/starling-react

React hooks for [Starling](https://github.com/byearlybird/starling) stores.

## Installation

```bash
bun add @byearlybird/starling @byearlybird/starling-react
```

## Quick Start

```tsx
import { Store } from "@byearlybird/starling";
import { createStoreHooks } from "@byearlybird/starling-react";

// Create your store
const todoStore = await new Store<Todo>().init();

// Create typed hooks from your store - do this once at module level
export const { StoreProvider, useStore, useQuery } = createStoreHooks(todoStore);

// Wrap your app with StoreProvider
function App() {
  return (
    <StoreProvider>
      <TodoList />
    </StoreProvider>
  );
}

// Use hooks in your components - fully typed without type parameters!
function TodoList() {
  const store = useStore(); // ✅ Fully typed, no type parameter needed

  // Access store methods
  const handleAdd = () => {
    store.add({ text: "New todo", completed: false });
  };

  // Subscribe to reactive queries
  const activeTodos = useQuery({
    where: (todo) => !todo.completed
  });

  return (
    <div>
      <button onClick={handleAdd}>Add Todo</button>
      <ul>
        {activeTodos.map(([id, todo]) => (
          <li key={id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

## API

### `createStoreHooks<T>(store)`

Factory function that creates typed hooks for a Starling store. Call this once at module level to get fully typed hooks without needing type parameters in components.

```tsx
export const { StoreProvider, useStore, useQuery } = createStoreHooks(todoStore);
```

**Parameters:**
- `store` - Your Starling store instance

**Returns:** Object with three items:
- `StoreProvider` - Context provider component
- `useStore` - Hook to access the store
- `useQuery` - Hook to create reactive queries

### `StoreProvider`

Provides the Starling store to child components via React Context.

```tsx
<StoreProvider>
  <App />
</StoreProvider>
```

**Props:**
- `children` - Child components that can access the store

### `useStore()`

Access the Starling store from React Context. Must be used within a `StoreProvider`.

**No type parameters needed** - types are inferred from the factory function!

```tsx
function MyComponent() {
  const store = useStore(); // ✅ Fully typed automatically

  const handleUpdate = (id: string) => {
    store.update(id, { completed: true });
  };

  // ...
}
```

**Returns:** Store instance with full API (add, update, del, get, entries, etc.)

### `useQuery<U>(config)`

Create and subscribe to a reactive query. Automatically re-renders when matching documents change.

```tsx
function ActiveTodos() {
  const activeTodos = useQuery({
    where: (todo) => !todo.completed
  });

  return (
    <ul>
      {activeTodos.map(([id, todo]) => (
        <li key={id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

**Parameters:**
- `config.where` - Filter predicate function (required)
- `config.select` (optional) - Transform/projection function
- `config.order` (optional) - Sort comparator

**Returns:** Array of `[id, document]` tuples for matching documents

**Performance tip:** For stable queries, create the config at module level:

```tsx
const activeQuery = { where: (todo: Todo) => !todo.completed };

function OptimizedTodos() {
  const activeTodos = useQuery(activeQuery); // Stable reference
  // ...
}
```

## Examples

See the [demo React app](../../apps/demo-starling-react) for a complete example with localStorage and HTTP sync.

## License

MIT
