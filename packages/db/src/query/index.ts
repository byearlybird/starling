import type { Database } from "../db";
import type { AnyObjectSchema } from "../types";
import type { StandardSchemaV1 } from "../standard-schema";

type InferOutput<T> = T extends AnyObjectSchema
	? StandardSchemaV1.InferOutput<T>
	: never;

/**
 * Query handle for reactive queries.
 */
export type Query<T> = {
	/** Get current results (computed on-demand) */
	results(): T[];
	/** Register a change listener. Returns unsubscribe function. */
	onChange(callback: () => void): () => void;
	/** Dispose this query and clean up listeners */
	dispose(): void;
};

/**
 * Collection accessor interface for multi-collection queries.
 * Provides read-only access to collection data.
 */
type CollectionAccessor<Schema extends AnyObjectSchema> = {
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
type CollectionAccessors<Schemas extends Record<string, AnyObjectSchema>> = {
	[K in keyof Schemas]: CollectionAccessor<Schemas[K]>;
};

// ============================================================================
// Single-Collection Query
// ============================================================================

/**
 * Create a reactive query for a single collection.
 *
 * Mirrors the `collection.find()` API but with automatic reactivity.
 *
 * @example
 * ```typescript
 * const activeTodos = createQuery(db, "todos",
 *   (todo) => !todo.completed,
 *   {
 *     map: (todo) => todo.text,
 *     sort: (a, b) => a.localeCompare(b)
 *   }
 * );
 *
 * console.log(activeTodos.results()); // string[]
 * activeTodos.onChange(() => console.log("Changed!"));
 * activeTodos.dispose();
 * ```
 */
export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	K extends keyof Schemas,
	U = InferOutput<Schemas[K]>,
>(
	db: Database<Schemas>,
	collectionKey: K,
	filter: (item: InferOutput<Schemas[K]>) => boolean,
	opts?: {
		map?: (item: InferOutput<Schemas[K]>) => U;
		sort?: (a: U, b: U) => number;
	},
): Query<U>;

// ============================================================================
// Multi-Collection Query (Callback)
// ============================================================================

/**
 * Create a reactive query across multiple collections using a compute function.
 *
 * The compute function receives typed accessors for all collections and returns
 * the desired result array. The query automatically tracks which collections are
 * accessed and subscribes to their mutations.
 *
 * @example
 * ```typescript
 * const todosWithOwners = createQuery(db, (collections) => {
 *   const results = [];
 *   const todos = collections.todos.find(t => !t.completed);
 *   const users = collections.users.getAll();
 *
 *   for (const todo of todos) {
 *     const owner = users.find(u => u.id === todo.ownerId);
 *     if (owner) {
 *       results.push({
 *         id: todo.id,
 *         text: todo.text,
 *         ownerName: owner.name
 *       });
 *     }
 *   }
 *
 *   return results;
 * });
 * ```
 */
export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	Result,
>(
	db: Database<Schemas>,
	compute: (collections: CollectionAccessors<Schemas>) => Result[],
): Query<Result>;

// ============================================================================
// Implementation
// ============================================================================

export function createQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	K extends keyof Schemas,
	U,
	Result,
>(
	db: Database<Schemas>,
	collectionKeyOrCompute:
		| K
		| ((collections: CollectionAccessors<Schemas>) => Result[]),
	filter?: (item: InferOutput<Schemas[K]>) => boolean,
	opts?: {
		map?: (item: InferOutput<Schemas[K]>) => U;
		sort?: (a: U, b: U) => number;
	},
): Query<U> | Query<Result> {
	// Single-collection query
	if (typeof collectionKeyOrCompute === "string") {
		return createSingleCollectionQuery(
			db,
			collectionKeyOrCompute as K,
			filter!,
			opts,
		);
	}

	// Multi-collection query
	return createMultiCollectionQuery(
		db,
		collectionKeyOrCompute as (
			collections: CollectionAccessors<Schemas>,
		) => Result[],
	);
}

// ============================================================================
// Single-Collection Query Implementation
// ============================================================================

function createSingleCollectionQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	K extends keyof Schemas,
	U,
>(
	db: Database<Schemas>,
	collectionKey: K,
	filter: (item: InferOutput<Schemas[K]>) => boolean,
	opts?: {
		map?: (item: InferOutput<Schemas[K]>) => U;
		sort?: (a: U, b: U) => number;
	},
): Query<U> {
	const collection = db[collectionKey];
	const resultMap = new Map<string, U>();
	const callbacks = new Set<() => void>();

	// Helper to get ID from item (assuming getId exists on collection)
	const getId = (item: InferOutput<Schemas[K]>): string => {
		// @ts-expect-error - accessing internal getId
		return (db as any)._getCollectionConfig(collectionKey).getId(item);
	};

	// Initial hydration
	const items = collection.getAll();
	for (const item of items) {
		if (filter(item)) {
			const id = getId(item);
			const value = opts?.map ? opts.map(item) : (item as unknown as U);
			resultMap.set(id, value);
		}
	}

	// Subscribe to collection mutations
	const unsubscribe = collection.on("mutation", (event) => {
		let dirty = false;

		// Handle added items
		for (const { id, item } of event.added) {
			if (filter(item)) {
				const value = opts?.map ? opts.map(item) : (item as unknown as U);
				resultMap.set(id, value);
				dirty = true;
			}
		}

		// Handle updated items
		for (const { id, after } of event.updated) {
			const matches = filter(after);
			const inResults = resultMap.has(id);

			if (matches && !inResults) {
				const value = opts?.map ? opts.map(after) : (after as unknown as U);
				resultMap.set(id, value);
				dirty = true;
			} else if (!matches && inResults) {
				resultMap.delete(id);
				dirty = true;
			} else if (matches && inResults) {
				const value = opts?.map ? opts.map(after) : (after as unknown as U);
				resultMap.set(id, value);
				dirty = true;
			}
		}

		// Handle removed items
		for (const { id } of event.removed) {
			if (resultMap.delete(id)) {
				dirty = true;
			}
		}

		// Notify listeners if anything changed
		if (dirty) {
			for (const callback of callbacks) {
				callback();
			}
		}
	});

	return {
		results() {
			const arr = Array.from(resultMap.values());
			if (opts?.sort) {
				arr.sort(opts.sort);
			}
			return arr;
		},

		onChange(callback) {
			callbacks.add(callback);
			return () => callbacks.delete(callback);
		},

		dispose() {
			unsubscribe();
			callbacks.clear();
			resultMap.clear();
		},
	};
}

// ============================================================================
// Multi-Collection Query Implementation
// ============================================================================

function createMultiCollectionQuery<
	Schemas extends Record<string, AnyObjectSchema>,
	Result,
>(
	db: Database<Schemas>,
	compute: (collections: CollectionAccessors<Schemas>) => Result[],
): Query<Result> {
	const callbacks = new Set<() => void>();
	const unsubscribers: Array<() => void> = [];
	let cachedResults: Result[] | null = null;
	let isDirty = true;

	// Track which collections are accessed during compute
	const accessedCollections = new Set<keyof Schemas>();

	// Create collection accessors with tracking
	const createAccessors = (): CollectionAccessors<Schemas> => {
		const accessors = {} as CollectionAccessors<Schemas>;

		for (const collectionKey of Object.keys(db) as (keyof Schemas)[]) {
			// Skip non-collection properties
			if (
				collectionKey === "begin" ||
				collectionKey === "toDocuments" ||
				collectionKey === "on" ||
				collectionKey === "init" ||
				collectionKey === "dispose"
			) {
				continue;
			}

			const collection = db[collectionKey];

			accessors[collectionKey] = {
				getAll() {
					accessedCollections.add(collectionKey);
					return collection.getAll();
				},
				get(id: string) {
					accessedCollections.add(collectionKey);
					return collection.get(id);
				},
				find(filter) {
					accessedCollections.add(collectionKey);
					return collection.find(filter);
				},
			} as CollectionAccessor<Schemas[typeof collectionKey]>;
		}

		return accessors;
	};

	// Initial computation to discover dependencies
	const accessors = createAccessors();
	cachedResults = compute(accessors);
	isDirty = false;

	// Subscribe to all accessed collections
	for (const collectionKey of accessedCollections) {
		const collection = db[collectionKey];
		const unsub = collection.on("mutation", () => {
			isDirty = true;
			cachedResults = null;

			// Notify all listeners
			for (const callback of callbacks) {
				callback();
			}
		});
		unsubscribers.push(unsub);
	}

	return {
		results() {
			// Recompute if dirty
			if (isDirty || cachedResults === null) {
				const accessors = createAccessors();
				cachedResults = compute(accessors);
				isDirty = false;
			}
			return cachedResults;
		},

		onChange(callback) {
			callbacks.add(callback);
			return () => callbacks.delete(callback);
		},

		dispose() {
			// Unsubscribe from all collections
			for (const unsub of unsubscribers) {
				unsub();
			}
			callbacks.clear();
			cachedResults = null;
		},
	};
}
