/** biome-ignore-all lint/complexity/noBannedTypes: <{} used to default to empty> */
/** biome-ignore-all lint/suspicious/noExplicitAny: <useful to preserve inference> */
import type { Collection, EncodedDocument } from "./crdt";
import {
	createClock,
	decodeDoc,
	deleteDoc,
	encodeDoc,
	mergeCollections,
	mergeDocs,
} from "./crdt";

/**
 * Type constraint to prevent Promise returns from set callbacks.
 * Transactions must be synchronous operations.
 */
type NotPromise<T> = T extends Promise<any> ? never : T;

// Internal utility types
type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

/**
 * Options for adding documents to the store.
 *
 * @example
 * ```typescript
 * // Let store auto-generate an ID
 * store.add({ name: "Alice" });
 *
 * // Provide a custom ID
 * store.add({ name: "Bob" }, { withId: "user-1" });
 * ```
 */
export type StoreAddOptions = {
	/**
	 * Optional custom ID for the document.
	 * If not provided, the store will generate a UUID.
	 */
	withId?: string;
};

/**
 * Transaction API for batching multiple store operations.
 *
 * All operations are staged in memory until the transaction callback completes.
 * If the callback throws or `rollback()` is called, all changes are discarded.
 *
 * @template T - The type of documents stored
 *
 * @example
 * ```typescript
 * const userId = store.begin((tx) => {
 *   const id = tx.add({ name: "Alice" });
 *   tx.update(id, { email: "alice@example.com" });
 *   return id; // Return value becomes the transaction result
 * });
 * ```
 */
export type StoreSetTransaction<T> = {
	/**
	 * Add a new document to the store.
	 *
	 * @param value - The document to add
	 * @param options - Optional configuration (e.g., custom ID)
	 * @returns The document's ID (generated or provided)
	 */
	add: (value: T, options?: StoreAddOptions) => string;

	/**
	 * Update an existing document by merging a partial value.
	 * Uses field-level Last-Write-Wins merge semantics.
	 *
	 * @param key - The document ID
	 * @param value - Partial update to merge
	 */
	update: (key: string, value: DeepPartial<T>) => void;

	/**
	 * Merge an encoded document from another replica.
	 * Used internally by sync plugins.
	 *
	 * @param doc - Encoded document with eventstamps
	 */
	merge: (doc: EncodedDocument) => void;

	/**
	 * Soft-delete a document by marking it with a deletion timestamp.
	 *
	 * @param key - The document ID to delete
	 */
	del: (key: string) => void;

	/**
	 * Get a document by ID from the transaction's staging area.
	 *
	 * @param key - The document ID
	 * @returns The document, or null if not found or deleted
	 */
	get: (key: string) => T | null;

	/**
	 * Abort the transaction and discard all staged changes.
	 * No hooks will fire and the store remains unchanged.
	 */
	rollback: () => void;
};

/**
 * Plugin lifecycle and event hooks.
 *
 * All hooks are optional except `onInit` and `onDispose`, which are required.
 * Mutation hooks (`onAdd`, `onUpdate`, `onDelete`) receive batched entries after
 * each transaction commits.
 *
 * @template T - The type of documents stored
 *
 * @example
 * ```typescript
 * const loggingPlugin = <T>(): Plugin<T> => ({
 *   hooks: {
 *     onInit: (store) => console.log("Plugin initialized"),
 *     onDispose: () => console.log("Plugin disposed"),
 *     onAdd: (entries) => {
 *       for (const [key, value] of entries) {
 *         console.log(`Added ${key}:`, value);
 *       }
 *     },
 *   },
 * });
 * ```
 */
export type PluginHooks<T> = {
	/** Called when store.init() runs. Use to hydrate data, start pollers, etc. */
	onInit: (store: Store<T>) => Promise<void> | void;

	/** Called when store.dispose() runs. Use to cleanup resources, flush data, etc. */
	onDispose: () => Promise<void> | void;

	/** Called after new documents are added. Receives batched entries from the transaction. */
	onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;

	/** Called after documents are updated. Receives batched entries from the transaction. */
	onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;

	/** Called after documents are deleted. Receives batched keys from the transaction. */
	onDelete?: (keys: ReadonlyArray<string>) => void;
};

