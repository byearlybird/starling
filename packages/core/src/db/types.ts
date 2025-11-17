import type { AnyObject, Document } from "../document";
import type { StandardSchemaV1 } from "../standard-schema";

type NotPromise<T> = T extends Promise<any> ? never : T;

export type DeepPartial<T> = T extends Array<infer U>
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
