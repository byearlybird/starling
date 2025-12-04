import {
	deleteResource,
	makeResource,
	mergeResources,
	type ResourceObject,
} from "../core";
import type { IDBCollection } from "./idb-collection";
import type { CollectionConfigMap } from "./db-async";
import type { AnyObjectSchema, SchemasMap } from "./types";
import type { StandardSchemaV1 } from "./standard-schema";
import { standardValidate } from "./standard-schema";

/** Transaction-safe collection handle that excludes event subscription and serialization */
export type AsyncTransactionCollectionHandle<T extends AnyObjectSchema> = {
	get(id: string): Promise<StandardSchemaV1.InferOutput<T> | null>;
	getAll(): Promise<StandardSchemaV1.InferOutput<T>[]>;
	find<U = StandardSchemaV1.InferOutput<T>>(
		filter: (item: StandardSchemaV1.InferOutput<T>) => boolean,
		opts?: {
			map?: (item: StandardSchemaV1.InferOutput<T>) => U;
			sort?: (a: U, b: U) => number;
		},
	): Promise<U[]>;
	add(item: StandardSchemaV1.InferInput<T>): void;
	update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>): void;
	remove(id: string): void;
};

type AsyncTransactionCollectionHandles<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: AsyncTransactionCollectionHandle<Schemas[K]>;
};

export type AsyncTransactionContext<Schemas extends SchemasMap> =
	AsyncTransactionCollectionHandles<Schemas>;

type WriteOperation =
	| { type: "add"; collection: string; id: string; data: any }
	| { type: "update"; collection: string; id: string; updates: any }
	| { type: "remove"; collection: string; id: string };

/**
 * Execute an async transaction with read-your-writes semantics.
 *
 * Reads are cached in memory during the transaction.
 * Writes are buffered and committed atomically to IDB at the end.
 *
 * @param idb - IndexedDB database instance
 * @param configs - Collection configurations
 * @param getEventstamp - Function to generate eventstamps
 * @param callback - Transaction callback with tx context
 * @returns The return value from the callback
 */
export async function executeAsyncTransaction<Schemas extends SchemasMap, R>(
	idb: IDBDatabase,
	configs: CollectionConfigMap<Schemas>,
	getEventstamp: () => string,
	callback: (tx: AsyncTransactionContext<Schemas>) => Promise<R>,
): Promise<R> {
	// Track reads: collection -> id -> ResourceObject
	const readCache = new Map<
		string,
		Map<string, ResourceObject<any>>
	>();

	// Track writes: ordered list of operations
	const writeOps: WriteOperation[] = [];

	// Create transaction handles
	const txHandles = {} as AsyncTransactionCollectionHandles<Schemas>;

	for (const collectionName of Object.keys(
		configs,
	) as (keyof Schemas)[]) {
		const config = configs[collectionName];
		const collectionNameStr = String(collectionName);

		txHandles[collectionName] = createAsyncTransactionHandle(
			idb,
			collectionNameStr,
			config.schema,
			config.getId,
			getEventstamp,
			readCache,
			writeOps,
		);
	}

	// Execute user callback
	const result = await callback(txHandles);

	// Commit all writes in a single IDB transaction
	if (writeOps.length > 0) {
		await commitWrites(idb, writeOps, readCache, getEventstamp);
	}

	return result;
}

