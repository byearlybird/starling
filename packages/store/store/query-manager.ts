import type {
	StoreLite,
	StoreLiteOnDelete,
	StoreLiteOnPatch,
	StoreLiteOnPut,
} from "./store-lite";

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

const createQueryManager = <T extends Record<string, unknown>>() => {
	const $queries = new Set<QueryInternal<T>>();

	const runCallbacks = (dirtyQueries: Set<QueryInternal<T>>) => {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}
		dirtyQueries.clear();
	};

	const query = (predicate: (data: T) => boolean): Query<T> => {
		const $query: QueryInternal<T> = {
			predicate,
			results: new Map(),
			callbacks: new Set(),
		};

		$queries.add($query);

		return {
			results: () => new Map($query.results),
			onChange: (callback: () => void) => {
				$query.callbacks.add(callback);
				return () => {
					$query.callbacks.delete(callback);
				};
			},
			dispose: () => {
				$queries.delete($query);
				$query.callbacks.clear();
			},
		};
	};

	const plugin = () => {
		const onPut: StoreLiteOnPut<T> = (entries) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const [key, value] of entries) {
				for (const q of $queries) {
					if (q.predicate(value) && !q.results.has(key)) {
						// Only mark dirty if this is a new match
						q.results.set(key, value);
						dirtyQueries.add(q);
					} else if (q.predicate(value)) {
						// Update the value but don't mark dirty (item already in results)
						q.results.set(key, value);
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		const onPatch: StoreLiteOnPatch<T> = (entries) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const [key, value] of entries) {
				for (const q of $queries) {
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
						q.results.set(key, value); // Update value but don't mark dirty
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		const onDelete: StoreLiteOnDelete = (keys) => {
			const dirtyQueries = new Set<QueryInternal<T>>();

			for (const key of keys) {
				for (const q of $queries) {
					if (q.results.has(key)) {
						q.results.delete(key);
						dirtyQueries.add(q);
					}
				}
			}

			runCallbacks(dirtyQueries);
		};

		return {
			init: () => {},
			dispose: () => {},
			hooks: {
				onPut,
				onPatch,
				onDelete,
			},
		};
	};

	return {
		query,
		plugin,
	};
};

export { createQueryManager };
export type { Query, QueryInternal };
