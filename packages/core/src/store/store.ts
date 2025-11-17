import type { AnyObject, JsonDocument } from "../document";
import { mergeDocuments } from "../document";
import { ResourceMap } from "../resource-map/resource-map";
import { decodeActive } from "./utils";

type NotPromise<T> = T extends Promise<any> ? never : T;

type DeepPartial<T> = T extends Array<infer U>
	? Array<DeepPartial<U>>
	: T extends object
		? { [P in keyof T]?: DeepPartial<T[P]> }
		: T;

/**
 * Options for adding documents to the store.
 */
export type StoreAddOptions = {
	/** Provide a custom ID instead of generating one */
	withId?: string;
};

/**
 * Configuration options for creating a Store instance.
 */
export type StoreConfig = {
	/** Custom ID generator. Defaults to crypto.randomUUID() */
	getId?: () => string;
	/** Resource type identifier for this store. Defaults to "default" */
	type?: string;
};

/**
 * Transaction context for batching multiple operations with rollback support.
 *
 * Transactions allow you to group multiple mutations together and optionally
 * abort all changes if validation fails.
 *
 * @example
 * ```ts
 * store.begin((tx) => {
 *   const id = tx.add({ name: 'Alice' });
 *   if (!isValid(tx.get(id))) {
 *     tx.rollback(); // Abort all changes
 *   }
 * });
 * ```
 */
export type StoreSetTransaction<T> = {
	/** Add a document and return its ID */
	add: (value: T, options?: StoreAddOptions) => string;
	/** Update a document with a partial value (field-level merge) */
	update: (key: string, value: DeepPartial<T>) => void;
	/** Soft-delete a document */
	remove: (key: string) => void;
	/** Get a document within this transaction */
	get: (key: string) => T | null;
	/** Abort the transaction and discard all changes */
	rollback: () => void;
};

/**
 * Event listener callback types for store mutations.
 */
export type StoreEventListeners<T extends AnyObject> = {
	/** Called after documents are added (batched per transaction) */
	add: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are updated (batched per transaction) */
	update: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are removed (batched per transaction) */
	remove: (keys: ReadonlyArray<string>) => void;
};

/**
 * Event types that can be subscribed to.
 */
export type StoreEventType = keyof StoreEventListeners<any>;

/**
 * Lightweight local-first data store with event-based reactivity.
 *
 * Provides CRUD operations, transactions, and state-based sync with
 * simple event subscription for reactivity.
 *
 * @template T - The type of documents stored in this collection
 */
export type Store<T extends AnyObject> = {
	/** Check if a document exists by ID (excluding soft-deleted documents) */
	has: (key: string) => boolean;
	/** Get a document by ID (excluding soft-deleted documents) */
	get: (key: string) => T | null;
	/** Iterate over all non-deleted documents as [id, document] tuples */
	entries: () => IterableIterator<readonly [string, T]>;
	/** Get the complete store state as a JsonDocument for persistence or sync */
	collection: () => JsonDocument<T>;
	/** Merge a document from storage or another replica using field-level LWW */
	merge: (document: JsonDocument<T>) => void;
	/** Run multiple operations in a transaction with rollback support */
	begin: <R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	) => NotPromise<R>;
	/** Add a document to the store */
	add: (value: T, options?: StoreAddOptions) => string;
	/** Update a document with a partial value */
	update: (key: string, value: DeepPartial<T>) => void;
	/** Soft-delete a document */
	remove: (key: string) => void;
	/** Subscribe to store events. Returns unsubscribe function. */
	on: <E extends StoreEventType>(
		event: E,
		listener: StoreEventListeners<T>[E],
	) => () => void;
	/** Remove all event listeners and clean up resources */
	dispose: () => void;
};

/**
 * Create a lightweight local-first data store with built-in sync.
 *
 * Stores plain JavaScript objects with automatic field-level conflict resolution
 * using Last-Write-Wins semantics powered by hybrid logical clocks.
 *
 * @param collectionKey - Unique identifier for this collection (currently unused but reserved for future use)
 * @param config - Optional configuration for ID generation and resource type
 * @template T - The type of documents stored in this collection
 *
 * @example
 * ```ts
 * import { createStore } from '@byearlybird/starling';
 *
 * const store = createStore<{ text: string; completed: boolean }>('todos');
 *
 * // Add, update, delete
 * const id = store.add({ text: 'Buy milk', completed: false });
 * store.update(id, { completed: true });
 * store.remove(id);
 *
 * // Subscribe to changes
 * const unsubscribe = store.on('add', (entries) => {
 *   console.log('Added:', entries);
 * });
 *
 * // Clean up
 * unsubscribe();
 * store.dispose();
 * ```
 */
