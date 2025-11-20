/**
 * Factory for single-collection queries.
 */

import type { StandardSchemaV1 } from "../standard-schema";
import type { AnyObjectSchema } from "../types";
import type { Query } from "./types";
import {
	applyAdds,
	applyRemovals,
	applyUpdates,
	buildIndex,
	indexToArray,
	indexToSortedArray,
} from "./core";

type InferOutput<T> = T extends AnyObjectSchema
	? StandardSchemaV1.InferOutput<T>
	: never;

/**
 * Options for single-collection queries.
 */
export type SingleCollectionQueryOptions<T, U> = {
	/** Transform items before returning */
	map?: (item: T) => U;
	/** Sort comparator for results */
	sort?: (a: U, b: U) => number;
};

/**
 * Create a reactive query for a single collection.
 *
 * Uses incremental index updates for efficient reactivity.
 *
 * @param collectionHandle - The collection to query
 * @param getId - Function to extract ID from items
 * @param filter - Filter predicate
 * @param options - Optional map and sort functions
 */
export function createSingleCollectionQuery<
	Schema extends AnyObjectSchema,
	U = InferOutput<Schema>,
>(
	collectionHandle: {
		getAll(): InferOutput<Schema>[];
		on(
			event: "mutation",
			handler: (payload: {
				added: Array<{ id: string; item: InferOutput<Schema> }>;
				updated: Array<{
					id: string;
					before: InferOutput<Schema>;
					after: InferOutput<Schema>;
				}>;
				removed: Array<{ id: string; item: InferOutput<Schema> }>;
			}) => void,
		): () => void;
	},
	filter: (item: InferOutput<Schema>) => boolean,
	options?: SingleCollectionQueryOptions<InferOutput<Schema>, U>,
): Query<U> {
	type T = InferOutput<Schema>;

	// Mutable state (imperative shell)
	let resultIndex: Map<string, U>;
	const callbacks = new Set<() => void>();
	let disposed = false;

	// Initial hydration (functional core)
	const initialItems = collectionHandle.getAll();
	const initialEntries: Array<readonly [string, T]> = initialItems.map(
		(item, i) => [`${i}`, item] as const,
	);

	// We need IDs from the items themselves
	// For now, we'll build the index using a simpler approach
	resultIndex = new Map<string, U>();
	for (const item of initialItems) {
		if (filter(item)) {
			// Extract ID - assume items have an 'id' property
			const id = (item as any).id as string;
			const value = options?.map ? options.map(item) : (item as unknown as U);
			resultIndex.set(id, value);
		}
	}

	// Subscribe to mutations
	const unsubscribe = collectionHandle.on("mutation", (event) => {
		let changed = false;

		// Apply adds (functional core)
		const addResult = applyAdds(resultIndex, event.added, filter, options?.map);
		if (addResult.changed) {
			resultIndex = addResult.index;
			changed = true;
		}

		// Apply updates (functional core)
		const updateResult = applyUpdates(
			resultIndex,
			event.updated,
			filter,
			options?.map,
		);
		if (updateResult.changed) {
			resultIndex = updateResult.index;
			changed = true;
		}

		// Apply removals (functional core)
		const removeResult = applyRemovals(resultIndex, event.removed);
		if (removeResult.changed) {
			resultIndex = removeResult.index;
			changed = true;
		}

		// Notify if anything changed
		if (changed && !disposed) {
			for (const callback of callbacks) {
				callback();
			}
		}
	});

	// Return query instance (imperative shell)
	return {
		results() {
			if (disposed) {
				return [];
			}

			// Functional core: convert index to array
			if (options?.sort) {
				return indexToSortedArray(resultIndex, options.sort);
			}
			return indexToArray(resultIndex);
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
			unsubscribe();
			callbacks.clear();
			resultIndex.clear();
		},
	};
}
