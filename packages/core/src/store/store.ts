import type { AnyObject, JsonDocument } from "../document";
import { mergeDocuments } from "../document";
import {
	emitMutations as emitMutationsFn,
	executeDisposeHooks,
	executeInitHooks,
} from "./plugin-manager";
import { createMap, createMapFromDocument } from "./resource-map";
import { decodeActive, hasChanges, mapChangesToEntries } from "./utils";

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
 * Core CRUD operations available to all stores and plugins.
 *
 * This is the stable API surface that plugins can rely on. It provides:
 * - **Read operations**: `has`, `get`, `entries`
 * - **Write operations**: `add`, `update`, `remove`
 * - **Transactions**: `begin`
 * - **Sync operations**: `collection`, `merge`
 *
 * This type excludes plugin-specific methods and lifecycle functions,
 * ensuring plugins only depend on the core store functionality.
 *
 * @template T - The type of documents stored in this collection
 */
export type StoreBase<T extends AnyObject> = {
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
};

/**
 * Plugin system methods for extending the store.
 *
 * These methods manage the plugin lifecycle and enable type-safe
 * method accumulation across multiple plugins.
 *
 * @template T - The type of documents stored in this collection
 * @template TMethods - Accumulated plugin methods from all registered plugins
 */
export type StorePluginAPI<
	T extends AnyObject,
	TMethods extends Record<string, any> = {},
> = {
	/** Register a plugin that can add hooks and methods to the store */
	use: <TNewMethods extends Record<string, any>>(
		plugin: Plugin<T, TNewMethods>,
	) => Store<T, TMethods & TNewMethods>;
	/** Initialize the store and run plugin onInit hooks */
	init: () => Promise<Store<T, TMethods>>;
	/** Dispose the store and run plugin cleanup */
	dispose: () => Promise<void>;
};

/**
 * Complete store instance with CRUD operations, plugin system, and accumulated plugin methods.
 *
 * ## Type System Architecture
 *
 * The store type system is composed of three layers:
 *
 * ```
 * StoreBase<T>              Core CRUD operations (has, get, add, update, del, etc.)
 *      +
 * StorePluginAPI<T, M>      Plugin lifecycle (use, init, dispose)
 *      +
 * TMethods                  Accumulated methods from plugins
 *      =
 * Store<T, TMethods>        Complete store API
 * ```
 *
 * ## Type Flow Example
 *
 * ```typescript
 * createStore<Todo>()                    // Store<Todo, {}>
 *   .use(queryPlugin())                   // Store<Todo, { query: ... }>
 *   .use(customPlugin())                  // Store<Todo, { query: ..., custom: ... }>
 *   .init()                               // Promise<Store<Todo, { query: ..., custom: ... }>>
 * ```
 *
 * ## Plugin Method Accumulation
 *
 * Each call to `.use()` adds new methods to the store type:
 * - Methods are type-safe and auto-complete in IDEs
 * - Method conflicts are detected at runtime
 * - Type accumulates through the chain: `TMethods & TNewMethods`
 *
 * @template T - The type of documents stored in this collection
 * @template TMethods - Accumulated plugin methods (default: {})
 */
export type Store<
	T extends AnyObject,
	TMethods extends Record<string, any> = {},
> = StoreBase<T> & StorePluginAPI<T, TMethods> & TMethods;

/**
 * Plugin lifecycle and mutation hooks.
 *
 * All hooks are optional. Mutation hooks receive batched entries after each
 * transaction commits. All hooks receive the collection key as their first parameter.
 */
export type PluginHooks<T extends AnyObject> = {
	/** Called once when store.init() runs */
	onInit?: (collectionKey: string, store: StoreBase<T>) => Promise<void> | void;
	/** Called once when store.dispose() runs */
	onDispose?: (collectionKey: string) => Promise<void> | void;
	/** Called after documents are added (batched per transaction) */
	onAdd?: (
		collectionKey: string,
		entries: ReadonlyArray<readonly [string, T]>,
	) => void;
	/** Called after documents are updated (batched per transaction) */
	onUpdate?: (
		collectionKey: string,
		entries: ReadonlyArray<readonly [string, T]>,
	) => void;
	/** Called after documents are deleted (batched per transaction) */
	onDelete?: (collectionKey: string, keys: ReadonlyArray<string>) => void;
};

/**
 * Plugin interface for extending store behavior with hooks and methods.
 *
 * Plugins can provide lifecycle hooks for side effects and methods to extend
 * the store's API. Methods receive the core store API and return an object
 * of functions to attach to the store instance.
 *
 * @example
 * ```ts
 * const loggingPlugin = <T>(): Plugin<T, { logState: () => void }> => ({
 *   hooks: {
 *     onInit: async () => console.log('Store initialized'),
 *     onAdd: (entries) => console.log('Added:', entries.length),
 *   },
 *   methods: (store) => ({
 *     logState: () => console.log('Entries:', Array.from(store.entries()))
 *   })
 * });
 *
 * const store = createStore<Todo>().use(loggingPlugin());
 * store.logState(); // Method from plugin
 * ```
 */
export type Plugin<
	T extends AnyObject,
	TMethods extends Record<string, any> = {},
> = {
	/** Lifecycle and mutation hooks */
	hooks?: PluginHooks<T>;
	/** Factory function that returns methods to attach to the store */
	methods?: (store: StoreBase<T>) => TMethods;
};