export function createStore<T extends AnyObject>(
	collectionKey: string,
	config: StoreConfig = {},
): Store<T> {
	const type = config.type ?? collectionKey;
	let crdt = new ResourceMap<T>(type);
	const getId = config.getId ?? (() => crypto.randomUUID());

	const addListeners = new Set<StoreEventListeners<T>["add"]>();
	const updateListeners = new Set<StoreEventListeners<T>["update"]>();
	const removeListeners = new Set<StoreEventListeners<T>["remove"]>();

	function emitMutations(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		removeKeys: ReadonlyArray<string>,
	): void {
		if (addEntries.length > 0) {
			for (const listener of addListeners) {
				listener(addEntries);
			}
		}
		if (updateEntries.length > 0) {
			for (const listener of updateListeners) {
				listener(updateEntries);
			}
		}
		if (removeKeys.length > 0) {
			for (const listener of removeListeners) {
				listener(removeKeys);
			}
		}
	}

	function has(key: string): boolean {
		const resource = crdt.get(key);
		return resource != null && !resource.meta.deletedAt;
	}

	function get(key: string): T | null {
		const current = crdt.get(key);
		return decodeActive(current ?? null);
	}

	function* entries(): IterableIterator<readonly [string, T]> {
		for (const [key, resource] of crdt.entries()) {
			if (!resource.meta.deletedAt) {
				yield [key, resource.attributes as T] as const;
			}
		}
	}

	function collection(): JsonDocument<T> {
		return crdt.toDocument();
	}

	function merge(document: JsonDocument<T>): void {
		const currentCollection = collection();
		const result = mergeDocuments<T>(currentCollection, document);

		// Replace the ResourceMap with the merged state
		crdt = ResourceMap.fromDocument<T>(type, result.document);

		// Emit changes for each type
		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const removeKeys: Array<string> = [];

		// Convert added resources to entries
		for (const [id, resource] of result.changes.added) {
			if (!resource.meta.deletedAt) {
				addEntries.push([id, resource.attributes as T]);
			}
		}

		// Convert updated resources to entries
		for (const [id, resource] of result.changes.updated) {
			if (!resource.meta.deletedAt) {
				updateEntries.push([id, resource.attributes as T]);
			}
		}

		// Convert removed resource IDs
		for (const id of result.changes.deleted) {
			removeKeys.push(id);
		}

		// Emit mutations if there are any changes
		if (
			addEntries.length > 0 ||
			updateEntries.length > 0 ||
			removeKeys.length > 0
		) {
			emitMutations(addEntries, updateEntries, removeKeys);
		}
	}

	function begin<R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	): NotPromise<R> {
		const silent = opts?.silent ?? false;

		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const removeKeys: Array<string> = [];

		// Create a staging ResourceMap by cloning the current state
		const staging = ResourceMap.fromDocument<T>(type, crdt.toDocument());
		let rolledBack = false;

		const tx: StoreSetTransaction<T> = {
			add: (value, options) => {
				const key = options?.withId ?? getId();
				staging.set(key, value);
				addEntries.push([key, value] as const);
				return key;
			},
			update: (key, value) => {
				staging.set(key, value as Partial<T>);
				const merged = staging.get(key);
				if (merged !== undefined) {
					updateEntries.push([key, merged.attributes as T] as const);
				}
			},
			remove: (key) => {
				if (!staging.has(key)) return;
				staging.delete(key);
				removeKeys.push(key);
			},
			get: (key) => {
				const encoded = staging.get(key);
				return decodeActive(encoded ?? null);
			},
			rollback: () => {
				rolledBack = true;
			},
		};
		const result = callback(tx);

		if (!rolledBack) {
			crdt = staging;
			if (!silent) {
				emitMutations(addEntries, updateEntries, removeKeys);
			}
		}

		return result as NotPromise<R>;
	}

	function add(value: T, options?: StoreAddOptions): string {
		return begin((tx) => tx.add(value, options));
	}

	function update(key: string, value: DeepPartial<T>): void {
		begin((tx) => tx.update(key, value));
	}

	function remove(key: string): void {
		begin((tx) => tx.remove(key));
	}

	function on<E extends StoreEventType>(
		event: E,
		listener: StoreEventListeners<T>[E],
	): () => void {
		if (event === "add") {
			addListeners.add(listener as StoreEventListeners<T>["add"]);
			return () =>
				addListeners.delete(listener as StoreEventListeners<T>["add"]);
		}
		if (event === "update") {
			updateListeners.add(listener as StoreEventListeners<T>["update"]);
			return () =>
				updateListeners.delete(listener as StoreEventListeners<T>["update"]);
		}
		if (event === "remove") {
			removeListeners.add(listener as StoreEventListeners<T>["remove"]);
			return () =>
				removeListeners.delete(listener as StoreEventListeners<T>["remove"]);
		}
		throw new Error(`Unknown event type: ${event}`);
	}

	function dispose(): void {
		addListeners.clear();
		updateListeners.clear();
		removeListeners.clear();
	}

	const store: Store<T> = {
		has,
		get,
		entries,
		collection,
		merge,
		begin,
		add,
		update,
		remove,
		on,
		dispose,
	};

	return store;
}
