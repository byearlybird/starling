import { Store } from "@byearlybird/starling";
import { createQueryManager, type Query } from "@byearlybird/starling-plugins-query";
import { unstoragePlugin } from "@byearlybird/starling-plugins-unstorage";
import { createStorage } from "unstorage";
import localStorageDriver from "unstorage/drivers/localstorage";
import memoryDriver from "unstorage/drivers/memory";

type Todo = {
  title: string;
  completed: boolean;
};

type TodoEnvironment = {
  store: Store.StarlingStore<Todo>;
  allTodosQuery: Query<Todo>;
  activeTodosQuery: Query<Todo>;
};

const createDriver = () => {
  if (typeof window === "undefined") {
    return memoryDriver();
  }

  return localStorageDriver({ base: "starling-demo:" });
};

const createTodoEnvironment = (): TodoEnvironment => {
  const queries = createQueryManager<Todo>();
  const storage = createStorage({
    driver: createDriver(),
  });

  const store = Store.create<Todo>()
    .use(() => queries.plugin())
    .use(unstoragePlugin("todos", storage, { debounceMs: 150 }));

  const allTodosQuery = queries.query(() => true);
  const activeTodosQuery = queries.query((todo) => !todo.completed);

  return {
    store,
    allTodosQuery,
    activeTodosQuery,
  };
};

const initializeTodoEnvironment = async (
  environment: TodoEnvironment,
): Promise<void> => {
  await environment.store.init();

  const entries = Array.from(environment.store.entries());

  if (entries.length === 0) {
    return;
  }

  const tx = environment.store.begin();
  for (const [key] of entries) {
    tx.patch(key, {} as Partial<Todo>);
  }
  tx.commit();
};

export type { Todo, TodoEnvironment };
export { createTodoEnvironment, initializeTodoEnvironment };
