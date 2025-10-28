import type { Store } from "@byearlybird/starling";

type QueryConfig<T, U = T> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
};

type Query<U> = {
	results: () => Map<string, U>;
	onChange: (callback: () => void) => () => void;
	dispose: () => void;
};

type QueryInternal<T, U> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
	results: Map<string, U>;
	callbacks: Set<() => void>;
};

type QueryMethods<T> = {
	query: <U = T>(config: QueryConfig<T, U>) => Query<U>;
};

const queryPlugin = <T>(): Store.Plugin<T, QueryMethods<T>> => {
	const queries = new Set<QueryInternal<T, any>>();
	let store: Store.StarlingStore<T> | null = null;

	const hydrateQuery = (query: QueryInternal<T, any>) => {
		if (!store) return;
		query.results.clear();
		for (const [key, value] of store.entries()) {
			if (query.where(value)) {
				const selected = query.select ? query.select(value) : value;
				query.results.set(key, selected);
			}
		}
	};

	const runCallbacks = (dirtyQueries: Set<QueryInternal<T, any>>) => {
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
		const dirtyQueries = new Set<QueryInternal<T, any>>();

		for (const [key, value] of entries) {
			for (const q of queries) {
				if (q.where(value)) {
					const selected = q.select ? q.select(value) : value;
					q.results.set(key, selected);
					dirtyQueries.add(q);
				}
			}
		}

		runCallbacks(dirtyQueries);
	};

	const onPatch: Store.StoreOnPatch<T> = (
		entries: ReadonlyArray<readonly [string, T]>,
	) => {
		const dirtyQueries = new Set<QueryInternal<T, any>>();

		for (const [key, value] of entries) {
			for (const q of queries) {
				const matches = q.where(value);
				const inResults = q.results.has(key);

				if (matches && !inResults) {
					// Item now matches but wasn't in results before
					const selected = q.select ? q.select(value) : value;
					q.results.set(key, selected);
					dirtyQueries.add(q);
				} else if (!matches && inResults) {
					// Item no longer matches but was in results
					q.results.delete(key);
					dirtyQueries.add(q);
				} else if (matches && inResults) {
					// Item still matches and was already in results
					const selected = q.select ? q.select(value) : value;
					q.results.set(key, selected);
					dirtyQueries.add(q);
				}
			}
		}

		runCallbacks(dirtyQueries);
	};

	const onDelete: Store.StoreOnDelete = (keys: ReadonlyArray<string>) => {
		const dirtyQueries = new Set<QueryInternal<T, any>>();

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
		init: (s) => {
			store = s;
			// Populate queries with existing store entries on initialization
			for (const q of queries) {
				hydrateQuery(q);
			}
		},
		dispose: () => {
			queries.clear();
			store = null;
		},
		hooks: {
			onPut,
			onPatch,
			onDelete,
		},
		methods: {
			query: <U = T>(config: QueryConfig<T, U>): Query<U> => {
				const query: QueryInternal<T, U> = {
					where: config.where,
					...(config.select && { select: config.select }),
					results: new Map(),
					callbacks: new Set(),
				};

				queries.add(query);
				hydrateQuery(query);

				return {
					results: () => new Map(query.results),
					onChange: (callback: () => void) => {
						query.callbacks.add(callback);
						return () => {
							query.callbacks.delete(callback);
						};
					},
					dispose: () => {
						queries.delete(query);
						query.callbacks.clear();
					},
				};
			},
		},
	};
};

export { queryPlugin };
export type { Query, QueryConfig, QueryMethods };
