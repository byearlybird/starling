/**
 * Read-only collection accessors for multi-collection queries.
 */

import type { StandardSchemaV1 } from "../standard-schema";
import type { AnyObjectSchema } from "../types";

type InferOutput<T> = T extends AnyObjectSchema
	? StandardSchemaV1.InferOutput<T>
	: never;

/**
 * Read-only accessor for a single collection.
 * Excludes all mutation methods (add, update, remove, merge).
 */
export type CollectionAccessor<Schema extends AnyObjectSchema> = {
	/** Get all items (excluding deleted) */
	getAll(): InferOutput<Schema>[];
	/** Get a single item by ID */
	get(id: string): InferOutput<Schema> | null;
	/** Find items matching a filter */
	find(filter: (item: InferOutput<Schema>) => boolean): InferOutput<Schema>[];
};

/**
 * Collection accessors for all collections in the database.
 */
export type CollectionAccessors<
	Schemas extends Record<string, AnyObjectSchema>,
> = {
	[K in keyof Schemas]: CollectionAccessor<Schemas[K]>;
};

/**
 * Create a read-only accessor for a collection with dependency tracking.
 *
 * @param collectionHandle - The collection handle to wrap
 * @param collectionKey - The collection key for tracking
 * @param trackAccess - Callback to record collection access
 */
export function createCollectionAccessor<Schema extends AnyObjectSchema>(
	collectionHandle: {
		getAll(): InferOutput<Schema>[];
		get(id: string): InferOutput<Schema> | null;
		find(
			filter: (item: InferOutput<Schema>) => boolean,
		): InferOutput<Schema>[];
	},
	collectionKey: string,
	trackAccess: (key: string) => void,
): CollectionAccessor<Schema> {
	return {
		getAll() {
			trackAccess(collectionKey);
			return collectionHandle.getAll();
		},

		get(id: string) {
			trackAccess(collectionKey);
			return collectionHandle.get(id);
		},

		find(filter) {
			trackAccess(collectionKey);
			return collectionHandle.find(filter);
		},
	};
}

/**
 * Create accessors for all collections in the database.
 *
 * @param db - The database instance
 * @param trackAccess - Callback to record collection access
 */
export function createCollectionAccessors<
	Schemas extends Record<string, AnyObjectSchema>,
>(
	db: any, // Database instance
	collectionKeys: (keyof Schemas)[],
	trackAccess: (key: string) => void,
): CollectionAccessors<Schemas> {
	const accessors = {} as CollectionAccessors<Schemas>;

	for (const key of collectionKeys) {
		const collectionHandle = db[key];
		accessors[key] = createCollectionAccessor(
			collectionHandle,
			key as string,
			trackAccess,
		);
	}

	return accessors;
}
