import type { AnyObject, Document } from "../document";
import { mergeDocuments } from "../document";
import type { StandardSchemaV1 } from "../standard-schema";
import {
	createResourceMap,
	createResourceMapFromDocument,
} from "../store/resource-map";
import { decodeActive, hasChanges, mapChangesToEntries } from "../store/utils";

type NotPromise<T> = T extends Promise<any> ? never : T;

type DeepPartial<T> = T extends Array<infer U>
	? Array<DeepPartial<U>>
	: T extends object
		? { [P in keyof T]?: DeepPartial<T[P]> }
		: T;

/**
 * Extract the output type from a StandardSchema
 */
export type InferSchemaOutput<TSchema> =
	TSchema extends StandardSchemaV1<any, infer Output> ? Output : never;

/**
 * Configuration for a single collection in the database
 */
export type CollectionConfig<TSchema extends StandardSchemaV1> = {
	/** StandardSchema-compliant schema for validation */
	schema: TSchema;
	/** Function to extract ID from a document */
	getId: (doc: InferSchemaOutput<TSchema>) => string;
};

/**
 * Schema configuration for all collections in the database
 */
export type DBSchema = {
	[collectionName: string]: CollectionConfig<StandardSchemaV1>;
};

/**
 * Configuration options for creating a DB instance
 */
export type DBConfig<TSchema extends DBSchema> = {
	/** Schema definition for all collections */
	schema: TSchema;
};

/**
 * Options for adding documents to a collection
 */
export type CollectionAddOptions = {
	/** Provide a custom ID instead of using getId */
	withId?: string;
};

/**
 * Transaction context for a specific collection
 */
export type CollectionTransaction<T extends AnyObject> = {
	/** Add a document and return its ID (value must be pre-validated) */
	add: (value: T, options?: CollectionAddOptions) => string;
	/** Update a document with a partial value (value must be pre-validated) */
	update: (key: string, value: DeepPartial<T>) => void;
	/** Soft-delete a document */
	remove: (key: string) => void;
	/** Get a document within this transaction */
	get: (key: string) => T | null;
	/** Abort the transaction and discard all changes */
	rollback: () => void;
};

/**
 * Collection instance with CRUD operations
 */
export type Collection<T extends AnyObject> = {
	/** Add a document to the collection */
	add: (value: T, options?: CollectionAddOptions) => Promise<string>;
	/** Update a document with a partial value */
	update: (key: string, value: DeepPartial<T>) => Promise<void>;
	/** Get a document by ID */
	get: (key: string) => T | null;
	/** Get all non-deleted documents */
	getAll: () => T[];
	/** Soft-delete a document */
	remove: (key: string) => Promise<void>;
	/** Check if a document exists */
	has: (key: string) => boolean;
	/** Run multiple operations in a transaction with rollback support */
	begin: <R = void>(
		callback: (tx: CollectionTransaction<T>) => NotPromise<R>,
		opts?: { silent?: boolean },
	) => NotPromise<R>;
	/** Get the complete collection state as a Document for persistence or sync */
	collection: () => Document<T>;
	/** Merge a document from storage or another replica using field-level LWW */
	merge: (document: Document<T>) => Promise<void>;
};

/**
 * Type-safe collection accessor
 * Maps collection names to their corresponding Collection instances
 */
export type Collections<TSchema extends DBSchema> = {
	[K in keyof TSchema]: Collection<InferSchemaOutput<TSchema[K]["schema"]>>;
};

/**
 * Plugin lifecycle and mutation hooks for DB
 */
