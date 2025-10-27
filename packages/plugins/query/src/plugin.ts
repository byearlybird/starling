import type { Store } from "@byearlybird/starling";

type Query<T extends Record<string, unknown>> = {
	results: () => Map<string, T>;
	onChange: (callback: () => void) => () => void;
	dispose: () => void;
};

type QueryInternal<T extends Record<string, unknown>> = {
	predicate: (data: T) => boolean;
	results: Map<string, T>;
	callbacks: Set<() => void>;
};

type QueryMethods<T extends Record<string, unknown>> = {
	query: (predicate: (data: T) => boolean) => Query<T>;
};

const queryPlugin = <T extends Record<string, unknown>>(): Store.Plugin<
	T,
	QueryMethods<T>
> => {
	const queries = new Set<QueryInternal<T>>();

	return (store: Store.StarlingStore<T>) => {
		const hydrateQuery = (query: QueryInternal<T>) => {
			query.results.clear();
			for (const [key, value] of store.entries()) {
				if (query.predicate(value)) {
					query.results.set(key, value);
				}
			}
		};

		const runCallbacks = (dirtyQueries: Set<QueryInternal<T>>) => {
			for (const query of dirtyQueries) {
				for (const callback of query.callbacks) {
					callback();
				}
			}
			dirtyQueries.clear();
		};

		const onPut: Store.StoreOnPut<T> = (
			entries: ReadonlyArray<readonly [string, T]>,
		) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const [key, value] of entries) {
				for (const q of queries) {
					if (q.predicate(value)) {
						q.results.set(key, value);
						dirtyQueries.add(q);
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		const onPatch: Store.StoreOnPatch<T> = (
			entries: ReadonlyArray<readonly [string, T]>,
		) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const [key, value] of entries) {
				for (const q of queries) {
					const matches = q.predicate(value);
					const inResults = q.results.has(key);

					if (matches && !inResults) {
						// Item now matches but wasn't in results before
						q.results.set(key, value);
						dirtyQueries.add(q);
					} else if (!matches && inResults) {
						// Item no longer matches but was in results
						q.results.delete(key);
						dirtyQueries.add(q);
					} else if (matches && inResults) {
						// Item still matches and was already in results
						q.results.set(key, value);
						dirtyQueries.add(q);
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		const onDelete: Store.StoreOnDelete = (keys: ReadonlyArray<string>) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const key of keys) {
				for (const q of queries) {
					if (q.results.has(key)) {
						q.results.delete(key);
						dirtyQueries.add(q);
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		return {
			init: () => {
				// Populate queries with existing store entries on initialization
				for (const q of queries) {
					hydrateQuery(q);
				}
			},
			dispose: () => {
				queries.clear();
			},
			hooks: {
				onPut,
				onPatch,
				onDelete,
			},
			methods: {
				query: (predicate: (data: T) => boolean): Query<T> => {
					const $query: QueryInternal<T> = {
						predicate,
						results: new Map(),
						callbacks: new Set(),
					};

					queries.add($query);
					hydrateQuery($query);

					return {
						results: () => new Map($query.results),
						onChange: (callback: () => void) => {
							$query.callbacks.add(callback);
							return () => {
								$query.callbacks.delete(callback);
							};
						},
						dispose: () => {
							queries.delete($query);
							$query.callbacks.clear();
						},
					};
				},
			},
		};
	};
};

export { queryPlugin };
export type { Query, QueryMethods };
