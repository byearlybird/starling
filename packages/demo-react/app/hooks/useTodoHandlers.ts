import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { Store } from "@byearlybird/starling";
import type { Todo } from "../lib/todoEnvironment";

const createTodoId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
};

type TodoStore = Store.StarlingStore<Todo>;

type DraftSetter = Dispatch<SetStateAction<string>>;

const useCreateTodoHandler = (
  store: TodoStore,
  draft: string,
  setDraft: DraftSetter,
) =>
  useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = draft.trim();

      if (!trimmed) {
        return;
      }

      const id = createTodoId();
      store.put(id, {
        title: trimmed,
        completed: false,
      });

      setDraft("");
    },
    [draft, setDraft, store],
  );

const useToggleTodoHandler = (store: TodoStore) =>
  useCallback(
    (id: string, todo: Todo) => {
      store.patch(id, { completed: !todo.completed });
    },
    [store],
  );

const useDeleteTodoHandler = (store: TodoStore) =>
  useCallback(
    (id: string) => {
      store.del(id);
    },
    [store],
  );

export { useCreateTodoHandler, useDeleteTodoHandler, useToggleTodoHandler };
