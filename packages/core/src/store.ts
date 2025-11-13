import type { Document, ResourceObject } from "./crdt";
import { CRDT, decodeResource, mergeDocuments } from "./crdt";

type NotPromise<T> = T extends Promise<any> ? never : T;

type DeepPartial<T> = T extends object
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
	del: (key: string) => void;
	/** Get a document within this transaction */
	get: (key: string) => T | null;
	/** Abort the transaction and discard all changes */
	rollback: () => void;
};

/**
 * Plugin interface for extending store behavior with persistence, analytics, etc.
 *
 * All hooks are optional. Mutation hooks receive batched entries after each
 * transaction commits.
 *
 * @template T - The type of documents stored (must be a record/object type)
 *
 * @example
 * ```ts
 * const loggingPlugin: Plugin<Todo> = {
 *   onInit: async () => console.log('Store initialized'),
 *   onAdd: (entries) => console.log('Added:', entries.length),
 *   onDispose: async () => console.log('Store disposed')
 * };
 * ```
 */
export type Plugin<T extends Record<string, unknown>> = {
	/** Called once when store.init() runs */
	onInit: (store: Store<T>) => Promise<void> | void;
	/** Called once when store.dispose() runs */
	onDispose: () => Promise<void> | void;
	/** Called after documents are added (batched per transaction) */
	onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are updated (batched per transaction) */
	onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are deleted (batched per transaction) */
	onDelete?: (keys: ReadonlyArray<string>) => void;
};

/**
 * Configuration for creating a reactive query.
 *
 * Queries automatically update when matching documents change.
 *
 * @example
 * ```ts
 * const config: QueryConfig<Todo> = {
 *   where: (todo) => !todo.completed,
 *   select: (todo) => todo.text,
 *   order: (a, b) => a.localeCompare(b)
 * };
 * ```
 */
export type QueryConfig<T, U = T> = {
	/** Filter predicate - return true to include document in results */
	where: (data: T) => boolean;
	/** Optional projection - transform documents before returning */
	select?: (data: T) => U;
	/** Optional comparator for stable ordering of results */
	order?: (a: U, b: U) => number;
};

/**
 * A reactive query handle that tracks matching documents and notifies on changes.
 *
 * Call `dispose()` when done to clean up listeners and remove from the store.
 */
export type Query<U> = {
	/** Get current matching documents as [id, document] tuples */
	results: () => Array<readonly [string, U]>;
	/** Register a change listener. Returns unsubscribe function. */
	onChange: (callback: () => void) => () => void;
	/** Remove this query from the store and clear all listeners */
	dispose: () => void;
};

type QueryInternal<T, U> = {
	where: (data: T) => boolean;
	select?: (data: T) => U;
	order?: (a: U, b: U) => number;
	results: Map<string, U>;
	callbacks: Set<() => void>;
};

/**
 * Lightweight local-first data store with built-in sync and reactive queries.
 *
 * Stores plain JavaScript objects with automatic field-level conflict resolution
 * using Last-Write-Wins semantics powered by hybrid logical clocks.
 *
 * Per JSON:API specification, documents must be objects (not primitives).
 *
 * @template T - The type of documents stored (must be a record/object type)
 *
 * @example
 * ```ts
 * const store = await new Store<{ text: string; completed: boolean }>()
 *   .use(unstoragePlugin('todos', storage))
 *   .init();
 *
 * // Add, update, delete
 * const id = store.add({ text: 'Buy milk', completed: false });
 * store.update(id, { completed: true });
 * store.del(id);
 *
 * // Reactive queries
 * const activeTodos = store.query({ where: (todo) => !todo.completed });
 * activeTodos.onChange(() => console.log('Todos changed!'));
 * ```
 */
export class Store<T extends Record<string, unknown>> {
	#crdt = new CRDT<T>();
	#getId: () => string;

	#onInitHandlers: Array<Plugin<T>["onInit"]> = [];
	#onDisposeHandlers: Array<Plugin<T>["onDispose"]> = [];
	#onAddHandlers: Array<NonNullable<Plugin<T>["onAdd"]>> = [];
	#onUpdateHandlers: Array<NonNullable<Plugin<T>["onUpdate"]>> = [];
	#onDeleteHandlers: Array<NonNullable<Plugin<T>["onDelete"]>> = [];

	#queries = new Set<QueryInternal<T, any>>();

	constructor(config: StoreConfig = {}) {
		this.#getId = config.getId ?? (() => crypto.randomUUID());
	}

	/**
	 * Check if a document exists by ID.
	 * @param key - Document ID
	 * @param opts - Options object with includeDeleted flag
	 * @returns True if document exists, false otherwise
	 */
	has(key: string, opts: { includeDeleted?: boolean } = {}): boolean {
		return this.#crdt.has(key, opts);
	}

