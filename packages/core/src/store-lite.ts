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
 * Transaction context for batching multiple operations with rollback support.
 *
 * All transaction operations are async.
 *
 * @example
 * ```ts
 * await store.begin(async (tx) => {
 *   const id = await tx.add({ name: 'Alice' });
 *   if (!isValid(await tx.get(id))) {
 *     tx.rollback(); // Abort all changes
 *   }
 * });
 * ```
 */
export type StoreLiteTransaction<T> = {
	/** Add a document and return its ID */
	add: (value: T, options?: StoreLiteAddOptions) => Promise<string>;
	/** Update a document with a partial value (field-level merge) */
	update: (key: string, value: DeepPartial<T>) => Promise<void>;
	/** Merge an encoded document (used by sync) */
	merge: (doc: EncodedDocument) => Promise<void>;
	/** Soft-delete a document */
	del: (key: string) => Promise<void>;
	/** Get a document within this transaction */
	get: (key: string) => Promise<T | null>;
	/** Abort the transaction and discard all changes */
	rollback: () => void;
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
 * // All mutations via transactions
 * const id = await store.begin(async (tx) => {
 *   const id = await tx.add({ text: 'Buy milk', completed: false });
 *   await tx.update(id, { completed: true });
 *   return id;
 * });
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
	 * Run multiple operations in a transaction with rollback support.
	 *
	 * All operations are batched and committed atomically.
	 *
	 * @param callback - Async function receiving a transaction context
	 * @returns The callback's return value
	 *
	 * @example
	 * ```ts
	 * const id = await store.begin(async (tx) => {
	 *   const newId = await tx.add({ text: 'Buy milk' });
	 *   await tx.update(newId, { priority: 'high' });
	 *   return newId; // Return value becomes begin()'s return value
	 * });
	 * ```
	 */
	async begin<R = void>(
		callback: (tx: StoreLiteTransaction<T>) => Promise<R>,
	): Promise<R> {
		// Load all current docs into staging
		const allEntries = await this.#adapter.entries();
		const staging = new Map<string, EncodedDocument>(allEntries);
		let rolledBack = false;

		const tx: StoreLiteTransaction<T> = {
			add: async (value, options) => {
				const key = options?.withId ?? this.#getId();
				staging.set(key, this.#encodeValue(key, value));
				return key;
			},
			update: async (key, value) => {
				const doc = encodeDoc(key, value as T, this.#clock.now());
				const prev = staging.get(key);
				const mergedDoc = prev ? mergeDocs(prev, doc)[0] : doc;
				staging.set(key, mergedDoc);
			},
			merge: async (doc) => {
				const existing = staging.get(doc["~id"]);
				const mergedDoc = existing ? mergeDocs(existing, doc)[0] : doc;
				staging.set(doc["~id"], mergedDoc);
			},
			del: async (key) => {
				const currentDoc = staging.get(key);
				if (!currentDoc) return;

				staging.set(key, deleteDoc(currentDoc, this.#clock.now()));
			},
			get: async (key) => this.#decodeActive(staging.get(key) ?? null),
			rollback: () => {
				rolledBack = true;
			},
		};

		const result = await callback(tx);

		if (!rolledBack) {
			// Commit staging back to adapter
			await this.#adapter.clear();
			for (const [key, doc] of staging.entries()) {
				await this.#adapter.set(key, doc);
			}
		}

		return result;
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
