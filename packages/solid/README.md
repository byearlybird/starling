# @byearlybird/starling-solid

SolidJS hooks for [Starling](https://github.com/byearlybird/starling) stores.

## Installation

```bash
bun add @byearlybird/starling @byearlybird/starling-solid
```

## Quick Start

```tsx
import { Store } from "@byearlybird/starling";
import { createStoreHooks } from "@byearlybird/starling-solid";

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

  // Subscribe to reactive queries - returns a signal accessor
  const activeTodos = useQuery({
    where: (todo) => !todo.completed
  });

  return (
    <div>
      <button onClick={handleAdd}>Add Todo</button>
      <ul>
        <For each={activeTodos()}>
          {([id, todo]) => <li>{todo.text}</li>}
        </For>
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

Provides the Starling store to child components via SolidJS Context.

```tsx
<StoreProvider>
  <App />
</StoreProvider>
```

**Props:**
- `children` - Child components that can access the store

### `useStore()`

Access the Starling store from SolidJS Context. Must be used within a `StoreProvider`.

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

Create and subscribe to a reactive query. Automatically updates when matching documents change.

**Returns a signal accessor** - call it to get the current results.

```tsx
function ActiveTodos() {
  const activeTodos = useQuery({
    where: (todo) => !todo.completed
  });

  return (
    <ul>
      <For each={activeTodos()}>
        {([id, todo]) => <li>{todo.text}</li>}
      </For>
    </ul>
  );
}
```

**Parameters:**
- `config.where` - Filter predicate function (required)
- `config.select` (optional) - Transform/projection function
- `config.order` (optional) - Sort comparator

**Returns:** Signal accessor `() => Array<readonly [string, U]>` containing [id, document] tuples

**Performance tip:** For stable queries, create the config with `createMemo` or at module level:

```tsx
const activeQuery = { where: (todo: Todo) => !todo.completed };

function OptimizedTodos() {
  const activeTodos = useQuery(activeQuery); // Stable reference
  // ...
}
```

## Key Differences from React

1. **`useQuery` returns a signal accessor** - you must call it to get results: `activeTodos()`
2. **Use `<For>` for lists** - SolidJS's efficient list rendering primitive
3. **Effects are automatic** - SolidJS tracks dependencies automatically

## Examples

See the [demo SolidJS app](../../apps/demo-starling-solid) for a complete example with localStorage and HTTP sync.

## License

MIT
