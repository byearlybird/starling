import {
	deleteResource,
	type JsonDocument,
	makeResource,
	mergeResources,
	type ResourceObject,
} from "../core";
import { createEmitter } from "./emitter";
import { type StandardSchemaV1, standardValidate } from "./standard-schema";
import type { AnyObjectSchema } from "./types";

/** Shorthand for extracting the data type from a schema */
type InferData<T extends AnyObjectSchema> = StandardSchemaV1.InferOutput<T>;

export type MutationBatch<T> = {
	added: Array<{ id: string; item: T }>;
	updated: Array<{ id: string; before: T; after: T }>;
	removed: Array<{ id: string; item: T }>;
};

export type CollectionMutationEvent<T> = MutationBatch<T>;

export type CollectionEvents<T> = {
	mutation: CollectionMutationEvent<T>;
};

/**
 * IDB-backed collection with lazy loading.
 * Resources are stored individually in IndexedDB and loaded on demand.
 */
export type IDBCollection<T extends AnyObjectSchema> = {
	get(
		id: string,
		opts?: { includeDeleted?: boolean },
	): Promise<InferData<T> | null>;
	getAll(opts?: { includeDeleted?: boolean }): Promise<InferData<T>[]>;
	find<U = InferData<T>>(
		filter: (item: InferData<T>) => boolean,
		opts?: {
			map?: (item: InferData<T>) => U;
			sort?: (a: U, b: U) => number;
		},
	): Promise<U[]>;
	add(item: StandardSchemaV1.InferInput<T>): Promise<InferData<T>>;
	update(
		id: string,
		updates: Partial<StandardSchemaV1.InferInput<T>>,
	): Promise<void>;
	remove(id: string): Promise<void>;
	merge(document: JsonDocument<InferData<T>>): Promise<void>;
	toDocument(): Promise<JsonDocument<InferData<T>>>;
	on(
		event: "mutation",
		handler: (payload: CollectionMutationEvent<InferData<T>>) => void,
	): () => void;
};

/**
 * Create an IDB-backed collection with lazy loading.
 * Resources are stored individually in IndexedDB (one per key).
 */
