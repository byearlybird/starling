/**
 * SolidJS hooks for Starling stores.
 *
 * Use `createStoreHooks()` to generate typed Context-based hooks for your store.
 */

import type { QueryConfig, Store } from "@byearlybird/starling";
import {
	createContext,
	createEffect,
	createSignal,
	onCleanup,
	type ParentComponent,
	useContext,
} from "solid-js";

/**
 * Create typed SolidJS hooks for a Starling store.
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
 * import { createStoreHooks } from "@byearlybird/starling-solid";
 *
 * export const taskStore = await new Store<Task>({ resourceType: "tasks" }).init();
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
	 * Provides the Starling store to child components via SolidJS Context.
	 *
	 * @param props - Component props
	 * @param props.children - Child components that can access the store
	 */
	const StoreProvider: ParentComponent = (props) => {
		return StoreContext.Provider({
			value: store,
			get children() {
				return props.children;
			},
		});
	};

	/**
	 * Access the Starling store from SolidJS Context.
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
	 * **Note:** For best performance with dynamic queries, consider using `createMemo`
	 * to stabilize the config object, or create queries at the module level.
	 *
	 * @template U - The type of selected/transformed results
	 * @param config - Query configuration with `where`, optional `select`, and optional `order`
	 * @returns A signal accessor returning an array of tuples containing [id, document] for matching documents
	 */
	function useQuery<U = T>(
		config: QueryConfig<T, U>,
	): () => Array<readonly [string, U]> {
		const [snapshot, setSnapshot] = createSignal<Array<readonly [string, U]>>(
			[],
		);

		createEffect(() => {
			// Create query for this config
			const query = store.query(config);

			// Set initial snapshot
			setSnapshot(query.results());

			// Subscribe to changes
			const unsubscribe = query.onChange(() => {
				setSnapshot(query.results());
			});

			// Cleanup: unsubscribe and dispose query
			onCleanup(() => {
				unsubscribe();
				query.dispose();
			});
		});

		return snapshot;
	}

	return { StoreProvider, useStore, useQuery };
}
