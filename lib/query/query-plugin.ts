import type { Plugin, Store } from "../core/store";

type Predicate<T> = (data: T) => boolean;
type Callback = () => void;

type QueryInternal<T> = {
	predicate: Predicate<T>;
	results: Map<string, T>;
	callbacks: Set<Callback>;
};

const createQueryEngine = <T extends object>(store: Store<T>) => {
	const registry = new Set<QueryInternal<T>>();

	const runCallbacks = (dirtyQueries: Set<QueryInternal<T>>) => {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}

		dirtyQueries.clear();
	};

	const unwatchPut = store.on("put", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of registry) {
			for (const item of data) {
				if (query.predicate(item.value)) {
					query.results.set(item.key, item.value);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	const unwatchDelete = store.on("delete", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of registry) {
			for (const item of data) {
				if (query.results.has(item.key)) {
					query.results.delete(item.key);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	const unwatchUpdate = store.on("update", (data) => {
		const dirtyQueries = new Set<QueryInternal<T>>();

		for (const query of registry) {
			for (const item of data) {
				const matches = query.predicate(item.value);
				const inResults = query.results.has(item.key);

				if (matches) {
					query.results.set(item.key, item.value);
					dirtyQueries.add(query);
				} else if (inResults) {
					query.results.delete(item.key);
					dirtyQueries.add(query);
				}
			}
		}

		runCallbacks(dirtyQueries);
	});

	const query = (predicate: Predicate<T>) => {
		const results = new Map<string, T>();

		for (const item of store.values()) {
			if (predicate(item.value)) {
				results.set(item.key, item.value);
			}
		}

		const internal = {
			predicate,
			results,
			callbacks: new Set<Callback>(),
		};

		registry.add(internal);

		return {
			results() {
				return results;
			},
			onChange: (callback: Callback) => {
				internal.callbacks.add(callback);

				return () => {
					internal.callbacks.delete(callback);
				};
			},
			dispose: () => {
				internal.callbacks.clear();
				registry.delete(internal);
			},
		};
	};

	return {
		dispose() {
			unwatchDelete();
			unwatchPut();
			unwatchUpdate();
		},
		query,
	};
};

const queryEngine = <TValue extends object>(): {
	query: () => ReturnType<typeof createQueryEngine<TValue>>["query"];
	queryPlugin: Plugin<TValue>;
} => {
	console.log("making engine");
	let queryEngine: ReturnType<typeof createQueryEngine<TValue>> | null = null;

	const queryPlugin: Plugin<TValue> = (store) => ({
		init: () => {
			queryEngine = createQueryEngine(store);
		},
		dispose() {
			queryEngine?.dispose();
		},
	});

	return {
		query() {
			console.log("query");
			if (!queryEngine?.query) {
				console.log("boutta throw");
				throw new Error(
					"Attempt to run query before the query engine has been initialized",
				);
			}

			console.log("returning engine");
			return queryEngine.query;
		},
		queryPlugin,
	};
};

type QueryEngine<T extends object> = ReturnType<typeof createQueryEngine<T>>;

export type { Predicate, Callback, QueryEngine };
export { queryEngine, createQueryEngine };
