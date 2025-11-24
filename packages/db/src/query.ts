import type { Collection } from "./collection";
import type { Database } from "./db";
import type { AnyObjectSchema, SchemasMap } from "./types";

/** Read-only collection handle for queries */
export type QueryCollectionHandle<T extends AnyObjectSchema> = Pick<
	Collection<T>,
	"get" | "getAll" | "find"
>;

/** Query context with read-only collection handles */
export type QueryContext<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: QueryCollectionHandle<Schemas[K]>;
};

/** Handle returned by db.query() for managing the reactive query */
export type QueryHandle<R> = {
	/** Current query result */
	readonly result: R;
	/** Subscribe to result changes. Returns unsubscribe function. */
	subscribe(callback: (result: R) => void): () => void;
	/** Stop tracking and clean up subscriptions */
	dispose(): void;
};

/**
 * Execute a reactive query with automatic re-computation on mutations.
 *
 * @param db - Database instance to query
 * @param callback - Query callback receiving read-only collection handles
 * @returns QueryHandle with result, subscribe, and dispose methods
 */
export function executeQuery<Schemas extends SchemasMap, R>(
	db: Database<Schemas>,
	callback: (ctx: QueryContext<Schemas>) => R,
): QueryHandle<R> {
	// Track which collections are accessed
	const accessedCollections = new Set<keyof Schemas>();

	// Subscribers to notify on result changes
	const subscribers = new Set<(result: R) => void>();

	// Current result
	let currentResult: R;

	// Create tracking handles for each collection
	const createTrackingHandles = (): QueryContext<Schemas> => {
		const handles = {} as QueryContext<Schemas>;

		for (const name of db.collectionKeys()) {
			const collection = db[name] as Collection<Schemas[typeof name]>;

			handles[name] = createTrackingHandle(
				name,
				collection,
				accessedCollections,
			);
		}

		return handles;
	};

	// Run the query and capture result
	const runQuery = (): R => {
		const handles = createTrackingHandles();
		return callback(handles);
	};

	// Initial execution
	currentResult = runQuery();

	// Subscribe to database mutations
	const unsubscribeMutation = db.on("mutation", (event) => {
		// Only re-run if the mutated collection was accessed
		if (accessedCollections.has(event.collection)) {
			currentResult = runQuery();

			// Notify all subscribers
			for (const subscriber of subscribers) {
				subscriber(currentResult);
			}
		}
	});

	let disposed = false;

	return {
		get result() {
			return currentResult;
		},

		subscribe(callback) {
			if (disposed) {
				throw new Error("Cannot subscribe to a disposed query");
			}

			subscribers.add(callback);

			return () => {
				subscribers.delete(callback);
			};
		},

		dispose() {
			if (disposed) return;

			disposed = true;
			unsubscribeMutation();
			subscribers.clear();
			accessedCollections.clear();
		},
	};
}

/**
 * Create a read-only collection handle that tracks access.
 */
function createTrackingHandle<
	Schemas extends SchemasMap,
	K extends keyof Schemas,
>(
	name: K,
	collection: Collection<Schemas[K]>,
	accessedCollections: Set<keyof Schemas>,
): QueryCollectionHandle<Schemas[K]> {
	const trackAccess = () => {
		accessedCollections.add(name);
	};

	return {
		get(id, opts) {
			trackAccess();
			return collection.get(id, opts);
		},

		getAll(opts) {
			trackAccess();
			return collection.getAll(opts);
		},

		find(filter, opts) {
			trackAccess();
			return collection.find(filter, opts);
		},
	};
}
