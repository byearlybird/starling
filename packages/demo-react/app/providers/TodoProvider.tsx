import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createTodoEnvironment,
  initializeTodoEnvironment,
  type TodoEnvironment,
} from "../lib/todoEnvironment";
import "../styles/loading.css";

const TodoContext = createContext<TodoEnvironment | null>(null);

const TodoProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [environment] = useState(createTodoEnvironment);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    const boot = async () => {
      await initializeTodoEnvironment(environment);

      if (active) {
        setIsReady(true);
      }
    };

    void boot();

    return () => {
      active = false;
      void environment.store.dispose();
    };
  }, [environment]);

  const value = useMemo(() => environment, [environment]);

  if (!isReady) {
    return (
      <div className="todo-loading" role="status" aria-live="polite">
        Loading todos...
      </div>
    );
  }

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>;
};

const useTodoApp = (): TodoEnvironment => {
  const context = useContext(TodoContext);

  if (!context) {
    throw new Error("useTodoApp must be used within a TodoProvider");
  }

  return context;
};

export { TodoProvider, useTodoApp };
