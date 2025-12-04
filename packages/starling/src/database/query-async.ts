import type { IDBCollection } from "./idb-collection";
import type { AsyncDatabase } from "./db-async";
import type { AnyObjectSchema, SchemasMap } from "./types";

/** Read-only collection handle for queries */
export type AsyncQueryCollectionHandle<T extends AnyObjectSchema> = Pick<
	IDBCollection<T>,
	"get" | "getAll" | "find"
>;

/** Query context with read-only collection handles */
export type AsyncQueryContext<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: AsyncQueryCollectionHandle<Schemas[K]>;
};

/** Handle returned by db.query() for managing the reactive query */
export type AsyncQueryHandle<R> = {
	/** Current query result (may be undefined initially) */
	readonly result: R | undefined;
	/** Subscribe to result changes. Returns unsubscribe function. */
	subscribe(callback: (result: R) => void): () => void;
	/** Stop tracking and clean up subscriptions */
	dispose(): void;
};

/**
 * Execute a reactive query with automatic re-computation on mutations.
 *
 * @param db - Database instance to query
 * @param callback - Async query callback receiving read-only collection handles
 * @returns QueryHandle with result, subscribe, and dispose methods
 */
export function executeAsyncQuery<Schemas extends SchemasMap, R>(
	db: AsyncDatabase<Schemas>,
	callback: (ctx: AsyncQueryContext<Schemas>) => Promise<R>,
): AsyncQueryHandle<R> {
	// Track which collections are accessed
	const accessedCollections = new Set<keyof Schemas>();

	// Subscribers to notify on result changes
	const subscribers = new Set<(result: R) => void>();

	// Current result (may be undefined initially)
	let currentResult: R | undefined;

	// Create tracking handles for each collection
	const createTrackingHandles = (): AsyncQueryContext<Schemas> => {
		const handles = {} as AsyncQueryContext<Schemas>;

		for (const name of db.collectionKeys()) {
			const collection = db[name] as IDBCollection<Schemas[typeof name]>;

			handles[name] = createTrackingHandle(
				name,
				collection,
				accessedCollections,
			);
		}

		return handles;
	};

	// Run the query and capture result
	const runQuery = async (): Promise<R> => {
		const handles = createTrackingHandles();
		return await callback(handles);
	};

	// Initial execution (async)
	runQuery().then((result) => {
		currentResult = result;
	});

	// Subscribe to database mutations
	const unsubscribeMutation = db.on("mutation", async (event) => {
		// Only re-run if the mutated collection was accessed
		if (accessedCollections.has(event.collection)) {
			currentResult = await runQuery();

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
	collection: IDBCollection<Schemas[K]>,
	accessedCollections: Set<keyof Schemas>,
): AsyncQueryCollectionHandle<Schemas[K]> {
	const trackAccess = () => {
		accessedCollections.add(name);
	};

	return {
		async get(id, opts) {
			trackAccess();
			return await collection.get(id, opts);
		},

		async getAll(opts) {
			trackAccess();
			return await collection.getAll(opts);
		},

		async find(filter, opts) {
			trackAccess();
			return await collection.find(filter, opts);
		},
	};
}
