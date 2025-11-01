import type { Store } from "@byearlybird/starling";
import type { QueryConfig } from "@byearlybird/starling/plugin-query";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";

/**
 * A typed context for a Starling store with hooks for querying and mutations.
 */
export interface StoreContext<T> {
	/**
	 * Provider component that makes the store available to child components.
	 *
	 * @example
	 * ```tsx
	 * <TaskStore.Provider store={taskStore}>
	 *   <App />
	 * </TaskStore.Provider>
	 * ```
	 */
	Provider: (props: { store: Store<T>; children: ReactNode }) => JSX.Element;

	/**
	 * Hook to access the raw store instance.
	 *
	 * @throws {Error} If used outside of the corresponding Provider.
	 *
	 * @example
	 * ```tsx
	 * const store = TaskStore.useStore();
	 * const task = store.get("task-1");
	 * ```
	 */
	useStore: () => Store<T>;

	/**
	 * Hook to create a reactive query that automatically updates when matching documents change.
	 *
	 * @param config - Query configuration with where clause and optional select/order functions
	 * @returns A Map of matching documents
	 *
	 * @example
	 * ```tsx
	 * const todos = TaskStore.useQuery({
	 *   where: (task) => task.status === "todo",
	 *   order: (a, b) => a.createdAt.localeCompare(b.createdAt)
	 * });
	 * ```
	 */
	useQuery: <U = T>(config: QueryConfig<T, U>) => Map<string, U>;

	/**
	 * Hook to access mutation functions for the store.
	 *
	 * @returns Object with add, update, del, and begin functions
	 *
	 * @example
	 * ```tsx
	 * const { add, update, del } = TaskStore.useMutations();
	 *
	 * const id = add({ title: "New task", status: "todo" });
	 * update(id, { status: "doing" });
	 * del(id);
	 * ```
	 */
	useMutations: () => {
		add: (value: T, options?: { withId?: string }) => string;
		update: (key: string, partial: Partial<T>) => void;
		del: (key: string) => void;
		begin: Store<T>["begin"];
	};
}

/**
 * Creates a typed React context for a Starling store.
 *
 * This factory function returns a Provider component and hooks (useStore, useQuery, useMutations)
 * that are type-safe and scoped to a specific store. This enables using multiple independent stores
 * in the same app without conflicting contexts.
 *
 * @param displayName - Optional name for debugging (appears in React DevTools)
 * @returns A StoreContext object with Provider and hooks
 *
 * @example
 * ```tsx
 * // stores/task-store.ts
 * export type Task = {
 *   title: string;
 *   status: "todo" | "doing" | "done";
 * };
 *
 * export const taskStore = await createStore<Task>()
 *   .use(queryPlugin())
 *   .init();
 *
 * export const TaskStore = createStoreContext<Task>("TaskStore");
 *
 * // app.tsx
 * <TaskStore.Provider store={taskStore}>
 *   <TodoList />
 * </TaskStore.Provider>
 *
 * // components/todo-list.tsx
 * function TodoList() {
 *   const todos = TaskStore.useQuery({ where: (t) => t.status === "todo" });
 *   const { update, del } = TaskStore.useMutations();
 *
 *   return (
 *     <div>
 *       {Array.from(todos.entries()).map(([id, task]) => (
 *         <div key={id}>
 *           <h3>{task.title}</h3>
 *           <button onClick={() => update(id, { status: "doing" })}>
 *             Start
 *           </button>
 *           <button onClick={() => del(id)}>Delete</button>
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function createStoreContext<T>(
	displayName?: string,
): StoreContext<T> {
	const Context = createContext<Store<T> | null>(null);

	if (displayName) {
		Context.displayName = displayName;
	}

	// Provider Component
	function Provider({
		store,
		children,
	}: {
		store: Store<T>;
		children: ReactNode;
	}) {
		return <Context.Provider value={store}>{children}</Context.Provider>;
	}

	// useStore Hook
	function useStore(): Store<T> {
		const store = useContext(Context);

		if (!store) {
			throw new Error(
				`useStore must be used within a ${displayName || "Store"}Provider. ` +
					`Wrap your component tree with <Provider store={yourStore}>.`,
			);
		}

		return store;
	}

	// useQuery Hook
	function useQuery<U = T>(config: QueryConfig<T, U>): Map<string, U> {
		const store = useStore();

		const query = useMemo(
			() => store.query(config),
			// eslint-disable-next-line react-hooks/exhaustive-deps
			[store, config.where, config.select, config.order],
		);

		const [snapshot, setSnapshot] = useState(() => query.results());

		useEffect(() => {
			setSnapshot(query.results());

			const unsubscribe = query.onChange(() => {
				setSnapshot(query.results());
			});

			return () => {
				unsubscribe();
				query.dispose();
			};
		}, [query]);

		return snapshot;
	}

	// useMutations Hook
	function useMutations() {
		const store = useStore();

		const add = useCallback(
			(value: T, options?: { withId?: string }) => store.add(value, options),
			[store],
		);

		const update = useCallback(
			(key: string, partial: Partial<T>) => store.update(key, partial),
			[store],
		);

		const del = useCallback((key: string) => store.del(key), [store]);

		const begin = useCallback(store.begin.bind(store), [store]);

		return { add, update, del, begin };
	}

	return {
		Provider,
		useStore,
		useQuery,
		useMutations,
	};
}