/**
 * Create a lightweight local-first data store with built-in sync.
 *
 * Stores plain JavaScript objects with automatic field-level conflict resolution
 * using Last-Write-Wins semantics powered by hybrid logical clocks.
 *
 * @param collectionKey - Unique identifier for this collection
 * @template T - The type of documents stored in this collection
 *
 * @example
 * ```ts
 * import { createStore } from '@byearlybird/starling';
 * import { queryPlugin } from '@byearlybird/starling/plugin-query';
 * import { unstoragePlugin } from '@byearlybird/starling/plugin-unstorage';
 *
 * const store = await createStore<{ text: string; completed: boolean }>('todos')
 *   .use(queryPlugin())
 *   .use(unstoragePlugin(storage))
 *   .init();
 *
 * // Add, update, delete
 * const id = store.add({ text: 'Buy milk', completed: false });
 * store.update(id, { completed: true });
 * store.remove(id);
 *
 * // Reactive queries (from queryPlugin)
 * const activeTodos = store.query({ where: (todo) => !todo.completed });
 * activeTodos.onChange(() => console.log('Todos changed!'));
 * ```
 */
export function createStore<T extends AnyObject>(
	collectionKey: string,
	config: StoreConfig = {},
): Store<T> {
	const type = config.type ?? collectionKey;
	let crdt = createMap<T>(type);
	const getId = config.getId ?? (() => crypto.randomUUID());

	const onInitHandlers: Array<NonNullable<PluginHooks<T>["onInit"]>> = [];
	const onDisposeHandlers: Array<NonNullable<PluginHooks<T>["onDispose"]>> = [];
	const onAddHandlers: Array<NonNullable<PluginHooks<T>["onAdd"]>> = [];
	const onUpdateHandlers: Array<NonNullable<PluginHooks<T>["onUpdate"]>> = [];
	const onDeleteHandlers: Array<NonNullable<PluginHooks<T>["onDelete"]>> = [];

	function emitMutations(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		emitMutationsFn(
			onAddHandlers,
			onUpdateHandlers,
			onDeleteHandlers,
			collectionKey,
			addEntries,
			updateEntries,
			deleteKeys,
		);
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
		return crdt.snapshot();
	}

	function merge(document: JsonDocument<T>): void {
		const currentCollection = collection();
		const result = mergeDocuments<T>(currentCollection, document);

		// Replace the ResourceMap with the merged state
		crdt = createMapFromDocument<T>(type, result.document);

		const addEntries = mapChangesToEntries(result.changes.added);
		const updateEntries = mapChangesToEntries(result.changes.updated);
		const deleteKeys = Array.from(result.changes.deleted);

		if (hasChanges(addEntries, updateEntries, deleteKeys)) {
			emitMutations(addEntries, updateEntries, deleteKeys);
		}
	}

	function begin<R = void>(
		callback: (tx: StoreSetTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	): NotPromise<R> {
		const silent = opts?.silent ?? false;

		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const deleteKeys: Array<string> = [];

		// Create a staging ResourceMap by cloning the current state
		const staging = createMapFromDocument<T>(type, crdt.snapshot());
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
				deleteKeys.push(key);
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
				emitMutations(addEntries, updateEntries, deleteKeys);
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

	// Phase 1: Create base store with core CRUD operations
	const baseStore: StoreBase<T> = {
		has,
		get,
		entries,
		collection,
		merge,
		begin,
		add,
		update,
		remove,
	};

	// Phase 2: Create plugin API that references base store
	function use<TNewMethods extends Record<string, any>>(
		plugin: Plugin<T, TNewMethods>,
	): Store<T, TNewMethods> {
		// Register hooks
		if (plugin.hooks?.onInit) onInitHandlers.push(plugin.hooks.onInit);
		if (plugin.hooks?.onDispose) onDisposeHandlers.push(plugin.hooks.onDispose);
		if (plugin.hooks?.onAdd) onAddHandlers.push(plugin.hooks.onAdd);
		if (plugin.hooks?.onUpdate) onUpdateHandlers.push(plugin.hooks.onUpdate);
		if (plugin.hooks?.onDelete) onDeleteHandlers.push(plugin.hooks.onDelete);

		// Attach methods
		if (plugin.methods) {
			const methods = plugin.methods(baseStore);

			// Check for conflicts
			for (const key of Object.keys(methods)) {
				if (key in fullStore) {
					throw new Error(
						`Plugin method "${key}" conflicts with existing store method or plugin`,
					);
				}
			}

			Object.assign(fullStore, methods);
		}

		return fullStore as Store<T, TNewMethods>;
	}

	async function init(): Promise<Store<T>> {
		await executeInitHooks(onInitHandlers, collectionKey, baseStore);
		return fullStore;
	}

	async function dispose(): Promise<void> {
		await executeDisposeHooks(onDisposeHandlers, collectionKey);

		onInitHandlers.length = 0;
		onDisposeHandlers.length = 0;
		onAddHandlers.length = 0;
		onUpdateHandlers.length = 0;
		onDeleteHandlers.length = 0;
	}

	const pluginAPI: StorePluginAPI<T> = {
		use,
		init,
		dispose,
	};

	// Phase 3: Combine base store and plugin API
	const fullStore = { ...baseStore, ...pluginAPI } as Store<T>;

	return fullStore;
}
