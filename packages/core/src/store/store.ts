import type { Document, ResourceObject } from "../document";
import { mergeDocuments } from "../document";
import {
	emitMutations as emitMutationsFn,
	executeDisposeHooks,
	executeInitHooks,
} from "./plugin-manager";
import {
	createResourceMap,
	createResourceMapFromSnapshot,
} from "./resource-map";

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
	del: (key: string) => void;
	/** Get a document within this transaction */
	get: (key: string) => T | null;
	/** Abort the transaction and discard all changes */
	rollback: () => void;
};

/**
 * A store instance with methods for mutations, queries, and sync.
 *
 * The TMethods type parameter accumulates methods from all registered plugins,
 * providing full type safety for plugin-added functionality.
 *
 * @template T - The type of documents stored in this collection
 * @template TMethods - Accumulated plugin methods
 */
export type Store<
	T extends Record<string, unknown>,
	TMethods extends Record<string, any> = {},
> = {
	/** Check if a document exists by ID (excluding soft-deleted documents) */
	has: (key: string) => boolean;
	/** Get a document by ID (excluding soft-deleted documents) */
	get: (key: string) => T | null;
	/** Iterate over all non-deleted documents as [id, document] tuples */
	entries: () => IterableIterator<readonly [string, T]>;
	/** Get the complete store state as a Document for persistence or sync */
	collection: () => Document;
	/** Merge a document from storage or another replica using field-level LWW */
	merge: (document: Document) => void;
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
	del: (key: string) => void;
	/** Register a plugin that can add hooks and methods to the store */
	use: <TNewMethods extends Record<string, any>>(
		plugin: Plugin<T, TNewMethods>,
	) => Store<T, TMethods & TNewMethods>;
	/** Initialize the store and run plugin onInit hooks */
	init: () => Promise<Store<T, TMethods>>;
	/** Dispose the store and run plugin cleanup */
	dispose: () => Promise<void>;
} & TMethods;

/**
 * Base store API available to plugin hooks.
 *
 * This is a subset of Store without the plugin methods, used as the type
 * for the store parameter in plugin hooks.
 */
export type StoreBase<T extends Record<string, unknown>> = Pick<
	Store<T>,
	| "has"
	| "get"
	| "entries"
	| "collection"
	| "merge"
	| "begin"
	| "add"
	| "update"
	| "del"
>;

/**
 * Plugin lifecycle and mutation hooks.
 *
 * All hooks are optional. Mutation hooks receive batched entries after each
 * transaction commits.
 */
export type PluginHooks<T extends Record<string, unknown>> = {
	/** Called once when store.init() runs */
	onInit?: (store: StoreBase<T>) => Promise<void> | void;
	/** Called once when store.dispose() runs */
	onDispose?: () => Promise<void> | void;
	/** Called after documents are added (batched per transaction) */
	onAdd?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are updated (batched per transaction) */
	onUpdate?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/** Called after documents are deleted (batched per transaction) */
	onDelete?: (keys: ReadonlyArray<string>) => void;
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
	T extends Record<string, unknown>,
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
 * @template T - The type of documents stored in this collection
 *
 * @example
 * ```ts
 * import { createStore } from '@byearlybird/starling';
 * import { queryPlugin } from '@byearlybird/starling/plugin-query';
 * import { unstoragePlugin } from '@byearlybird/starling/plugin-unstorage';
 *
 * const store = await createStore<{ text: string; completed: boolean }>()
 *   .use(queryPlugin())
 *   .use(unstoragePlugin('todos', storage))
 *   .init();
 *
 * // Add, update, delete
 * const id = store.add({ text: 'Buy milk', completed: false });
 * store.update(id, { completed: true });
 * store.del(id);
 *
 * // Reactive queries (from queryPlugin)
 * const activeTodos = store.query({ where: (todo) => !todo.completed });
 * activeTodos.onChange(() => console.log('Todos changed!'));
 * ```
 */
export function createStore<T extends Record<string, unknown>>(
	config: StoreConfig = {},
): Store<T> {
	const type = config.type ?? "default";
	let crdt = createResourceMap<T>(new Map(), type);
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

	function collection(): Document {
		return crdt.snapshot();
	}

	function merge(document: Document): void {
		const currentCollection = collection();
		const result = mergeDocuments(currentCollection, document);

		// Replace the ResourceMap with the merged state
		crdt = createResourceMapFromSnapshot<T>(result.document);

		const addEntries = Array.from(result.changes.added.entries()).map(
			([key, doc]) => [key, doc.attributes as T] as const,
		);
		const updateEntries = Array.from(result.changes.updated.entries()).map(
			([key, doc]) => [key, doc.attributes as T] as const,
		);
		const deleteKeys = Array.from(result.changes.deleted);

		if (
			addEntries.length > 0 ||
			updateEntries.length > 0 ||
			deleteKeys.length > 0
		) {
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
		const staging = createResourceMapFromSnapshot<T>(crdt.snapshot());
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
			del: (key) => {
				if (!staging.has(key)) return;
				staging.delete(key);
				deleteKeys.push(key);
			},
			get: (key) => {
				const encoded = staging.cloneMap().get(key);
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

	function del(key: string): void {
		begin((tx) => tx.del(key));
	}

	function use(plugin: Plugin<T, any>): any {
		// Register hooks
		if (plugin.hooks?.onInit) onInitHandlers.push(plugin.hooks.onInit);
		if (plugin.hooks?.onDispose) onDisposeHandlers.push(plugin.hooks.onDispose);
		if (plugin.hooks?.onAdd) onAddHandlers.push(plugin.hooks.onAdd);
		if (plugin.hooks?.onUpdate) onUpdateHandlers.push(plugin.hooks.onUpdate);
		if (plugin.hooks?.onDelete) onDeleteHandlers.push(plugin.hooks.onDelete);

		// Attach methods
		if (plugin.methods) {
			const methods = plugin.methods(store);

			// Check for conflicts
			for (const key of Object.keys(methods)) {
				if (key in store) {
					throw new Error(
						`Plugin method "${key}" conflicts with existing store method or plugin`,
					);
				}
			}

			Object.assign(store, methods);
		}

		return store;
	}

	async function init(): Promise<any> {
		await executeInitHooks(onInitHandlers, store);
		return store;
	}

	async function dispose(): Promise<void> {
		await executeDisposeHooks(onDisposeHandlers);

		onInitHandlers.length = 0;
		onDisposeHandlers.length = 0;
		onAddHandlers.length = 0;
		onUpdateHandlers.length = 0;
		onDeleteHandlers.length = 0;
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
		del,
		use,
		init,
		dispose,
	};

	return store;
}

/**
 * Decode a ResourceObject to its active value, or null if deleted.
 * @param doc - ResourceObject to decode
 * @returns Active value or null if document is deleted
 */
function decodeActive<T extends Record<string, unknown>>(
	doc: ResourceObject<T> | null,
): T | null {
	if (!doc || doc.meta.deletedAt) return null;
	return doc.attributes as T;
}
