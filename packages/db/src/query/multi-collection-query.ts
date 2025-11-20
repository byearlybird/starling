/**
 * Factory for multi-collection queries.
 */

import type { AnyObjectSchema } from "../types";
import type { Query } from "./types";
import {
	type CollectionAccessors,
	createAccessorsForDatabase,
} from "./collection-accessor";

/**
 * Create a reactive query across multiple collections.
 *
 * Automatically tracks which collections are accessed and subscribes
 * to their mutations. Recomputes results when any accessed collection changes.
 *
 * @param db - Database instance
 * @param compute - Function that computes query results from collection accessors
 */
export function createMultiCollectionQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	Result,
>(
	db: any, // Database instance
	compute: (collections: CollectionAccessors<Schemas>) => Result[],
): Query<Result> {
	// Mutable state (imperative shell)
	const callbacks = new Set<() => void>();
	const unsubscribers: Array<() => void> = [];
	const accessedCollections = new Set<keyof Schemas>();
	let cachedResults: Result[] | null = null;
	let isDirty = true;
	let disposed = false;

	// Dependency tracking (functional core concept, imperative implementation)
	const trackAccess = (key: string) => {
		accessedCollections.add(key as keyof Schemas);
	};

	// Create collection accessors (DRY helper extracts collection keys)
	const createAccessors = (): CollectionAccessors<Schemas> => {
		return createAccessorsForDatabase(db, trackAccess);
	};

	// Initial computation to discover dependencies (functional core)
	const accessors = createAccessors();
	cachedResults = compute(accessors);
	isDirty = false;

	// Subscribe to accessed collections (imperative shell)
	for (const key of accessedCollections) {
		const collection = db[key];
		if (collection && typeof collection.on === "function") {
			const unsub = collection.on("mutation", () => {
				if (disposed) return;

				// Mark as dirty (imperative)
				isDirty = true;
				cachedResults = null;

				// Notify listeners (imperative)
				for (const callback of callbacks) {
					callback();
				}
			});
			unsubscribers.push(unsub);
		}
	}

	// Return query instance (imperative shell)
	return {
		results() {
			if (disposed) {
				return [];
			}

			// Recompute if dirty (functional core)
			if (isDirty || cachedResults === null) {
				// Note: We don't re-track dependencies after initial run
				// The accessed collections are determined once
				const accessors = createAccessors();
				cachedResults = compute(accessors);
				isDirty = false;
			}

			return cachedResults;
		},

		onChange(callback) {
			if (disposed) {
				return () => {};
			}

			callbacks.add(callback);
			return () => {
				callbacks.delete(callback);
			};
		},

		dispose() {
			if (disposed) return;

			disposed = true;

			// Unsubscribe from all collections
			for (const unsub of unsubscribers) {
				unsub();
			}

			callbacks.clear();
			cachedResults = null;
			accessedCollections.clear();
		},
	};
}
