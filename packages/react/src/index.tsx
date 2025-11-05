/**
 * React hooks for Starling stores.
 *
 * Provides factory function to create typed Context-based store access and reactive query hooks.
 *
 * @example
 * ```tsx
 * import { createStoreHooks } from "@byearlybird/starling-react";
 * import { taskStore } from "./store";
 *
 * // Create typed hooks from your store
 * export const { StoreProvider, useStore, useQuery } = createStoreHooks(taskStore);
 *
 * // Wrap your app with StoreProvider
 * function App() {
 *   return (
 *     <StoreProvider>
 *       <TodoList />
 *     </StoreProvider>
 *   );
 * }
 *
 * // Access store in components - types are inferred!
 * function TodoList() {
 *   const store = useStore(); // ✅ Fully typed, no type parameter needed
 *
 *   // Use queries with full type inference
 *   const activeTodos = useQuery({
 *     where: (todo) => !todo.completed // ✅ todo is correctly typed
 *   });
 *
 *   return (
 *     <ul>
 *       {activeTodos.map(([id, todo]) => (
 *         <li key={id}>{todo.text}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

import type { QueryConfig, Store } from "@byearlybird/starling";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * Create typed React hooks for a Starling store.
 *
 * This factory function creates a StoreProvider, useStore, and useQuery
 * that are fully typed to your store without requiring type parameters.
 *
 * @template T - The type of documents stored
 * @template Extended - Plugin methods added to the store
 * @param store - Your Starling store instance
 * @returns Typed hooks: { StoreProvider, useStore, useQuery }
 *
 * @example
 * ```tsx
 * // In your store file
 * import { createStore } from "@byearlybird/starling";
 * import { createStoreHooks } from "@byearlybird/starling-react";
 *
 * export const taskStore = await createStore<Task>()
 *   .use(queryPlugin())
 *   .init();
 *
 * export const { StoreProvider, useStore, useQuery } = createStoreHooks(taskStore);
 *
 * // In your app
 * function App() {
 *   return (
 *     <StoreProvider>
 *       <TodoList />
 *     </StoreProvider>
 *   );
 * }
 *
 * // In components - fully typed without type parameters!
 * function TodoList() {
 *   const store = useStore();
 *   const todos = useQuery({ where: (todo) => !todo.completed });
 *   // ...
 * }
 * ```
 */
export function createStoreHooks<T>(store: Store<T>) {
	const StoreContext = createContext<Store<T> | null>(null);

	/**
	 * Provides the Starling store to child components via React Context.
	 *
	 * @param props - Component props
	 * @param props.children - Child components that can access the store
	 */
	function StoreProvider({ children }: { children: ReactNode }) {
		return (
			<StoreContext.Provider value={store}>{children}</StoreContext.Provider>
		);
	}

	/**
	 * Access the Starling store from React Context.
	 *
	 * Must be used within the StoreProvider. Throws an error if used outside.
	 *
	 * @returns The store instance, fully typed
	 */
	function useStore(): Store<T> {
		const ctx = useContext(StoreContext);
		if (!ctx) {
			throw new Error("useStore must be used within StoreProvider");
		}
		return ctx;
	}

	/**
	 * Create and subscribe to a reactive query.
	 *
	 * Automatically creates a query with the provided config, subscribes to changes,
	 * and cleans up when the component unmounts or config changes.
	 *
	 * **Note:** For best performance with dynamic queries, consider using `useMemo`
	 * to stabilize the config object, or create queries at the module level.
	 *
	 * @template U - The type of selected/transformed results
	 * @param config - Query configuration with `where`, optional `select`, and optional `order`
	 * @returns An array of tuples containing [id, document] for matching documents
	 */
	function useQuery<U = T>(
		config: QueryConfig<T, U>,
	): Array<readonly [string, U]> {
		const [snapshot, setSnapshot] = useState<Array<readonly [string, U]>>([]);

		useEffect(() => {
			// Create query for this config
			const query = store.query(config);

			// Set initial snapshot
			setSnapshot(query.results());

			// Subscribe to changes
			const unsubscribe = query.onChange(() => {
				setSnapshot(query.results());
			});

			// Cleanup: unsubscribe and dispose query
			return () => {
				unsubscribe();
				query.dispose();
			};
		}, [store, config]); // Re-create query when config changes

		return snapshot;
	}

	return { StoreProvider, useStore, useQuery };
}
