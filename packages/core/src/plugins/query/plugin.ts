import type { QueryInternal } from "../../store/types";
import {
	hydrateQuery,
	notifyQueries,
	runQueryCallbacks,
} from "../../store/query-manager";
import type { Plugin } from "../../store/store";

/**
 * Configuration for creating a reactive query.
 *
 * Queries automatically update when matching documents change.
 *
 * @example
 * ```ts
 * const config: QueryConfig<Todo> = {
 *   where: (todo) => !todo.completed,
 *   select: (todo) => todo.text,
 *   order: (a, b) => a.localeCompare(b)
 * };
 * ```
 */
export type QueryConfig<T, U = T> = {
	/** Filter predicate - return true to include document in results */
	where: (data: T) => boolean;
	/** Optional projection - transform documents before returning */
	select?: (data: T) => U;
	/** Optional comparator for stable ordering of results */
	order?: (a: U, b: U) => number;
};

/**
 * A reactive query handle that tracks matching documents and notifies on changes.
 *
 * Call `dispose()` when done to clean up listeners and remove from the store.
 */
export type Query<U> = {
	/** Get current matching documents as [id, document] tuples */
	results: () => Array<readonly [string, U]>;
	/** Register a change listener. Returns unsubscribe function. */
	onChange: (callback: () => void) => () => void;
	/** Remove this query from the store and clear all listeners */
	dispose: () => void;
};

/**
 * Methods added to the store by queryPlugin.
 */
export type QueryMethods<T extends Record<string, unknown>> = {
	/** Create a reactive query that auto-updates when matching docs change */
	query: <U = T>(config: QueryConfig<T, U>) => Query<U>;
};

/**
 * Plugin that adds reactive query functionality to the store.
 *
 * Queries filter and transform store data based on predicates, automatically
 * updating when matching documents change.
 *
 * @example
 * ```typescript
 * import { createStore } from '@byearlybird/starling';
 * import { queryPlugin } from '@byearlybird/starling/plugin-query';
 *
 * const store = createStore<Todo>()
 *   .use(queryPlugin())
 *   .init();
 *
 * const active = store.query({
 *   where: (todo) => !todo.completed
 * });
 *
 * active.onChange(() => {
 *   console.log('Active todos:', active.results());
 * });
 * ```
 */
export function queryPlugin<T extends Record<string, unknown>>(): Plugin<
	T,
	QueryMethods<T>
> {
	// Plugin-local state
	// biome-ignore lint/suspicious/noExplicitAny: Store can contain queries with different select types
	const queries = new Set<QueryInternal<T, any>>();

	return {
		hooks: {
			onInit: (store) => {
				// Hydrate all queries with initial data
				for (const query of queries) {
					hydrateQuery(query, store.entries());
				}
			},

			onDispose: () => {
				// Clean up all queries
				for (const query of queries) {
					query.callbacks.clear();
					query.results.clear();
				}
				queries.clear();
			},

			onAdd: (entries) => {
				const dirtyQueries = notifyQueries(queries, entries, [], []);
				if (dirtyQueries.size > 0) {
					runQueryCallbacks(dirtyQueries);
				}
			},

			onUpdate: (entries) => {
				const dirtyQueries = notifyQueries(queries, [], entries, []);
				if (dirtyQueries.size > 0) {
					runQueryCallbacks(dirtyQueries);
				}
			},

			onDelete: (keys) => {
				const dirtyQueries = notifyQueries(queries, [], [], keys);
				if (dirtyQueries.size > 0) {
					runQueryCallbacks(dirtyQueries);
				}
			},
		},

		methods: (store) => ({
			query: <U = T>(config: QueryConfig<T, U>): Query<U> => {
				const q: QueryInternal<T, U> = {
					where: config.where,
					...(config.select && { select: config.select }),
					...(config.order && { order: config.order }),
					results: new Map(),
					callbacks: new Set(),
				};

				queries.add(q);
				hydrateQuery(q, store.entries());

				return {
					results: () => {
						if (q.order) {
							return Array.from(q.results).sort(([, a], [, b]) =>
								// biome-ignore lint/style/noNonNullAssertion: order exists when q.order is defined
								q.order!(a, b),
							);
						}
						return Array.from(q.results);
					},
					onChange: (callback: () => void) => {
						q.callbacks.add(callback);
						return () => q.callbacks.delete(callback);
					},
					dispose: () => {
						q.callbacks.clear();
						q.results.clear();
						queries.delete(q);
					},
				};
			},
		}),
	};
}