export function createIDBCollection<T extends AnyObjectSchema>(
	idb: IDBDatabase,
	name: string,
	schema: T,
	getId: (item: InferData<T>) => string,
	getEventstamp: () => string,
): IDBCollection<T> {
	const emitter = createEmitter<CollectionEvents<InferData<T>>>();

	// Helper: Get object store for transactions
	const getStore = (mode: IDBTransactionMode) => {
		const txn = idb.transaction([name], mode);
		return txn.objectStore(name);
	};

	// Helper: Wait for transaction to complete
	const waitForTransaction = (txn: IDBTransaction): Promise<void> => {
		return new Promise((resolve, reject) => {
			txn.oncomplete = () => resolve();
			txn.onerror = () => reject(txn.error);
		});
	};

	return {
		async get(
			id: string,
			opts: { includeDeleted?: boolean } = {},
		): Promise<InferData<T> | null> {
			const store = getStore("readonly");
			const request = store.get(id);

			const resource = await new Promise<ResourceObject<InferData<T>> | null>(
				(resolve, reject) => {
					request.onsuccess = () => resolve(request.result ?? null);
					request.onerror = () => reject(request.error);
				},
			);

			if (!resource) return null;

			if (!opts.includeDeleted && resource.meta.deletedAt) {
				return null;
			}

			return resource.attributes;
		},

		async getAll(
			opts: { includeDeleted?: boolean } = {},
		): Promise<InferData<T>[]> {
			const results: InferData<T>[] = [];
			const store = getStore("readonly");
			const request = store.openCursor();

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						const resource = cursor.value as ResourceObject<InferData<T>>;

						if (opts.includeDeleted || !resource.meta.deletedAt) {
							results.push(resource.attributes);
						}

						cursor.continue();
					} else {
						resolve(results);
					}
				};

				request.onerror = () => reject(request.error);
			});
		},

		async find<U = InferData<T>>(
			filter: (item: InferData<T>) => boolean,
			opts?: {
				map?: (item: InferData<T>) => U;
				sort?: (a: U, b: U) => number;
			},
		): Promise<U[]> {
			const results: U[] = [];
			const store = getStore("readonly");
			const request = store.openCursor();

			return new Promise((resolve, reject) => {
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						const resource = cursor.value as ResourceObject<InferData<T>>;

						// Skip deleted resources
						if (!resource.meta.deletedAt) {
							const attributes = resource.attributes;

							if (filter(attributes)) {
								const value = opts?.map ? opts.map(attributes) : (attributes as U);
								results.push(value);
							}
						}

						cursor.continue();
					} else {
						// Apply sorting if provided
						if (opts?.sort) {
							results.sort(opts.sort);
						}

						resolve(results);
					}
				};

				request.onerror = () => reject(request.error);
			});
		},

		async add(item: StandardSchemaV1.InferInput<T>): Promise<InferData<T>> {
			const validated = standardValidate(schema, item);
			const id = getId(validated);

			const txn = idb.transaction([name], "readwrite");
			const store = txn.objectStore(name);

			// Check if already exists
			const existingRequest = store.get(id);
			const existing = await new Promise<ResourceObject<InferData<T>> | null>(
				(resolve, reject) => {
					existingRequest.onsuccess = () =>
						resolve(existingRequest.result ?? null);
					existingRequest.onerror = () => reject(existingRequest.error);
				},
			);

			if (existing) {
				throw new DuplicateIdError(id);
			}

			// Create and store resource
			const resource = makeResource(name, id, validated, getEventstamp());
			const putRequest = store.put(resource);

			await new Promise<void>((resolve, reject) => {
				putRequest.onsuccess = () => resolve();
				putRequest.onerror = () => reject(putRequest.error);
			});

			// Wait for transaction to complete
			await waitForTransaction(txn);

			// Emit mutation event
			emitter.emit("mutation", {
				added: [{ id, item: validated }],
				updated: [],
				removed: [],
			});

			return validated;
		},

		async update(
			id: string,
			updates: Partial<StandardSchemaV1.InferInput<T>>,
		): Promise<void> {
			const txn = idb.transaction([name], "readwrite");
			const store = txn.objectStore(name);

			// Read existing
			const getRequest = store.get(id);
			const existing = await new Promise<ResourceObject<InferData<T>> | null>(
				(resolve, reject) => {
					getRequest.onsuccess = () => resolve(getRequest.result ?? null);
					getRequest.onerror = () => reject(getRequest.error);
				},
			);

			if (!existing) {
				throw new IdNotFoundError(id);
			}

			// Capture before state
			const before = existing.attributes;

			// Merge with updates
			const merged = mergeResources(
				existing,
				makeResource(name, id, updates, getEventstamp()),
			);

			// Validate merged result
			standardValidate(schema, merged.attributes);

			// Write back
			const putRequest = store.put(merged);
			await new Promise<void>((resolve, reject) => {
				putRequest.onsuccess = () => resolve();
				putRequest.onerror = () => reject(putRequest.error);
			});

			// Wait for transaction to complete
			await waitForTransaction(txn);

			// Emit mutation event
			emitter.emit("mutation", {
				added: [],
				updated: [{ id, before, after: merged.attributes }],
				removed: [],
			});
		},

		async remove(id: string): Promise<void> {
			const txn = idb.transaction([name], "readwrite");
			const store = txn.objectStore(name);

			// Read existing
			const getRequest = store.get(id);
			const existing = await new Promise<ResourceObject<InferData<T>> | null>(
				(resolve, reject) => {
					getRequest.onsuccess = () => resolve(getRequest.result ?? null);
					getRequest.onerror = () => reject(getRequest.error);
				},
			);

			if (!existing) {
				throw new IdNotFoundError(id);
			}

			// Capture item before deletion
			const item = existing.attributes;

			// Soft delete
			const removed = deleteResource(existing, getEventstamp());

			// Write back
			const putRequest = store.put(removed);
			await new Promise<void>((resolve, reject) => {
				putRequest.onsuccess = () => resolve();
				putRequest.onerror = () => reject(putRequest.error);
			});

			// Wait for transaction to complete
			await waitForTransaction(txn);

			// Emit mutation event
			emitter.emit("mutation", {
				added: [],
				updated: [],
				removed: [{ id, item }],
			});
		},

		async merge(document: JsonDocument<InferData<T>>): Promise<void> {
			const txn = idb.transaction([name], "readwrite");
			const store = txn.objectStore(name);

			const mutations: CollectionMutationEvent<InferData<T>> = {
				added: [],
				updated: [],
				removed: [],
			};

			// Process each resource in the remote document (partial merge)
			for (const remoteResource of document.data) {
				const id = remoteResource.id;

				// Read local resource if exists
				const getRequest = store.get(id);
				const localResource = await new Promise<ResourceObject<
					InferData<T>
				> | null>((resolve, reject) => {
					getRequest.onsuccess = () => resolve(getRequest.result ?? null);
					getRequest.onerror = () => reject(getRequest.error);
				});

				if (!localResource) {
					// New resource from remote
					const putRequest = store.put(remoteResource);
					await new Promise<void>((resolve, reject) => {
						putRequest.onsuccess = () => resolve();
						putRequest.onerror = () => reject(putRequest.error);
					});

					if (!remoteResource.meta.deletedAt) {
						mutations.added.push({ id, item: remoteResource.attributes });
					}
				} else {
					// Merge existing resource
					const before = localResource.attributes;
					const merged = mergeResources(localResource, remoteResource);

					// Validate merged result
					standardValidate(schema, merged.attributes);

					// Write back
					const putRequest = store.put(merged);
					await new Promise<void>((resolve, reject) => {
						putRequest.onsuccess = () => resolve();
						putRequest.onerror = () => reject(putRequest.error);
					});

					// Track state transitions
					const wasDeleted = localResource.meta.deletedAt !== null;
					const isDeleted = merged.meta.deletedAt !== null;

					if (!wasDeleted && isDeleted) {
						// Newly deleted
						mutations.removed.push({ id, item: before });
					} else if (!isDeleted) {
						// Updated (not deleted)
						if (localResource.meta.latest !== merged.meta.latest) {
							mutations.updated.push({ id, before, after: merged.attributes });
						}
					}
				}
			}

			// Wait for transaction to complete
			await waitForTransaction(txn);

			// Emit mutation events
			if (
				mutations.added.length > 0 ||
				mutations.updated.length > 0 ||
				mutations.removed.length > 0
			) {
				emitter.emit("mutation", mutations);
			}
		},

		async toDocument(): Promise<JsonDocument<InferData<T>>> {
			const resources: ResourceObject<InferData<T>>[] = [];
			const store = getStore("readonly");
			const request = store.openCursor();

			await new Promise<void>((resolve, reject) => {
				request.onsuccess = () => {
					const cursor = request.result;
					if (cursor) {
						resources.push(cursor.value as ResourceObject<InferData<T>>);
						cursor.continue();
					} else {
						resolve();
					}
				};

				request.onerror = () => reject(request.error);
			});

			// Find the latest eventstamp
			let latest = getEventstamp();
			for (const resource of resources) {
				if (resource.meta.latest > latest) {
					latest = resource.meta.latest;
				}
			}

			return {
				jsonapi: { version: "1.1" },
				meta: { latest },
				data: resources,
			};
		},

		on(event, handler) {
			return emitter.on(event, handler);
		},
	};
}

export class IdNotFoundError extends Error {
	constructor(id: string) {
		super(`Resource with id ${id} not found`);
		this.name = "IdNotFoundError";
	}
}

export class DuplicateIdError extends Error {
	constructor(id: string) {
		super(`Resource with id ${id} already exists`);
		this.name = "DuplicateIdError";
	}
}
