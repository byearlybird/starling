import type { Store } from "@byearlybird/starling";
import type { Query, QueryConfig } from "@byearlybird/starling/plugin-query";
import type { Accessor, ParentProps } from "solid-js";
import {
	createContext,
	createMemo,
	createSignal,
	onCleanup,
	useContext,
} from "solid-js";

/**
 * A typed context for a Starling store with primitives for querying and mutations.
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
	Provider: (props: ParentProps & { store: Store<T> }) => JSX.Element;

	/**
	 * Primitive to access the raw store instance.
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
	 * Primitive to create a reactive query that automatically updates when matching documents change.
	 *
	 * @param config - Query configuration with where clause and optional select/order functions
	 * @returns An Accessor returning a Map of matching documents
	 *
	 * @example
	 * ```tsx
	 * const todos = TaskStore.useQuery({
	 *   where: (task) => task.status === "todo",
	 *   order: (a, b) => a.createdAt.localeCompare(b.createdAt)
	 * });
	 *
	 * return <div>Count: {todos().size}</div>;
	 * ```
	 */
	useQuery: <U = T>(config: QueryConfig<T, U>) => Accessor<Map<string, U>>;

	/**
	 * Primitive to access mutation functions for the store.
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
 * Creates a typed SolidJS context for a Starling store.
 *
 * This factory function returns a Provider component and primitives (useStore, useQuery, useMutations)
 * that are type-safe and scoped to a specific store. This enables using multiple independent stores
 * in the same app without conflicting contexts.
 *
 * @param displayName - Optional name for debugging
 * @returns A StoreContext object with Provider and primitives
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
 *       <For each={Array.from(todos().entries())}>
 *         {([id, task]) => (
 *           <div>
 *             <h3>{task.title}</h3>
 *             <button onClick={() => update(id, { status: "doing" })}>
 *               Start
 *             </button>
 *             <button onClick={() => del(id)}>Delete</button>
 *           </div>
 *         )}
 *       </For>
 *     </div>
 *   );
 * }
 * ```
 */
export function createStoreContext<T>(
	displayName?: string,
): StoreContext<T> {
	const Context = createContext<Store<T>>();

	// Provider Component
	function Provider(props: ParentProps & { store: Store<T> }) {
		return (
			<Context.Provider value={props.store}>{props.children}</Context.Provider>
		);
	}

	// useStore Primitive
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

	// useQuery Primitive
	function useQuery<U = T>(config: QueryConfig<T, U>): Accessor<Map<string, U>> {
		const store = useStore();

		// Create the query - recreate when config changes
		const query = createMemo<Query<U>>((prev) => {
			prev?.dispose();
			return store.query(config);
		});

		const [snapshot, setSnapshot] = createSignal(query().results());

		// Subscribe to changes
		createMemo(() => {
			const q = query();
			setSnapshot(q.results());

			const unsubscribe = q.onChange(() => {
				setSnapshot(q.results());
			});

			onCleanup(unsubscribe);
		});

		// Cleanup query on component unmount
		onCleanup(() => query().dispose());

		return snapshot;
	}

	// useMutations Primitive
	function useMutations() {
		const store = useStore();

		return {
			add: store.add.bind(store),
			update: store.update.bind(store),
			del: store.del.bind(store),
			begin: store.begin.bind(store),
		};
	}

	return {
		Provider,
		useStore,
		useQuery,
		useMutations,
	};
}
