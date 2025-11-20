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
 * Uses the same delegation pattern as CollectionHandle but excludes mutations.
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
	// Simple delegation pattern (matches createCollectionHandle style)
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
 * Follows the same pattern as makeHandles() in db.ts.
 *
 * @param db - The database instance
 * @param collectionKeys - Keys of collections to create accessors for
 * @param trackAccess - Callback to record collection access
 */
export function createCollectionAccessors<
	Schemas extends Record<string, AnyObjectSchema>,
>(
	db: any,
	collectionKeys: (keyof Schemas)[],
	trackAccess: (key: string) => void,
): CollectionAccessors<Schemas> {
	const accessors = {} as CollectionAccessors<Schemas>;

	// Same iteration pattern as makeHandles()
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

/**
 * Database method names that should be excluded when extracting collection keys.
 */
const DB_METHOD_NAMES = [
	"begin",
	"toDocuments",
	"on",
	"init",
	"dispose",
] as const;

/**
 * Create collection accessors for all collections in a database.
 *
 * Automatically extracts collection keys by filtering out database methods.
 * This is the DRY helper used by createQuery() and multi-collection queries.
 *
 * @param db - Database instance
 * @param trackAccess - Optional callback to track which collections are accessed
 */
export function createAccessorsForDatabase<
	Schemas extends Record<string, AnyObjectSchema>,
>(
	db: any,
	trackAccess?: (key: string) => void,
): CollectionAccessors<Schemas> {
	// Extract collection keys (same logic as in createQuery)
	const collectionKeys = Object.keys(db).filter(
		(key) => !DB_METHOD_NAMES.includes(key as any),
	) as (keyof Schemas)[];

	return createCollectionAccessors(
		db,
		collectionKeys,
		trackAccess ?? (() => {}),
	);
}
