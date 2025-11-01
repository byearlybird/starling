# @byearlybird/starling-react

React bindings for Starling stores with type-safe context and hooks.

## Installation

```bash
npm install @byearlybird/starling @byearlybird/starling-react react
# or
bun add @byearlybird/starling @byearlybird/starling-react react
```

## Quick Start

### 1. Create a Store Context

```typescript
// stores/task-store.ts
import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { createStoreContext } from "@byearlybird/starling-react";

export type Task = {
  title: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
};

// Create the store instance
export const taskStore = await createStore<Task>()
  .use(queryPlugin())
  .init();

// Create typed context with Provider and hooks
export const TaskStore = createStoreContext<Task>("TaskStore");
```

### 2. Wrap Your App with the Provider

```tsx
// app.tsx
import { TaskStore, taskStore } from "./stores/task-store";

export function App() {
  return (
    <TaskStore.Provider store={taskStore}>
      <TodoList />
    </TaskStore.Provider>
  );
}
```

### 3. Use Hooks in Components

```tsx
// components/todo-list.tsx
import { TaskStore } from "../stores/task-store";

export function TodoList() {
  // Query with reactive updates
  const todos = TaskStore.useQuery({
    where: (task) => task.status === "todo",
    order: (a, b) => a.title.localeCompare(b.title),
  });

  // Get mutation functions
  const { add, update, del } = TaskStore.useMutations();

  return (
    <div>
      <h2>To Do ({todos.size})</h2>
      {Array.from(todos.entries()).map(([id, task]) => (
        <div key={id}>
          <h3>{task.title}</h3>
          <button onClick={() => update(id, { status: "doing" })}>
            Start
          </button>
          <button onClick={() => del(id)}>Delete</button>
        </div>
      ))}
      <button
        onClick={() =>
          add({ title: "New task", status: "todo", priority: "medium" })
        }
      >
        Add Task
      </button>
    </div>
  );
}
```

## API

### `createStoreContext<T>(displayName?: string)`

Creates a typed React context for a Starling store.

**Returns**: `StoreContext<T>` with the following properties:

#### `Provider`

Provider component that makes the store available to child components.

```tsx
<TaskStore.Provider store={taskStore}>
  <App />
</TaskStore.Provider>
```

#### `useStore()`

Hook to access the raw store instance.

```tsx
const store = TaskStore.useStore();
const task = store.get("task-1");
```

**Throws**: Error if used outside of the corresponding Provider.

#### `useQuery<U = T>(config: QueryConfig<T, U>)`

Hook to create a reactive query that automatically updates when matching documents change.

```tsx
const todos = TaskStore.useQuery({
  where: (task) => task.status === "todo",
  select: (task) => task.title, // Optional transform
  order: (a, b) => a.localeCompare(b), // Optional sort
});
```

**Parameters**:
- `config.where` - Predicate function to filter documents
- `config.select` - (Optional) Transform function to project results
- `config.order` - (Optional) Sort function for results

**Returns**: `Map<string, U>` - Map of matching documents

#### `useMutations()`

Hook to access mutation functions for the store.

```tsx
const { add, update, del, begin } = TaskStore.useMutations();

const id = add({ title: "New task", status: "todo" });
update(id, { status: "doing" });
del(id);

// Transactions
begin((tx) => {
  const id1 = tx.add({ title: "Task 1", status: "todo" });
  const id2 = tx.add({ title: "Task 2", status: "todo" });
  tx.update(id1, { status: "doing" });
});
```

**Returns**:
- `add(value, options?)` - Insert a new document
- `update(key, partial)` - Merge a partial update
- `del(key)` - Soft-delete a document
- `begin(callback)` - Run a transaction

## Multiple Stores

You can use multiple stores in the same app by creating separate contexts:

```typescript
// stores/task-store.ts
export const TaskStore = createStoreContext<Task>("TaskStore");

// stores/user-store.ts
export const UserStore = createStoreContext<User>("UserStore");

// app.tsx
<TaskStore.Provider store={taskStore}>
  <UserStore.Provider store={userStore}>
    <App />
  </UserStore.Provider>
</TaskStore.Provider>
```

Each store has its own isolated context and hooks.

## Testing

Use the provider pattern to inject test stores:

```tsx
import { render } from "@testing-library/react";
import { createStore } from "@byearlybird/starling";
import { queryPlugin } from "@byearlybird/starling/plugin-query";
import { TaskStore } from "./stores/task-store";

test("renders tasks", async () => {
  const testStore = await createStore<Task>()
    .use(queryPlugin())
    .init();

  testStore.add({ title: "Test task", status: "todo" });

  const { getByText } = render(
    <TaskStore.Provider store={testStore}>
      <TodoList />
    </TaskStore.Provider>
  );

  expect(getByText("Test task")).toBeInTheDocument();
});
```

## TypeScript

All hooks are fully typed based on the store's document type:

```typescript
const TaskStore = createStoreContext<Task>("TaskStore");

// ✅ Fully typed
const todos = TaskStore.useQuery({
  where: (task) => task.status === "todo", // task is Task
});

const { add } = TaskStore.useMutations();
add({ title: "Test", status: "todo" }); // ✅ Type-checked
add({ invalid: "data" }); // ❌ Type error
```

## License

MIT