	/**
	 * Get a document by ID.
	 * @returns The document, or null if not found or deleted
	 */
	get(key: string): T | null {
		const current = this.#crdt.get(key);
		return current ?? null;
	}

	/**
	 * Iterate over all non-deleted documents as [id, document] tuples.
	 */
	entries(): IterableIterator<readonly [string, T]> {
		return this.#crdt.entries();
	}

	/**
	 * Get the complete store state as a JSON:API document for persistence or sync.
	 * @returns Document containing all resource objects and the latest eventstamp
	 */
	document(): Document {
		return this.#crdt.snapshot();
	}

	/**
	 * Merge a JSON:API document from storage or another replica using field-level LWW.
	 * @param document - Document from storage or another store instance
	 */
	merge(document: Document): void {
		const currentDocument = this.document();
		const result = mergeDocuments(currentDocument, document);

		// Replace the CRDT with the merged state
		this.#crdt = CRDT.fromSnapshot<T>(result.document);

		const addEntries = Array.from(result.changes.added.entries()).map(
			([key, resource]) => [key, decodeResource<T>(resource).data] as const,
		);
		const updateEntries = Array.from(result.changes.updated.entries()).map(
			([key, resource]) => [key, decodeResource<T>(resource).data] as const,
		);
		const deleteKeys = Array.from(result.changes.deleted);

		if (
			addEntries.length > 0 ||
			updateEntries.length > 0 ||
			deleteKeys.length > 0
		) {
			this.#emitMutations(addEntries, updateEntries, deleteKeys);
		}
	}

