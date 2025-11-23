import { createClock, type JsonDocument } from "@byearlybird/starling";
import {
	type Collection,
	createCollection,
	type MutationBatch,
} from "./collection";
import type { CollectionHandle, CollectionHandles } from "./collection-handle";
import { createEmitter } from "./emitter";
import type { StandardSchemaV1 } from "./standard-schema";
import { executeTransaction, type TransactionContext } from "./transaction";
import type { AnyObjectSchema, SchemasMap } from "./types";

export type CollectionConfigMap<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
};

type CollectionInstances<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: Collection<Schemas[K]>;
};

type MutationEnvelope<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: {
		collection: K;
	} & MutationBatch<StandardSchemaV1.InferOutput<Schemas[K]>>;
}[keyof Schemas];

export type DatabaseMutationEvent<Schemas extends SchemasMap> =
	MutationEnvelope<Schemas>[];

export type DatabaseEvents<Schemas extends SchemasMap> = {
	mutation: DatabaseMutationEvent<Schemas>;
};

export type CollectionConfig<T extends AnyObjectSchema> = {
	schema: T;
	getId: (item: StandardSchemaV1.InferOutput<T>) => string;
};

export type DatabasePlugin<Schemas extends SchemasMap> = {
	handlers: {
		init?: (db: Database<Schemas>) => Promise<unknown> | unknown;
		dispose?: (db: Database<Schemas>) => Promise<unknown> | unknown;
	};
};

export type DbConfig<Schemas extends SchemasMap> = {
	name: string;
	schema: CollectionConfigMap<Schemas>;
	version?: number;
};

export type Database<Schemas extends SchemasMap> =
	CollectionHandles<Schemas> & {
		name: string;
		version: number;
		begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R;
		toDocuments(): {
			[K in keyof Schemas]: JsonDocument<
				StandardSchemaV1.InferOutput<Schemas[K]>
			>;
		};
		on(
			event: "mutation",
			handler: (payload: DatabaseMutationEvent<Schemas>) => unknown,
		): () => void;
		use(plugin: DatabasePlugin<Schemas>): Database<Schemas>;
		init(): Promise<Database<Schemas>>;
		dispose(): Promise<void>;
		collectionKeys(): (keyof Schemas)[];
	};

/**
 * Create a typed database instance with collection access.
 * @param config - Database configuration
 * @param config.name - Database name used for persistence and routing
 * @param config.schema - Collection schema definitions
 * @param config.version - Optional database version, defaults to 1
 * @returns A database instance with typed collection properties
 *
 * @example
 * ```typescript
 * const db = await createDatabase({
 *   name: "my-app",
 *   schema: {
 *     tasks: { schema: taskSchema, getId: (task) => task.id },
 *   },
 * })
 *   .use(idbPlugin())
 *   .init();
 *
 * const task = db.tasks.add({ title: 'Learn Starling' });
 * ```
 */
export function createDatabase<Schemas extends SchemasMap>(
	config: DbConfig<Schemas>,
): Database<Schemas> {
	const { name, schema, version = 1 } = config;
	const clock = createClock();
	const getEventstamp = () => clock.now();
	const collections = makeCollections(schema, getEventstamp);
	const handles = makeHandles(collections);

	// Database-level emitter
	const dbEmitter = createEmitter<DatabaseEvents<Schemas>>();

	// Subscribe to all collection events and re-emit at database level
	for (const collectionName of Object.keys(collections) as (keyof Schemas)[]) {
		const collection = collections[collectionName];

		collection.on("mutation", (mutations) => {
			// Only emit if there were actual changes
			if (
				mutations.added.length > 0 ||
				mutations.updated.length > 0 ||
				mutations.removed.length > 0
			) {
				dbEmitter.emit("mutation", [
					{
						collection: collectionName,
						added: mutations.added,
						updated: mutations.updated,
						removed: mutations.removed,
					},
				] as DatabaseMutationEvent<Schemas>);
			}
		});
	}

	const plugins: DatabasePlugin<Schemas>[] = [];

	const db = {
		...handles,
		name,
		version,
		begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R {
			return executeTransaction(schema, collections, getEventstamp, callback);
		},
		toDocuments() {
			const documents = {} as {
				[K in keyof Schemas]: JsonDocument<
					StandardSchemaV1.InferOutput<Schemas[K]>
				>;
			};

			for (const dbName of Object.keys(collections) as (keyof Schemas)[]) {
				documents[dbName] = collections[dbName].toDocument();
			}

			return documents;
		},
		on(event, handler) {
			return dbEmitter.on(event, handler);
		},
		use(plugin: DatabasePlugin<Schemas>) {
			plugins.push(plugin);
			return db;
		},
		async init() {
			// Execute all plugin init handlers sequentially
			for (const plugin of plugins) {
				if (plugin.handlers.init) {
					await plugin.handlers.init(db);
				}
			}
			return db;
		},
		async dispose() {
			// Execute all plugin dispose handlers sequentially (in reverse order)
			for (let i = plugins.length - 1; i >= 0; i--) {
				const plugin = plugins[i];
				if (plugin?.handlers.dispose) {
					await plugin.handlers.dispose(db);
				}
			}
		},
		collectionKeys() {
			return Object.keys(collections) as (keyof Schemas)[];
		},
	} as Database<Schemas>;

	return db;
}

function makeCollections<Schemas extends SchemasMap>(
	configs: CollectionConfigMap<Schemas>,
	getEventstamp: () => string,
): CollectionInstances<Schemas> {
	const collections = {} as CollectionInstances<Schemas>;

	for (const name of Object.keys(configs) as (keyof Schemas)[]) {
		const config = configs[name];
		collections[name] = createCollection(
			name as string,
			config.schema,
			config.getId,
			getEventstamp,
		);
	}

	return collections;
}

function makeHandles<Schemas extends SchemasMap>(
	collections: CollectionInstances<Schemas>,
): CollectionHandles<Schemas> {
	const handles = {} as CollectionHandles<Schemas>;

	for (const name of Object.keys(collections) as (keyof Schemas)[]) {
		// Create handles that dynamically look up collections
		// This ensures handles see updated collections after transactions
		handles[name] = {
			add(item) {
				return collections[name].add(item);
			},
			update(id, updates) {
				collections[name].update(id, updates);
			},
			remove(id) {
				collections[name].remove(id);
			},
			merge(document) {
				collections[name].merge(document);
			},
			get(id, opts) {
				return collections[name].get(id, opts);
			},
			getAll(opts) {
				return collections[name].getAll(opts);
			},
			find(filter, opts) {
				return collections[name].find(filter, opts);
			},
			toDocument() {
				return collections[name].toDocument();
			},
			on(event, handler) {
				return collections[name].on(event, handler);
			},
		} as CollectionHandle<Schemas[typeof name]>;
	}

	return handles;
}