export type DBPluginHooks<TSchema extends DBSchema> = {
	/** Called once when db.init() runs */
	onInit?: (db: DBBase<TSchema>) => Promise<void> | void;
	/** Called once when db.dispose() runs */
	onDispose?: () => Promise<void> | void;
	/** Called after documents are added (batched per transaction) */
	onAdd?: <K extends keyof TSchema>(
		collectionName: K,
		entries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
	) => void;
	/** Called after documents are updated (batched per transaction) */
	onUpdate?: <K extends keyof TSchema>(
		collectionName: K,
		entries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
	) => void;
	/** Called after documents are deleted (batched per transaction) */
	onDelete?: <K extends keyof TSchema>(
		collectionName: K,
		keys: ReadonlyArray<string>,
	) => void;
};

/**
 * Plugin interface for extending DB behavior with hooks and methods
 */
export type DBPlugin<
	TSchema extends DBSchema,
	TMethods extends Record<string, any> = {},
> = {
	/** Lifecycle and mutation hooks */
	hooks?: DBPluginHooks<TSchema>;
	/** Factory function that returns methods to attach to the DB */
	methods?: (db: DBBase<TSchema>) => TMethods;
};

/**
 * Core DB operations available to all plugins
 */
export type DBBase<TSchema extends DBSchema> = Collections<TSchema> & {
	/** Get all collection names */
	getCollectionNames: () => Array<keyof TSchema>;
};

/**
 * Plugin system methods for extending the DB
 */
export type DBPluginAPI<
	TSchema extends DBSchema,
	TMethods extends Record<string, any> = {},
> = {
	/** Register a plugin that can add hooks and methods to the DB */
	use: <TNewMethods extends Record<string, any>>(
		plugin: DBPlugin<TSchema, TNewMethods>,
	) => DB<TSchema, TMethods & TNewMethods>;
	/** Initialize the DB and run plugin onInit hooks */
	init: () => Promise<DB<TSchema, TMethods>>;
	/** Dispose the DB and run plugin cleanup */
	dispose: () => Promise<void>;
};

/**
 * Complete DB instance with collections, plugin system, and accumulated plugin methods
 */
export type DB<
	TSchema extends DBSchema,
	TMethods extends Record<string, any> = {},
> = DBBase<TSchema> & DBPluginAPI<TSchema, TMethods> & TMethods;

/**
 * Validate a value against a StandardSchema
 */
async function validateSchema<TSchema extends StandardSchemaV1>(
	schema: TSchema,
	value: unknown,
): Promise<InferSchemaOutput<TSchema>> {
	const result = await schema["~standard"].validate(value);

	if (result.issues) {
		const messages = result.issues.map((issue) => issue.message).join(", ");
		throw new Error(`Validation failed: ${messages}`);
	}

	return result.value as InferSchemaOutput<TSchema>;
}

/**
 * Create a multi-collection database with StandardSchema validation.
 *
 * @template TSchema - The schema definition for all collections
 *
 * @example
 * ```ts
 * import { createDB } from '@byearlybird/starling/db';
 *
 * const db = await createDB({
 *   schema: {
 *     task: {
 *       schema: taskSchema,
 *       getId: (task) => task.id,
 *     },
 *     user: {
 *       schema: userSchema,
 *       getId: (user) => user.id,
 *     },
 *   },
 * })
 * .use(unstoragePlugin())
 * .init();
 *
 * // Add, update, get, remove
 * const id = await db.task.add({ title: 'Learn Starling' });
 * await db.task.update(id, { completed: true });
 * const task = db.task.get(id);
 * const allTasks = db.task.getAll();
 * await db.task.remove(id);
 * ```
 */
