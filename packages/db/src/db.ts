import {
	type AnyObject,
	createClock,
	type JsonDocument,
} from "@byearlybird/starling";
import { type Collection, createCollection } from "./collection";
import type { CollectionHandle } from "./collection-handle";
import { createEmitter } from "./emitter";
import type { StandardSchemaV1 } from "./standard-schema";
import { executeTransaction, type TransactionContext } from "./transaction";

type AnyObjectSchema<T extends AnyObject = AnyObject> = StandardSchemaV1<T>;

export type DatabaseMutationEvent<
	Schemas extends Record<string, AnyObjectSchema>,
> = {
	[K in keyof Schemas]: {
		collection: K;
		added: Array<{
			id: string;
			item: StandardSchemaV1.InferOutput<Schemas[K]>;
		}>;
		updated: Array<{
			id: string;
			before: StandardSchemaV1.InferOutput<Schemas[K]>;
			after: StandardSchemaV1.InferOutput<Schemas[K]>;
		}>;
		removed: Array<{
			id: string;
			item: StandardSchemaV1.InferOutput<Schemas[K]>;
		}>;
	};
}[keyof Schemas][];

export type DatabaseEvents<Schemas extends Record<string, AnyObjectSchema>> = {
	mutation: DatabaseMutationEvent<Schemas>;
};

export type CollectionConfig<T extends AnyObjectSchema> = {
	schema: T;
	getId: (item: StandardSchemaV1.InferOutput<T>) => string;
};

export type DatabasePlugin<Schemas extends Record<string, AnyObjectSchema>> = {
	handlers: {
		init?: (db: Database<Schemas>) => Promise<void> | void;
		dispose?: (db: Database<Schemas>) => Promise<void> | void;
	};
};

export type DbConfig<Schemas extends Record<string, AnyObjectSchema>> = {
	schema: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	};
	plugins?: DatabasePlugin<Schemas>[];
};

export type Database<Schemas extends Record<string, AnyObjectSchema>> = {
	[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
	begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R;
	toDocuments(): {
		[K in keyof Schemas]: JsonDocument<
			StandardSchemaV1.InferOutput<Schemas[K]>
		>;
	};
	on(
		event: "mutation",
		handler: (payload: DatabaseMutationEvent<Schemas>) => void,
	): () => void;
	init(): Promise<void>;
	dispose(): Promise<void>;
};

/**
 * Create a typed database instance with collection access.
 * @param config - Database configuration with schema definitions
 * @returns A database instance with typed collection properties
 *
 * @example
 * ```typescript
 * const db = createDatabase({
 *   schema: {
 *     tasks: { schema: taskSchema, getId: (task) => task.id },
 *   }
 * });
 *
 * const task = db.tasks.add({ title: 'Learn Starling' });
 * ```
 */
export function createDatabase<Schemas extends Record<string, AnyObjectSchema>>(
	config: DbConfig<Schemas>,
): Database<Schemas> {
	const clock = createClock();
	const getEventstamp = () => clock.now();
	const collections = makeCollections(config.schema, getEventstamp);
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

	const plugins = config.plugins ?? [];

	const db = {
		...handles,
		begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R {
			return executeTransaction(
				config.schema,
				collections,
				getEventstamp,
				callback,
			);
		},
		toDocuments() {
			const documents = {} as {
				[K in keyof Schemas]: JsonDocument<
					StandardSchemaV1.InferOutput<Schemas[K]>
				>;
			};

			for (const name of Object.keys(collections) as (keyof Schemas)[]) {
				documents[name] = collections[name].toDocument();
			}

			return documents;
		},
		on(event, handler) {
			return dbEmitter.on(event, handler);
		},
		async init() {
			// Execute all plugin init handlers sequentially
			for (const plugin of plugins) {
				if (plugin.handlers.init) {
					await plugin.handlers.init(db);
				}
			}
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
	} as Database<Schemas>;

	return db;
}

function makeCollections<Schemas extends Record<string, AnyObjectSchema>>(
	configs: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	},
	getEventstamp: () => string,
): { [K in keyof Schemas]: Collection<Schemas[K]> } {
	const collections = {} as {
		[K in keyof Schemas]: Collection<Schemas[K]>;
	};

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

function makeHandles<Schemas extends Record<string, AnyObjectSchema>>(
	collections: {
		[K in keyof Schemas]: Collection<Schemas[K]>;
	},
): { [K in keyof Schemas]: CollectionHandle<Schemas[K]> } {
	const handles = {} as {
		[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
	};

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