/**
 * Type constraint for plugin methods that extend the store API.
 *
 * Plugins can add custom methods to the store by returning a `methods` object.
 * The methods are injected directly into the store instance.
 *
 * @example
 * ```typescript
 * type QueryMethods = {
 *   query: (predicate: (doc: Todo) => boolean) => Map<string, Todo>;
 * };
 *
 * const queryPlugin = (): Plugin<Todo, QueryMethods> => ({
 *   hooks: { onInit: () => {}, onDispose: () => {} },
 *   methods: {
 *     query: (predicate) => { ... }
 *   }
 * });
 * ```
 */
export type PluginMethods = Record<string, (...args: any[]) => any>;

/**
 * Plugin definition for extending store functionality.
 *
 * Plugins provide lifecycle hooks and optional methods that extend the store API.
 * Use plugins for persistence, querying, indexing, or custom side effects.
 *
 * @template T - The type of documents stored
 * @template M - Optional methods to add to the store
 *
 * @example
 * ```typescript
 * const persistPlugin = <T>(): Plugin<T> => ({
 *   hooks: {
 *     onInit: async (store) => {
 *       const snapshot = await loadFromDisk();
 *       store.merge(snapshot);
 *     },
 *     onDispose: async () => {
 *       await flushPendingWrites();
 *     },
 *     onAdd: (entries) => saveToDisk(entries),
 *   },
 * });
 *
 * const store = await createStore<Todo>()
 *   .use(persistPlugin())
 *   .init();
 * ```
 */
export type Plugin<T, M extends PluginMethods = {}> = {
	/** Lifecycle and mutation hooks */
	hooks: PluginHooks<T>;

	/** Optional methods to add to the store instance */
	methods?: M;
};

/**
 * A reactive, local-first data store with CRDT-based conflict resolution.
 *
 * Stores documents using field-level Last-Write-Wins (LWW) merge semantics
 * powered by hybrid logical clocks (eventstamps). Supports plugins for
 * persistence, querying, and custom side effects.
 *
 * @template T - The type of documents stored
 * @template Extended - Plugin methods added to the store (inferred automatically)
 *
 * @example
 * ```typescript
 * type Todo = { text: string; completed: boolean };
 *
 * const store = await createStore<Todo>()
 *   .use(persistPlugin())
 *   .init();
 *
 * // Add a document
 * const id = store.add({ text: "Learn Starling", completed: false });
 *
 * // Update it
 * store.update(id, { completed: true });
 *
 * // Query all entries
 * for (const [key, todo] of store.entries()) {
 *   console.log(key, todo);
 * }
 * ```
 */