export function createDB<TSchema extends DBSchema>(
	config: DBConfig<TSchema>,
): DB<TSchema> {
	// Storage for all collections
	const collections = new Map<
		keyof TSchema,
		ReturnType<typeof createResourceMap>
	>();

	// Initialize resource maps for each collection
	for (const collectionName in config.schema) {
		if (!Object.hasOwn(config.schema, collectionName)) continue;
		collections.set(
			collectionName,
			createResourceMap(new Map(), collectionName),
		);
	}

	// Plugin hook handlers
	const onInitHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onInit"]>
	> = [];
	const onDisposeHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onDispose"]>
	> = [];
	const onAddHandlers: Array<NonNullable<DBPluginHooks<TSchema>["onAdd"]>> =
		[];
	const onUpdateHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onUpdate"]>
	> = [];
	const onDeleteHandlers: Array<
		NonNullable<DBPluginHooks<TSchema>["onDelete"]>
	> = [];

	function emitMutations<K extends keyof TSchema>(
		collectionName: K,
		addEntries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
		updateEntries: ReadonlyArray<
			readonly [string, InferSchemaOutput<TSchema[K]["schema"]>]
		>,
		deleteKeys: ReadonlyArray<string>,
	): void {
		if (addEntries.length > 0) {
			for (const handler of onAddHandlers) {
				handler(collectionName, addEntries);
			}
		}
		if (updateEntries.length > 0) {
			for (const handler of onUpdateHandlers) {
				handler(collectionName, updateEntries);
			}
		}
		if (deleteKeys.length > 0) {
			for (const handler of onDeleteHandlers) {
				handler(collectionName, deleteKeys);
			}
		}
	}

	async function executeInitHooks(): Promise<void> {
		for (const hook of onInitHandlers) {
			await hook(baseDB);
		}
	}

	async function executeDisposeHooks(): Promise<void> {
		for (let i = onDisposeHandlers.length - 1; i >= 0; i--) {
			await onDisposeHandlers[i]?.();
		}
	}

	function createCollection<K extends keyof TSchema>(
		collectionName: K,
	): Collection<InferSchemaOutput<TSchema[K]["schema"]>> {
		type T = InferSchemaOutput<TSchema[K]["schema"]>;
		const collectionConfig = config.schema[collectionName];

		function getResourceMap() {
			const resourceMap = collections.get(collectionName);
			if (!resourceMap) {
				throw new Error(`Collection "${String(collectionName)}" not found`);
			}
			return resourceMap;
		}

		function has(key: string): boolean {
			const resource = getResourceMap().get(key);
			return resource != null && !resource.meta.deletedAt;
		}

		function get(key: string): T | null {
			const current = getResourceMap().get(key);
			return decodeActive(current ?? null) as T | null;
		}

		function getAll(): T[] {
			const results: T[] = [];
			for (const [, resource] of getResourceMap().entries()) {
				if (!resource.meta.deletedAt) {
					results.push(resource.attributes as T);
				}
			}
			return results;
		}

		function collectionSnapshot(): Document<T> {
			return getResourceMap().snapshot() as Document<T>;
		}

		async function merge(document: Document<T>): Promise<void> {
			const currentCollection = collectionSnapshot();
			const result = mergeDocuments<T>(currentCollection, document);

			// Replace the ResourceMap with the merged state
			const mergedMap = createResourceMapFromDocument<T>(
				result.document,
				String(collectionName),
			);

			// Update the collections map
			collections.set(collectionName, mergedMap);

			const addEntries = mapChangesToEntries(
				result.changes.added,
			) as ReadonlyArray<readonly [string, T]>;
			const updateEntries = mapChangesToEntries(
				result.changes.updated,
			) as ReadonlyArray<readonly [string, T]>;
			const deleteKeys = Array.from(result.changes.deleted);

			if (hasChanges(addEntries, updateEntries, deleteKeys)) {
				emitMutations(collectionName, addEntries, updateEntries, deleteKeys);
			}
		}

		function begin<R = void>(
			callback: (tx: CollectionTransaction<T>) => NotPromise<R>,
			opts?: { silent?: boolean },
		): NotPromise<R> {
			const silent = opts?.silent ?? false;

			const addEntries: Array<readonly [string, T]> = [];
			const updateEntries: Array<readonly [string, T]> = [];
			const deleteKeys: Array<string> = [];

			// Create a staging ResourceMap by cloning the current state
			const staging = createResourceMapFromDocument<T>(
				getResourceMap().snapshot() as Document<T>,
				String(collectionName),
			);
			let rolledBack = false;

			const tx: CollectionTransaction<T> = {
				add: (value, options) => {
					const key = options?.withId ?? collectionConfig.getId(value);
					staging.set(key, value as AnyObject);
					addEntries.push([key, value] as const);
					return key;
				},
				update: (key, value) => {
					staging.set(key, value as AnyObject);
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
					return decodeActive(encoded ?? null) as T | null;
				},
				rollback: () => {
					rolledBack = true;
				},
			};

			const result = callback(tx);

			if (!rolledBack) {
				collections.set(collectionName, staging);
				if (!silent) {
					emitMutations(collectionName, addEntries, updateEntries, deleteKeys);
				}
			}

			return result as NotPromise<R>;
		}

		async function add(value: T, options?: CollectionAddOptions): Promise<string> {
			const validated = await validateSchema(collectionConfig.schema, value);
			return begin((tx) => tx.add(validated, options));
		}

		async function update(key: string, value: DeepPartial<T>): Promise<void> {
			// For partial updates, we don't validate since we're doing a field-level merge
			// The schema validation happens on add, and the merge logic preserves type safety
			begin((tx) => tx.update(key, value));
		}

		async function remove(key: string): Promise<void> {
			begin((tx) => tx.remove(key));
		}

		return {
			has,
			get,
			getAll,
			collection: collectionSnapshot,
			merge,
			begin,
			add,
			update,
			remove,
		};
	}

	// Create collection instances
	const collectionInstances: Partial<Collections<TSchema>> = {};
	for (const collectionName in config.schema) {
		if (!Object.hasOwn(config.schema, collectionName)) continue;
		collectionInstances[collectionName] = createCollection(collectionName);
	}

	function getCollectionNames(): Array<keyof TSchema> {
		return Object.keys(config.schema);
	}

	// Create base DB
	const baseDB: DBBase<TSchema> = {
		...collectionInstances,
		getCollectionNames,
	} as DBBase<TSchema>;

	// Plugin API
	function use<TNewMethods extends Record<string, any>>(
		plugin: DBPlugin<TSchema, TNewMethods>,
	): DB<TSchema, TNewMethods> {
		// Register hooks
		if (plugin.hooks?.onInit) onInitHandlers.push(plugin.hooks.onInit);
		if (plugin.hooks?.onDispose) onDisposeHandlers.push(plugin.hooks.onDispose);
		if (plugin.hooks?.onAdd) onAddHandlers.push(plugin.hooks.onAdd);
		if (plugin.hooks?.onUpdate) onUpdateHandlers.push(plugin.hooks.onUpdate);
		if (plugin.hooks?.onDelete) onDeleteHandlers.push(plugin.hooks.onDelete);

		// Attach methods
		if (plugin.methods) {
			const methods = plugin.methods(baseDB);

			// Check for conflicts
			for (const key of Object.keys(methods)) {
				if (key in fullDB) {
					throw new Error(
						`Plugin method "${key}" conflicts with existing DB method or plugin`,
					);
				}
			}

			Object.assign(fullDB, methods);
		}

		return fullDB as DB<TSchema, TNewMethods>;
	}

	async function init(): Promise<DB<TSchema>> {
		await executeInitHooks();
		return fullDB;
	}

	async function dispose(): Promise<void> {
		await executeDisposeHooks();

		onInitHandlers.length = 0;
		onDisposeHandlers.length = 0;
		onAddHandlers.length = 0;
		onUpdateHandlers.length = 0;
		onDeleteHandlers.length = 0;
	}

	const pluginAPI: DBPluginAPI<TSchema> = {
		use,
		init,
		dispose,
	};

	// Combine base DB and plugin API
	const fullDB = { ...baseDB, ...pluginAPI } as DB<TSchema>;

	return fullDB;
}
