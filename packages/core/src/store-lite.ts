import { Clock } from "./clock";
import type { StoreAdapter } from "./adapter";
import type { Collection, EncodedDocument } from "./crdt";
import {
	decodeDoc,
	deleteDoc,
	encodeDoc,
	mergeCollections,
	mergeDocs,
} from "./crdt";

type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

/**
 * Options for adding documents to the store.
 */
export type StoreLiteAddOptions = {
	/** Provide a custom ID instead of generating one */
	withId?: string;
};

/**
 * Configuration options for creating a StoreLite instance.
 */
export type StoreLiteConfig = {
	/** Storage adapter for async persistence */
	adapter: StoreAdapter<EncodedDocument>;
	/** Custom ID generator. Defaults to crypto.randomUUID() */
	getId?: () => string;
};


/**
 * Lightweight async data store without queries or plugins.
 *
 * StoreLite focuses on CRDT sync and async storage adapters.
 * Bring your own query library (TanStack Query, MobX, etc.)
 *
 * @template T - The type of documents stored in this collection
 *
 * @example
 * ```ts
 * import { StoreLite } from "@byearlybird/starling/lite";
 * import { InMemoryAdapter } from "@byearlybird/starling/adapter/memory";
 *
 * const store = await new StoreLite<Todo>({
 *   adapter: new InMemoryAdapter()
 * }).init();
 *
 * // Direct mutation methods
 * const id = await store.add({ text: 'Buy milk', completed: false });
 * await store.update(id, { completed: true });
 * await store.del(id);
 * ```
 */
export class StoreLite<T> {
	#adapter: StoreAdapter<EncodedDocument>;
	#clock = new Clock();
	#getId: () => string;

	constructor(config: StoreLiteConfig) {
		this.#adapter = config.adapter;
		this.#getId = config.getId ?? (() => crypto.randomUUID());
	}

	/**
	 * Get a document by ID.
	 * @returns The document, or null if not found or deleted
	 */
	async get(key: string): Promise<T | null> {
		const doc = await this.#adapter.get(key);
		return this.#decodeActive(doc ?? null);
	}

	/**
	 * Get all non-deleted documents as [id, document] tuples.
	 */
	async entries(): Promise<Array<readonly [string, T]>> {
		const allEntries = await this.#adapter.entries();
		const result: Array<readonly [string, T]> = [];

		for (const [key, doc] of allEntries) {
			const data = this.#decodeActive(doc);
			if (data !== null) {
				result.push([key, data] as const);
			}
		}

		return result;
	}

	/**
	 * Get the complete store state as a Collection for persistence or sync.
	 * @returns Collection containing all documents and the latest eventstamp
	 */
	async collection(): Promise<Collection> {
		const allEntries = await this.#adapter.entries();
		return {
			"~docs": allEntries.map(([_, doc]) => doc),
			"~eventstamp": this.#clock.latest(),
		};
	}

	/**
	 * Merge a collection from storage or another replica using field-level LWW.
	 * @param collection - Collection from storage or another store instance
	 */
	async merge(collection: Collection): Promise<void> {
		const currentCollection = await this.collection();
		const result = mergeCollections(currentCollection, collection);

		this.#clock.forward(result.collection["~eventstamp"]);

		// Clear and rebuild adapter with merged docs
		await this.#adapter.clear();
		for (const doc of result.collection["~docs"]) {
			await this.#adapter.set(doc["~id"], doc);
		}
	}

	/**
	 * Add a document to the store.
	 *
	 * @param value - The document to add
	 * @param options - Optional configuration
	 * @returns The document's ID (generated or provided via options)
	 *
	 * @example
	 * ```ts
	 * const id = await store.add({ text: 'Buy milk', completed: false });
	 * await store.add({ text: 'Task 2' }, { withId: 'custom-id' });
	 * ```
	 */
	async add(value: T, options?: StoreLiteAddOptions): Promise<string> {
		const key = options?.withId ?? this.#getId();
		const doc = this.#encodeValue(key, value);
		await this.#adapter.set(key, doc);
		return key;
	}

	/**
	 * Update a document with a partial value (field-level merge).
	 *
	 * Uses CRDT field-level LWW - only specified fields are updated.
	 *
	 * @param key - The document ID
	 * @param value - Partial document with fields to update
	 *
	 * @example
	 * ```ts
	 * await store.update('todo-1', { completed: true });
	 * ```
	 */
	async update(key: string, value: DeepPartial<T>): Promise<void> {
		const existing = await this.#adapter.get(key);
		const updateDoc = encodeDoc(key, value as T, this.#clock.now());
		const mergedDoc = existing ? mergeDocs(existing, updateDoc)[0] : updateDoc;
		await this.#adapter.set(key, mergedDoc);
	}

	/**
	 * Soft-delete a document.
	 *
	 * Deleted docs remain in storage for sync purposes but are
	 * excluded from queries and reads.
	 *
	 * @param key - The document ID
	 *
	 * @example
	 * ```ts
	 * await store.del('todo-1');
	 * ```
	 */
	async del(key: string): Promise<void> {
		const existing = await this.#adapter.get(key);
		if (!existing) return;

		const deletedDoc = deleteDoc(existing, this.#clock.now());
		await this.#adapter.set(key, deletedDoc);
	}

	/**
	 * Initialize the store.
	 *
	 * Must be called before using the store.
	 *
	 * @returns This store instance for chaining
	 */
	async init(): Promise<this> {
		return this;
	}

	/**
	 * Dispose the store and clean up resources.
	 *
	 * Call when shutting down to avoid memory leaks.
	 */
	async dispose(): Promise<void> {
		await this.#adapter.clear();
	}

	#encodeValue(key: string, value: T): EncodedDocument {
		return encodeDoc(key, value, this.#clock.now());
	}

	#decodeActive(doc: EncodedDocument | null): T | null {
		if (!doc || doc["~deletedAt"]) return null;
		return decodeDoc<T>(doc)["~data"];
	}
}
