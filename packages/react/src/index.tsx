/**
 * React hooks for Starling stores.
 *
 * Use `createStoreHooks()` to generate typed Context-based hooks for your store.
 */

import type { QueryConfig, Store } from "@byearlybird/starling";
import {
	createContext,
	type DependencyList,
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
 * import { Store } from "@byearlybird/starling";
 * import { createStoreHooks } from "@byearlybird/starling-react";
 *
 * export const taskStore = await new Store<Task>().init();
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
	 * and cleans up when the component unmounts or config values actually change.
	 *
	 * Pass a dependency list (like React's useEffect) when the config depends on values
	 * that change between renders. Inline config objects are safe—omit deps for static queries.
	 *
	 * @template U - The type of selected/transformed results
	 * @param config - Query configuration with `where`, optional `select`, and optional `order`
	 * @param deps - Optional dependency list that determines when the query should be recreated
	 * @returns An array of tuples containing [id, document] for matching documents
	 *
	 * @example
	 * ```tsx
	 * // Static config - no deps needed
	 * const todos = useQuery({ where: (t) => !t.completed });
	 *
	 * // Dynamic config - reruns when `status` changes
	 * const filtered = useQuery({ where: (t) => t.status === status }, [status]);
	 * ```
	 */
	function useQuery<U = T>(
		config: QueryConfig<T, U>,
		deps: DependencyList = [],
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
		}, [store, ...deps]);

		return snapshot;
	}

	return { StoreProvider, useStore, useQuery };
}
