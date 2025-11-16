import type { Document, ResourceObject } from "../document";
import { mergeDocuments } from "../document";
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
 * Stores are created via createStore() and provide a consistent API for
 * managing collections of documents with field-level Last-Write-Wins merging.
 */
export type Store<T extends Record<string, unknown>> = {
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
	/** Register a plugin for persistence, analytics, etc. */
	use: (plugin: Plugin<T>) => Store<T>;
	/** Initialize the store and run plugin onInit hooks */
	init: () => Promise<Store<T>>;
	/** Dispose the store and run plugin cleanup */
	dispose: () => Promise<void>;
	/** Create a reactive query that auto-updates when matching docs change */
	query: <U = T>(config: QueryConfig<T, U>) => Query<U>;
};

/**
 * Plugin interface for extending store behavior with persistence, analytics, etc.
 *
 * All hooks are optional. Mutation hooks receive batched entries after each
 * transaction commits.
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
 * Create a lightweight local-first data store with built-in sync and reactive queries.
 *
 * Stores plain JavaScript objects with automatic field-level conflict resolution
 * using Last-Write-Wins semantics powered by hybrid logical clocks.
 *
 * @template T - The type of documents stored in this collection
 *
 * @example
 * ```ts
 * const store = await createStore<{ text: string; completed: boolean }>()
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
export function createStore<T extends Record<string, unknown>>(
	config: StoreConfig = {},
): Store<T> {
	const type = config.type ?? "default";
	let crdt = createResourceMap<T>(new Map(), type);
	const getId = config.getId ?? (() => crypto.randomUUID());

	const onInitHandlers: Array<Plugin<T>["onInit"]> = [];
	const onDisposeHandlers: Array<Plugin<T>["onDispose"]> = [];
	const onAddHandlers: Array<NonNullable<Plugin<T>["onAdd"]>> = [];
	const onUpdateHandlers: Array<NonNullable<Plugin<T>["onUpdate"]>> = [];
	const onDeleteHandlers: Array<NonNullable<Plugin<T>["onDelete"]>> = [];

	// biome-ignore lint/suspicious/noExplicitAny: Store can contain queries with different select types
	const queries = new Set<QueryInternal<T, any>>();

	function decodeActive(doc: ResourceObject<T> | null): T | null {
		if (!doc || doc.meta.deletedAt) return null;
		return doc.attributes as T;
	}

	function selectValue<U>(query: QueryInternal<T, U>, value: T): U {
		return query.select ? query.select(value) : (value as unknown as U);
	}

	// biome-ignore lint/suspicious/noExplicitAny: Store can contain queries with different select types
	function runQueryCallbacks(dirtyQueries: Set<QueryInternal<T, any>>): void {
		for (const query of dirtyQueries) {
			for (const callback of query.callbacks) {
				callback();
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Store can contain queries with different select types
	function hydrateQuery(query: QueryInternal<T, any>): void {
		query.results.clear();
		for (const [key, value] of entries()) {
			if (query.where(value)) {
				const selected = selectValue(query, value);
				query.results.set(key, selected);
			}
		}
	}

	function notifyQueries(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		if (queries.size === 0) return;
		// biome-ignore lint/suspicious/noExplicitAny: Store can contain queries with different select types
		const dirtyQueries = new Set<QueryInternal<T, any>>();

		if (addEntries.length > 0) {
			for (const [key, value] of addEntries) {
				for (const query of queries) {
					if (query.where(value)) {
						const selected = selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (updateEntries.length > 0) {
			for (const [key, value] of updateEntries) {
				for (const query of queries) {
					const matches = query.where(value);
					const inResults = query.results.has(key);

					if (matches && !inResults) {
						const selected = selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					} else if (!matches && inResults) {
						query.results.delete(key);
						dirtyQueries.add(query);
					} else if (matches && inResults) {
						const selected = selectValue(query, value);
						query.results.set(key, selected);
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (deleteKeys.length > 0) {
			for (const key of deleteKeys) {
				for (const query of queries) {
					if (query.results.delete(key)) {
						dirtyQueries.add(query);
					}
				}
			}
		}

		if (dirtyQueries.size > 0) {
			runQueryCallbacks(dirtyQueries);
		}
	}

	function emitMutations(
		addEntries: ReadonlyArray<readonly [string, T]>,
		updateEntries: ReadonlyArray<readonly [string, T]>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		notifyQueries(addEntries, updateEntries, deleteKeys);

		if (addEntries.length > 0) {
			for (const handler of onAddHandlers) {
				handler(addEntries);
			}
		}
		if (updateEntries.length > 0) {
			for (const handler of onUpdateHandlers) {
				handler(updateEntries);
			}
		}
		if (deleteKeys.length > 0) {
			for (const handler of onDeleteHandlers) {
				handler(deleteKeys);
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

	function use(plugin: Plugin<T>): Store<T> {
		onInitHandlers.push(plugin.onInit);
		onDisposeHandlers.push(plugin.onDispose);
		if (plugin.onAdd) onAddHandlers.push(plugin.onAdd);
		if (plugin.onUpdate) onUpdateHandlers.push(plugin.onUpdate);
		if (plugin.onDelete) onDeleteHandlers.push(plugin.onDelete);
		return store;
	}

	async function init(): Promise<Store<T>> {
		for (const hook of onInitHandlers) {
			await hook(store);
		}

		for (const query of queries) {
			hydrateQuery(query);
		}

		return store;
	}

	async function dispose(): Promise<void> {
		for (let i = onDisposeHandlers.length - 1; i >= 0; i--) {
			await onDisposeHandlers[i]?.();
		}

		for (const query of queries) {
			query.callbacks.clear();
			query.results.clear();
		}

		queries.clear();

		onInitHandlers.length = 0;
		onDisposeHandlers.length = 0;
		onAddHandlers.length = 0;
		onUpdateHandlers.length = 0;
		onDeleteHandlers.length = 0;
	}

	function query<U = T>(config: QueryConfig<T, U>): Query<U> {
		const q: QueryInternal<T, U> = {
			where: config.where,
			...(config.select && { select: config.select }),
			...(config.order && { order: config.order }),
			results: new Map(),
			callbacks: new Set(),
		};

		queries.add(q);
		hydrateQuery(q);

		return {
			results: () => {
				if (q.order) {
					return Array.from(q.results).sort(([, a], [, b]) =>
						// biome-ignore lint/style/noNonNullAssertion: <guard above>
						q.order!(a, b),
					);
				}
				return Array.from(q.results);
			},
			onChange: (callback: () => void) => {
				q.callbacks.add(callback);
				return () => {
					q.callbacks.delete(callback);
				};
			},
			dispose: () => {
				queries.delete(q);
				q.callbacks.clear();
				q.results.clear();
			},
		};
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
		query,
	};

	return store;
}