export type Store<T, Extended = {}> = {
	/**
	 * Retrieve a document by ID.
	 *
	 * @param key - The document ID
	 * @returns The document, or `null` if not found or deleted
	 *
	 * @example
	 * ```typescript
	 * const todo = store.get("todo-1");
	 * if (todo) {
	 *   console.log(todo.text);
	 * }
	 * ```
	 */
	get: (key: string) => T | null;

	/**
	 * Execute multiple operations in a transaction.
	 *
	 * All operations are staged until the callback completes. If the callback
	 * throws or calls `tx.rollback()`, all changes are discarded. Otherwise,
	 * changes commit atomically and plugin hooks fire once with batched entries.
	 *
	 * @param callback - Transaction function receiving a transaction API
	 * @param opts - Optional configuration
	 * @param opts.silent - If true, suppress plugin hooks after commit
	 * @returns The callback's return value
	 *
	 * @example
	 * ```typescript
	 * // Multiple operations
	 * const userId = store.begin((tx) => {
	 *   const id = tx.add({ name: "Alice" });
	 *   tx.update(id, { email: "alice@example.com" });
	 *   return id;
	 * });
	 *
	 * // Rollback on validation failure
	 * store.begin((tx) => {
	 *   const id = tx.add({ name: "Dave", email: "invalid" });
	 *   if (!isValid(tx.get(id))) {
	 *     tx.rollback();
	 *   }
	 * });
	 * ```
	 */
	begin: <R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	) => NotPromise<R>;

	/**
	 * Add a new document to the store.
	 *
	 * Shorthand for `begin((tx) => tx.add(value, options))`.
	 *
	 * @param value - The document to add
	 * @param options - Optional configuration (e.g., custom ID)
	 * @returns The document's ID (generated or provided)
	 *
	 * @example
	 * ```typescript
	 * // Auto-generated ID
	 * const id = store.add({ text: "Buy milk", completed: false });
	 *
	 * // Custom ID
	 * store.add({ text: "Learn Starling" }, { withId: "todo-1" });
	 * ```
	 */
	add: (value: T, options?: StoreAddOptions) => string;

	/**
	 * Update an existing document by merging a partial value.
	 *
	 * Uses field-level Last-Write-Wins (LWW) merge semantics. Each field
	 * gets a new eventstamp, so concurrent updates to different fields
	 * are preserved when merging with other replicas.
	 *
	 * Shorthand for `begin((tx) => tx.update(key, value))`.
	 *
	 * @param key - The document ID
	 * @param value - Partial update to merge
	 *
	 * @example
	 * ```typescript
	 * store.update("todo-1", { completed: true });
	 *
	 * // Nested updates work too
	 * store.update("user-1", { settings: { theme: "dark" } });
	 * ```
	 */
	update: (key: string, value: DeepPartial<T>) => void;

	/**
	 * Soft-delete a document by marking it with a deletion timestamp.
	 *
	 * Deleted documents remain in the store snapshot for sync purposes
	 * but are excluded from `get()` and `entries()` results.
	 *
	 * Shorthand for `begin((tx) => tx.del(key))`.
	 *
	 * @param key - The document ID to delete
	 *
	 * @example
	 * ```typescript
	 * store.del("todo-1");
	 * ```
	 */
	del: (key: string) => void;

	/**
	 * Iterate all active (non-deleted) documents.
	 *
	 * Returns an iterator of `[key, value]` tuples. Deleted documents
	 * are automatically excluded.
	 *
	 * @returns Iterator of active document entries
	 *
	 * @example
	 * ```typescript
	 * for (const [key, todo] of store.entries()) {
	 *   console.log(`${key}: ${todo.text}`);
	 * }
	 *
	 * // Convert to array
	 * const allTodos = Array.from(store.entries());
	 * ```
	 */
	entries: () => IterableIterator<readonly [string, T]>;

	/**
	 * Export the complete store state as a serializable snapshot.
	 *
	 * Includes all documents (even deleted ones) with their eventstamps,
	 * plus the store's latest clock value for synchronization.
	 *
	 * @returns Serializable store snapshot
	 *
	 * @example
	 * ```typescript
	 * const snapshot = store.snapshot();
	 * await saveToFile(snapshot);
	 *
	 * // Send to another device
	 * await fetch("/api/sync", {
	 *   method: "POST",
	 *   body: JSON.stringify(snapshot),
	 * });
	 * ```
	 */
	snapshot: () => Collection;

	/**
	 * Import and merge a collection from another replica.
	 *
	 * Forwards the local clock to match the collection's eventstamp,
	 * then merges all documents using field-level LWW semantics.
	 *
	 * @param collection - Collection from another store instance
	 *
	 * @example
	 * ```typescript
	 * // Sync with remote store
	 * const remoteCollection = await fetch("/api/sync").then(r => r.json());
	 * store.merge(remoteCollection);
	 *
	 * // Hydrate from disk
	 * const savedCollection = await loadFromFile();
	 * store.merge(savedCollection);
	 * ```
	 */
	merge: (collection: Collection) => void;

	/**
	 * Register a plugin to extend store functionality.
	 *
	 * Plugins can add lifecycle hooks (e.g., persistence, indexing) and
	 * methods (e.g., querying). Returns the same store instance for chaining.
	 *
	 * @param plugin - Plugin definition with hooks and optional methods
	 * @returns The store with plugin methods added
	 *
	 * @example
	 * ```typescript
	 * const store = createStore<Todo>()
	 *   .use(persistPlugin())
	 *   .use(queryPlugin())
	 *   .use(customPlugin());
	 *
	 * await store.init(); // Runs all plugin onInit hooks
	 * ```
	 */
	use: <M extends PluginMethods>(
		plugin: Plugin<T, M>,
	) => Store<T, Extended & M>;

	/**
	 * Initialize the store and run all plugin `onInit` hooks.
	 *
	 * Hooks run sequentially in the order plugins were registered.
	 * Call this once after registering plugins and before using the store.
	 *
	 * @returns Promise resolving to the initialized store
	 *
	 * @example
	 * ```typescript
	 * const store = await createStore<Todo>()
	 *   .use(persistPlugin())
	 *   .init(); // Hydrates data from disk
	 * ```
	 */
	init: () => Promise<Store<T, Extended>>;

	/**
	 * Cleanup the store and run all plugin `onDispose` hooks.
	 *
	 * Hooks run sequentially in reverse order (LIFO). Use this to flush
	 * pending writes, close connections, and release resources.
	 *
	 * @returns Promise resolving when all cleanup is complete
	 *
	 * @example
	 * ```typescript
	 * // Before app shutdown
	 * await store.dispose();
	 * ```
	 */
	dispose: () => Promise<void>;
} & Extended;

