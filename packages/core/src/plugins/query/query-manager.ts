import type { QueryInternal } from "../../store/types";
import { selectValue } from "./utils";

/**
 * Execute all callbacks for queries that have changed.
 * @param dirtyQueries - Set of queries that have been modified
 */
export function runQueryCallbacks<T extends Record<string, unknown>>(
	dirtyQueries: Set<QueryInternal<T, any>>,
): void {
	for (const query of dirtyQueries) {
		for (const callback of query.callbacks) {
			callback();
		}
	}
}

/**
 * Populate a query's results by filtering all entries.
 * @param query - Query to hydrate
 * @param entries - Iterable of [id, value] tuples to filter
 */
export function hydrateQuery<T extends Record<string, unknown>, U>(
	query: QueryInternal<T, U>,
	entries: Iterable<readonly [string, T]>,
): void {
	query.results.clear();
	for (const [key, value] of entries) {
		if (query.where(value)) {
			const selected = selectValue(query, value);
			query.results.set(key, selected);
		}
	}
}

/**
 * Update all queries based on mutations and return the set of affected queries.
 * @param queries - Set of all active queries
 * @param addEntries - Documents that were added
 * @param updateEntries - Documents that were updated
 * @param deleteKeys - Document IDs that were deleted
 * @returns Set of queries that changed and should notify listeners
 */
export function notifyQueries<T extends Record<string, unknown>>(
	queries: Set<QueryInternal<T, any>>,
	addEntries: ReadonlyArray<readonly [string, T]>,
	updateEntries: ReadonlyArray<readonly [string, T]>,
	deleteKeys: ReadonlyArray<string>,
): Set<QueryInternal<T, any>> {
	if (queries.size === 0) return new Set();

	const dirtyQueries = new Set<QueryInternal<T, any>>();

	if (addEntries.length > 0) {
		for (const [key, value] of addEntries) {
			for (const query of queries) {
				if (query.where(value)) {
					const selected = selectValue(query, value);
					query.results.set(key, selected);
					dirtyQueries.add(query);
				}
			}
		}
	}

	if (updateEntries.length > 0) {
		for (const [key, value] of updateEntries) {
			for (const query of queries) {
				const matches = query.where(value);
				const inResults = query.results.has(key);

				if (matches && !inResults) {
					const selected = selectValue(query, value);
					query.results.set(key, selected);
					dirtyQueries.add(query);
				} else if (!matches && inResults) {
					query.results.delete(key);
					dirtyQueries.add(query);
				} else if (matches && inResults) {
					const selected = selectValue(query, value);
					query.results.set(key, selected);
					dirtyQueries.add(query);
				}
			}
		}
	}

	if (deleteKeys.length > 0) {
		for (const key of deleteKeys) {
			for (const query of queries) {
				if (query.results.delete(key)) {
					dirtyQueries.add(query);
				}
			}
		}
	}

	return dirtyQueries;
}
