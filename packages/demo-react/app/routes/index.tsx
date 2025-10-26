import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useTodoApp } from "../providers/TodoProvider";
import { useQueryResults } from "../lib/useQueryResults";
import {
  useCreateTodoHandler,
  useDeleteTodoHandler,
  useToggleTodoHandler,
} from "../hooks/useTodoHandlers";
import "./index.css";

const TodoPage = (): JSX.Element => {
  const { store, allTodosQuery, activeTodosQuery } = useTodoApp();
  const [draft, setDraft] = useState("");

  const allTodos = useQueryResults(allTodosQuery);
  const activeTodos = useQueryResults(activeTodosQuery);

  const handleSubmit = useCreateTodoHandler(store, draft, setDraft);
  const handleToggle = useToggleTodoHandler(store);
  const handleDelete = useDeleteTodoHandler(store);

  const pendingCount = activeTodos.size;
  const todos = useMemo(() => Array.from(allTodos.entries()), [allTodos]);
  const activeList = useMemo(
    () => Array.from(activeTodos.entries()),
    [activeTodos],
  );

  return (
    <main className="todo-app">
      <header>
        <h1>Starling Todos</h1>
        <p className="todo-summary">
          {pendingCount === 0
            ? "All caught up!"
            : `${pendingCount} incomplete ${pendingCount === 1 ? "task" : "tasks"}.`}
        </p>
      </header>

      <section className="todo-card" aria-labelledby="todo-create-heading">
        <h2 id="todo-create-heading" className="sr-only">
          Create a todo
        </h2>
        <form className="todo-input" onSubmit={handleSubmit}>
          <input
            aria-label="Todo description"
            autoComplete="off"
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Add a new todo"
            type="text"
            value={draft}
          />
          <button type="submit" disabled={draft.trim().length === 0}>
            Add
          </button>
        </form>
      </section>

      <section className="todo-card" aria-labelledby="todo-list-heading">
        <header>
          <h2 id="todo-list-heading">All Todos</h2>
        </header>
        <ul className="todo-list">
          {todos.length === 0 && (
            <li className="todo-summary">Create your first todo to get started.</li>
          )}
          {todos.map(([id, todo]) => (
            <li className="todo-list-item" key={id}>
              <label>
                <input
                  aria-label={todo.title}
                  checked={todo.completed}
                  onChange={() => handleToggle(id, todo)}
                  type="checkbox"
                />
                <span
                  className={`todo-title${todo.completed ? " todo-title--completed" : ""}`}
                >
                  {todo.title}
                </span>
              </label>
              <button type="button" onClick={() => handleDelete(id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="todo-card" aria-labelledby="todo-active-heading">
        <header>
          <h2 id="todo-active-heading">Incomplete</h2>
        </header>
        <ul className="todo-list">
          {activeList.length === 0 && (
            <li className="todo-summary">No incomplete todos. Enjoy the day!</li>
          )}
          {activeList.map(([id, todo]) => (
            <li className="todo-list-item" key={id}>
              <span className="todo-title">{todo.title}</span>
              <button type="button" onClick={() => handleToggle(id, todo)}>
                Mark done
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

export const Route = createFileRoute("/")({
  component: TodoPage,
});