/**
 * Create a new reactive store with CRDT-based conflict resolution.
 *
 * Returns an uninitialized store. Chain `.use()` to register plugins,
 * then call `.init()` to run plugin setup hooks before using the store.
 *
 * @template T - The type of documents to store
 * @param config - Optional configuration
 * @param config.getId - Custom ID generator (defaults to crypto.randomUUID)
 * @returns A new store instance
 *
 * @example
 * ```typescript
 * // Basic store
 * const store = await createStore<Todo>().init();
 *
 * // With plugins
 * const store = await createStore<Todo>()
 *   .use(persistPlugin())
 *   .use(queryPlugin())
 *   .init();
 *
 * // Custom ID generator
 * const store = createStore<Todo>({
 *   getId: () => nanoid(),
 * });
 * ```
 */
export function createStore<T>(
	config: { getId?: () => string } = {},
): Store<T, {}> {
	let readMap = new Map<string, EncodedDocument>(); // published state
	const clock = createClock();
	const getId = config.getId ?? (() => crypto.randomUUID());

	const encodeValue = (key: string, value: T) =>
		encodeDoc(key, value, clock.now());

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc["~deletedAt"]) return null;
		return decodeDoc<T>(doc)["~data"];
	};

	// Hook handlers
	const onInitHandlers = new Set<PluginHooks<T>["onInit"]>();
	const onDisposeHandlers = new Set<PluginHooks<T>["onDispose"]>();
	const onAddHandlers = new Set<
		(entries: ReadonlyArray<readonly [string, T]>) => void
	>();
	const onUpdateHandlers = new Set<
		(entries: ReadonlyArray<readonly [string, T]>) => void
	>();
	const onDeleteHandlers = new Set<(keys: ReadonlyArray<string>) => void>();

	// Helper function to register mutation handlers
	type MutationHandlers<T> = {
		onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
		onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
		onDelete?: (keys: ReadonlyArray<string>) => void;
	};

	const registerMutationHandlers = (
		handlers: MutationHandlers<T>,
		registerDispose?: (dispose: () => void) => void,
	): (() => void) => {
		const registered: Array<() => void> = [];

		const registerHook = <H>(handler: H | undefined, set: Set<H>): void => {
			if (handler) {
				set.add(handler);
				const unsubscribe = () => set.delete(handler);
				registered.push(unsubscribe);
				if (registerDispose) {
					registerDispose(unsubscribe);
				}
			}
		};

		registerHook(handlers.onAdd, onAddHandlers);
		registerHook(handlers.onUpdate, onUpdateHandlers);
		registerHook(handlers.onDelete, onDeleteHandlers);

		return () => {
			for (const unsubscribe of registered) {
				unsubscribe();
			}
		};
	};

	const fireHooks = (
		addKeyValues: ReadonlyArray<readonly [string, T]>,
		patchKeyValues: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void => {
		if (addKeyValues.length > 0) {
			onAddHandlers.forEach((fn) => {
				fn(addKeyValues);
			});
		}
		if (patchKeyValues.length > 0) {
			onUpdateHandlers.forEach((fn) => {
				fn(patchKeyValues);
			});
		}
		if (deleteKeys.length > 0) {
			onDeleteHandlers.forEach((fn) => {
				fn(deleteKeys);
			});
		}
	};

	const store: Store<T> = {
		get(key: string) {
			return decodeActive(readMap.get(key) ?? null);
		},
		entries() {
			function* iterator() {
				for (const [key, doc] of readMap.entries()) {
					const data = decodeActive(doc);
					if (data !== null) yield [key, data] as const;
				}
			}

			return iterator();
		},
		snapshot() {
			return {
				"~docs": Array.from(readMap.values()),
				"~eventstamp": clock.latest(),
			};
		},
		merge(collection: Collection) {
			// Get current state as a collection
			const currentCollection = this.snapshot();

			// Merge collections and get tracked changes
			const result = mergeCollections(currentCollection, collection);

			// Forward clock to the merged collection's eventstamp
			clock.forward(result.collection["~eventstamp"]);

			// Update readMap with merged documents
			readMap = new Map(
				result.collection["~docs"].map((doc) => [doc["~id"], doc]),
			);

			// Fire hooks using tracked changes
			const addEntries = Array.from(result.changes.added.entries()).map(
				([key, doc]) => [key, decodeDoc<T>(doc)["~data"]] as const,
			);
			const updateEntries = Array.from(result.changes.updated.entries()).map(
				([key, doc]) => [key, decodeDoc<T>(doc)["~data"]] as const,
			);
			const deleteKeys = Array.from(result.changes.deleted);

			fireHooks(addEntries, updateEntries, deleteKeys);
		},
		begin<R = void>(
			callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
			opts?: { silent?: boolean },
		): NotPromise<R> {
			const silent = opts?.silent ?? false;
			const addKeyValues: Array<readonly [string, T]> = [];
			const patchKeyValues: Array<readonly [string, T]> = [];
			const deleteKeys: Array<string> = [];

			const staging = new Map(readMap);
			let rolledBack = false;

			const tx: StoreSetTransaction<T> = {
				add(value: T, options?: StoreAddOptions) {
					const key = options?.withId ?? getId();
					staging.set(key, encodeValue(key, value));
					addKeyValues.push([key, value] as const);
					return key;
				},
				update(key: string, value: DeepPartial<T>) {
					const doc = encodeDoc(key, value as T, clock.now());
					const prev = staging.get(key);
					const mergedDoc = prev ? mergeDocs(prev, doc)[0] : doc;
					staging.set(key, mergedDoc);
					const merged = decodeActive(mergedDoc);
					if (merged) {
						patchKeyValues.push([key, merged] as const);
					}
				},
				merge(doc: EncodedDocument) {
					const existing = staging.get(doc["~id"]);
					const mergedDoc = existing ? mergeDocs(existing, doc)[0] : doc;
					staging.set(doc["~id"], mergedDoc);

					// Determine if this is a new document or an update
					const isNew = !readMap.has(doc["~id"]);

					if (mergedDoc["~deletedAt"]) {
						deleteKeys.push(doc["~id"]);
					} else {
						const merged = decodeDoc<T>(mergedDoc)["~data"];
						if (isNew) {
							addKeyValues.push([doc["~id"], merged] as const);
						} else {
							patchKeyValues.push([doc["~id"], merged] as const);
						}
					}
				},
				del(key: string) {
					const currentDoc = staging.get(key);
					if (!currentDoc) return;

					staging.set(key, deleteDoc(currentDoc, clock.now()));
					deleteKeys.push(key);
				},
				get(key: string) {
					return decodeActive(staging.get(key) ?? null);
				},
				rollback() {
					rolledBack = true;
				},
			};

			const result = callback(tx);

			// Auto-commit unless rollback was explicitly called
			if (!rolledBack) {
				readMap = staging; // single atomic swap
			}
			// If callback throws, staging is implicitly discarded (auto-rollback)

			// Call hooks AFTER the transaction commits
			if (!rolledBack && !silent) {
				fireHooks(addKeyValues, patchKeyValues, deleteKeys);
			}

			return result as NotPromise<R>;
		},
		add(this: Store<T>, value: T, options?: StoreAddOptions): string {
			return this.begin((tx) => tx.add(value, options));
		},
		update(this: Store<T>, key: string, value: DeepPartial<T>) {
			return this.begin((tx) => tx.update(key, value));
		},
		del(this: Store<T>, key: string) {
			return this.begin((tx) => tx.del(key));
		},
		use<M extends PluginMethods>(plugin: Plugin<T, M>): Store<T, M> {
			const { hooks: pluginHooks, methods } = plugin;

			// Register mutation hooks using shared helper
			registerMutationHandlers(
				{
					onAdd: pluginHooks.onAdd,
					onUpdate: pluginHooks.onUpdate,
					onDelete: pluginHooks.onDelete,
				},
				(unsubscribe) => {
					onDisposeHandlers.add(unsubscribe);
				},
			);

			// Inject plugin methods directly into store
			if (methods) {
				Object.assign(this, methods);
			}

			onInitHandlers.add(pluginHooks.onInit);
			onDisposeHandlers.add(pluginHooks.onDispose);

			return this as Store<T, M>;
		},
		async init() {
			for (const fn of onInitHandlers) {
				// Await sequentially to honor the order plugins are registered (FIFO)
				await fn(this);
			}

			return this;
		},
		async dispose() {
			const disposerArray = Array.from(onDisposeHandlers);
			disposerArray.reverse();
			for (const fn of disposerArray) {
				await fn();
			}
		},
	};

	return store;
}