function createAsyncTransactionHandle<T extends AnyObjectSchema>(
	idb: IDBDatabase,
	collectionName: string,
	schema: T,
	getId: (item: StandardSchemaV1.InferOutput<T>) => string,
	getEventstamp: () => string,
	readCache: Map<string, Map<string, ResourceObject<any>>>,
	writeOps: WriteOperation[],
): AsyncTransactionCollectionHandle<T> {
	// Get or create cache for this collection
	const getCollectionCache = () => {
		if (!readCache.has(collectionName)) {
			readCache.set(collectionName, new Map());
		}
		return readCache.get(collectionName)!;
	};

	// Read a resource from IDB or cache
	const readResource = async (
		id: string,
	): Promise<ResourceObject<StandardSchemaV1.InferOutput<T>> | null> => {
		const cache = getCollectionCache();

		// Check cache first
		if (cache.has(id)) {
			return cache.get(id)!;
		}

		// Read from IDB
		const txn = idb.transaction([collectionName], "readonly");
		const store = txn.objectStore(collectionName);
		const request = store.get(id);

		const resource = await new Promise<ResourceObject<
			StandardSchemaV1.InferOutput<T>
		> | null>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});

		// Cache for future reads
		if (resource) {
			cache.set(id, resource);
		}

		return resource;
	};

	return {
		async get(id: string) {
			const resource = await readResource(id);
			if (!resource || resource.meta.deletedAt) return null;
			return resource.attributes;
		},

		async getAll() {
			// Scan collection
			const results: StandardSchemaV1.InferOutput<T>[] = [];
			const txn = idb.transaction([collectionName], "readonly");
			const store = txn.objectStore(collectionName);
			const request = store.openCursor();

			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						const resource = cursor.value as ResourceObject<
							StandardSchemaV1.InferOutput<T>
						>;

						// Cache the resource
						getCollectionCache().set(resource.id, resource);

						if (!resource.meta.deletedAt) {
							results.push(resource.attributes);
						}

						cursor.continue();
					} else {
						resolve();
					}
				};

				request.onerror = () => reject(request.error);
			});

			return results;
		},

		async find(filter, opts) {
			const all = await this.getAll();
			const filtered = all.filter(filter);

			const mapped = opts?.map ? filtered.map(opts.map) : (filtered as any[]);

			if (opts?.sort) {
				mapped.sort(opts.sort);
			}

			return mapped;
		},

		add(item: StandardSchemaV1.InferInput<T>) {
			const validated = standardValidate(schema, item);
			const id = getId(validated);

			writeOps.push({
				type: "add",
				collection: collectionName,
				id,
				data: validated,
			});
		},

		update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>) {
			writeOps.push({
				type: "update",
				collection: collectionName,
				id,
				updates,
			});
		},

		remove(id: string) {
			writeOps.push({
				type: "remove",
				collection: collectionName,
				id,
			});
		},
	};
}

async function commitWrites(
	idb: IDBDatabase,
	writeOps: WriteOperation[],
	readCache: Map<string, Map<string, ResourceObject<any>>>,
	getEventstamp: () => string,
): Promise<void> {
	// Determine which collections are involved
	const collections = [
		...new Set(writeOps.map((op) => op.collection)),
	];

	// Create single IDB transaction for all writes
	const txn = idb.transaction(collections, "readwrite");

	for (const op of writeOps) {
		const store = txn.objectStore(op.collection);

		if (op.type === "add") {
			const resource = makeResource(
				op.collection,
				op.id,
				op.data,
				getEventstamp(),
			);
			const request = store.put(resource);

			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		} else if (op.type === "update") {
			// Read existing (from cache or IDB)
			const collectionCache = readCache.get(op.collection);
			let existing = collectionCache?.get(op.id);

			if (!existing) {
				const request = store.get(op.id);
				existing = await new Promise((resolve, reject) => {
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
			}

			if (!existing) {
				throw new Error(`Resource with id ${op.id} not found`);
			}

			// Merge and write
			const merged = mergeResources(
				existing,
				makeResource(op.collection, op.id, op.updates, getEventstamp()),
			);

			const request = store.put(merged);
			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		} else if (op.type === "remove") {
			// Read existing
			const collectionCache = readCache.get(op.collection);
			let existing = collectionCache?.get(op.id);

			if (!existing) {
				const request = store.get(op.id);
				existing = await new Promise((resolve, reject) => {
					request.onsuccess = () => resolve(request.result);
					request.onerror = () => reject(request.error);
				});
			}

			if (!existing) {
				throw new Error(`Resource with id ${op.id} not found`);
			}

			// Soft delete
			const deleted = deleteResource(existing, getEventstamp());

			const request = store.put(deleted);
			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});
		}
	}

	// Wait for transaction to complete
	await new Promise<void>((resolve, reject) => {
		txn.oncomplete = () => resolve();
		txn.onerror = () => reject(txn.error);
	});
}
