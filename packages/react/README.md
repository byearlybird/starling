# @byearlybird/starling-react

React hooks for [Starling](https://github.com/byearlybird/starling) stores.

## Installation

```bash
bun add @byearlybird/starling @byearlybird/starling-react
```

## Quick Start

```tsx
import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { StoreProvider, useStore, useQuery } from "@byearlybird/starling-react";

// Create your store
const todoStore = await createStore<Todo>()
  .use(queryPlugin())
  .init();

// Wrap your app with StoreProvider
function App() {
  return (
    <StoreProvider store={todoStore}>
      <TodoList />
    </StoreProvider>
  );
}

// Use hooks in your components
function TodoList() {
  const store = useStore<Todo>();

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
        {Array.from(activeTodos.entries()).map(([id, todo]) => (
          <li key={id}>{todo.text}</li>
        ))}
      </ul>
    </div>
  );
}
```

## API

### `StoreProvider`

Provides a Starling store to child components via React Context.

```tsx
<StoreProvider store={myStore}>
  <App />
</StoreProvider>
```

**Props:**
- `store` - Starling store instance
- `children` - React children

### `useStore<T, Extended>()`

Access the Starling store from React Context. Must be used within a `StoreProvider`.

```tsx
function MyComponent() {
  const store = useStore<Todo>();

  const handleUpdate = (id: string) => {
    store.update(id, { completed: true });
  };

  // ...
}
```

**Returns:** Store instance with full API (add, update, del, get, entries, etc.)

### `useQuery<T, U>(config)`

Create and subscribe to a reactive query. Automatically re-renders when matching documents change.

```tsx
function ActiveTodos() {
  const activeTodos = useQuery({
    where: (todo) => !todo.completed
  });

  return (
    <ul>
      {Array.from(activeTodos.entries()).map(([id, todo]) => (
        <li key={id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

**Parameters:**
- `config.where` - Filter predicate function
- `config.select` (optional) - Transform function
- `config.order` (optional) - Sort comparator

**Returns:** `Map<string, U>` of matching documents

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