	/**
	 * Run multiple operations in a transaction with rollback support.
	 *
	 * @param callback - Function receiving a transaction context
	 * @param opts - Optional config. Use `silent: true` to skip plugin hooks.
	 * @returns The callback's return value
	 *
	 * @example
	 * ```ts
	 * const id = store.begin((tx) => {
	 *   const newId = tx.add({ text: 'Buy milk' });
	 *   tx.update(newId, { priority: 'high' });
	 *   return newId; // Return value becomes begin()'s return value
	 * });
	 * ```
	 */
	begin<R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	): NotPromise<R> {
		const silent = opts?.silent ?? false;

		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const deleteKeys: Array<string> = [];

		// Create a staging CRDT by cloning the current state
		const staging = CRDT.fromSnapshot<T>(this.#crdt.snapshot());
		let rolledBack = false;

		const tx: StoreSetTransaction<T> = {
			add: (value, options) => {
				const key = options?.withId ?? this.#getId();
				staging.add(key, value);
				addEntries.push([key, value] as const);
				return key;
			},
			update: (key, value) => {
				staging.update(key, value as Partial<T>);
				const merged = staging.get(key);
				if (merged !== undefined) {
					updateEntries.push([key, merged] as const);
				}
			},
			del: (key) => {
				if (!staging.has(key)) return;
				staging.delete(key);
				deleteKeys.push(key);
			},
			get: (key) => {
				const encoded = staging.cloneMap().get(key);
				return this.#decodeActive(encoded ?? null);
			},
			rollback: () => {
				rolledBack = true;
			},
		};

		const result = callback(tx);

		if (!rolledBack) {
			this.#crdt = staging;
			if (!silent) {
				this.#emitMutations(addEntries, updateEntries, deleteKeys);
			}
		}

		return result as NotPromise<R>;
	}

	/**
	 * Add a document to the store.
	 * @returns The document's ID (generated or provided via options)
	 */
	add(value: T, options?: StoreAddOptions): string {
		return this.begin((tx) => tx.add(value, options));
	}

	/**
	 * Update a document with a partial value.
	 *
	 * Uses field-level merge - only specified fields are updated.
	 */
	update(key: string, value: DeepPartial<T>): void {
		this.begin((tx) => tx.update(key, value));
	}

	/**
	 * Soft-delete a document.
	 *
	 * Deleted docs remain in snapshots for sync purposes but are
	 * excluded from queries and reads.
	 */
	del(key: string): void {
		this.begin((tx) => tx.del(key));
	}

	/**
	 * Register a plugin for persistence, analytics, etc.
	 * @returns This store instance for chaining
	 */
	use(plugin: Plugin<T>): this {
		this.#onInitHandlers.push(plugin.onInit);
		this.#onDisposeHandlers.push(plugin.onDispose);
		if (plugin.onAdd) this.#onAddHandlers.push(plugin.onAdd);
		if (plugin.onUpdate) this.#onUpdateHandlers.push(plugin.onUpdate);
		if (plugin.onDelete) this.#onDeleteHandlers.push(plugin.onDelete);
		return this;
	}

	/**
	 * Initialize the store and run plugin onInit hooks.
	 *
	 * Must be called before using the store. Runs plugin setup (hydrate
	 * snapshots, start pollers, etc.) and hydrates existing queries.
	 *
	 * @returns This store instance for chaining
	 */
	async init(): Promise<this> {
		for (const hook of this.#onInitHandlers) {
			await hook(this);
		}

		for (const query of this.#queries) {
			this.#hydrateQuery(query);
		}

		return this;
	}

	/**
	 * Dispose the store and run plugin cleanup.
	 *
	 * Flushes pending operations, clears queries, and runs plugin teardown.
	 * Call when shutting down to avoid memory leaks.
	 */
	async dispose(): Promise<void> {
		for (let i = this.#onDisposeHandlers.length - 1; i >= 0; i--) {
			await this.#onDisposeHandlers[i]?.();
		}

		for (const query of this.#queries) {
			query.callbacks.clear();
			query.results.clear();
		}

		this.#queries.clear();

		this.#onInitHandlers = [];
		this.#onDisposeHandlers = [];
		this.#onAddHandlers = [];
		this.#onUpdateHandlers = [];
		this.#onDeleteHandlers = [];
	}

	/**
	 * Create a reactive query that auto-updates when matching docs change.
	 *
	 * @example
	 * ```ts
	 * const active = store.query({ where: (todo) => !todo.completed });
	 * active.results(); // [[id, todo], ...]
	 * active.onChange(() => console.log('Updated!'));
	 * active.dispose(); // Clean up when done
	 * ```
	 */
	query<U = T>(config: QueryConfig<T, U>): Query<U> {
		const query: QueryInternal<T, U> = {
			where: config.where,
			select: config.select,
			order: config.order,
			results: new Map(),
			callbacks: new Set(),
		};

		this.#queries.add(query);
		this.#hydrateQuery(query);

		return {
			results: () => {
				if (query.order) {
					return Array.from(query.results).sort(([, a], [, b]) =>
						// biome-ignore lint/style/noNonNullAssertion: <guard above>
						query.order!(a, b),
					);
				}
				return Array.from(query.results);
			},
			onChange: (callback: () => void) => {
				query.callbacks.add(callback);
				return () => {
					query.callbacks.delete(callback);
				};
			},
			dispose: () => {
				this.#queries.delete(query);
				query.callbacks.clear();
				query.results.clear();
			},
		};
	}

	#decodeActive(resource: ResourceObject | null): T | null {
		if (!resource || resource.meta["~deletedAt"]) return null;
		return decodeResource<T>(resource).data;
	}

	#emitMutations(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		this.#notifyQueries(addEntries, updateEntries, deleteKeys);

		if (addEntries.length > 0) {
			for (const handler of this.#onAddHandlers) {
				handler(addEntries);
			}
		}
		if (updateEntries.length > 0) {
			for (const handler of this.#onUpdateHandlers) {
				handler(updateEntries);
			}
		}
		if (deleteKeys.length > 0) {
			for (const handler of this.#onDeleteHandlers) {
				handler(deleteKeys);
			}
		}
	}

	#notifyQueries(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		if (this.#queries.size === 0) return;
		const dirtyQueries = new Set<QueryInternal<T, any>>();

		if (addEntries.length > 0) {
			for (const [key, value] of addEntries) {
				for (const query of this.#queries) {
					if (query.where(value)) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (updateEntries.length > 0) {
			for (const [key, value] of updateEntries) {
				for (const query of this.#queries) {
					const matches = query.where(value);
					const inResults = query.results.has(key);

					if (matches && !inResults) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					} else if (!matches && inResults) {
						query.results.delete(key);
						dirtyQueries.add(query);
					} else if (matches && inResults) {
						const selected = this.#selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (deleteKeys.length > 0) {
			for (const key of deleteKeys) {
				for (const query of this.#queries) {
					if (query.results.delete(key)) {
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (dirtyQueries.size > 0) {
			this.#runQueryCallbacks(dirtyQueries);
		}
	}

	#runQueryCallbacks(dirtyQueries: Set<QueryInternal<T, any>>): void {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}
	}

	#hydrateQuery(query: QueryInternal<T, any>): void {
		query.results.clear();
		for (const [key, value] of this.entries()) {
			if (query.where(value)) {
				const selected = this.#selectValue(query, value);
				query.results.set(key, selected);
			}
		}
	}

	#selectValue<U>(query: QueryInternal<T, U>, value: T): U {
		return query.select ? query.select(value) : (value as unknown as U);
	}
}
