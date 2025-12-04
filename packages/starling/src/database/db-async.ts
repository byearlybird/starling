import { createClock, createClockFromEventstamp, type JsonDocument } from "../core";
import { createEmitter } from "./emitter";
import { loadClock, openIndexedDB, saveClock } from "./idb-helpers";
import {
	createIDBCollection,
	type IDBCollection,
	type MutationBatch,
} from "./idb-collection";
import {
	executeAsyncQuery,
	type AsyncQueryContext,
	type AsyncQueryHandle,
} from "./query-async";
import type { StandardSchemaV1 } from "./standard-schema";
import {
	executeAsyncTransaction,
	type AsyncTransactionContext,
} from "./transaction-async";
import type { AnyObjectSchema, SchemasMap } from "./types";

export type AsyncCollections<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: IDBCollection<Schemas[K]>;
};

export type CollectionConfigMap<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
};

type CollectionInstances<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: IDBCollection<Schemas[K]>;
};

export type MutationEnvelope<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: {
		collection: K;
	} & MutationBatch<StandardSchemaV1.InferOutput<Schemas[K]>>;
}[keyof Schemas];

export type DatabaseMutationEvent<Schemas extends SchemasMap> =
	MutationEnvelope<Schemas>;

export type DatabaseEvents<Schemas extends SchemasMap> = {
	mutation: DatabaseMutationEvent<Schemas>;
};

export type CollectionConfig<T extends AnyObjectSchema> = {
	schema: T;
	getId: (item: StandardSchemaV1.InferOutput<T>) => string;
};

export type DbConfig<Schemas extends SchemasMap> = {
	name: string;
	schema: CollectionConfigMap<Schemas>;
	version?: number;
};

export type AsyncDatabase<Schemas extends SchemasMap> =
	AsyncCollections<Schemas> & {
		name: string;
		version: number;
		begin<R>(
			callback: (tx: AsyncTransactionContext<Schemas>) => Promise<R>,
		): Promise<R>;
		query<R>(
			callback: (ctx: AsyncQueryContext<Schemas>) => Promise<R>,
		): AsyncQueryHandle<R>;
		toDocuments(): Promise<{
			[K in keyof Schemas]: JsonDocument<
				StandardSchemaV1.InferOutput<Schemas[K]>
			>;
		}>;
		on(
			event: "mutation",
			handler: (payload: DatabaseMutationEvent<Schemas>) => unknown,
		): () => void;
		dispose(): Promise<void>;
		collectionKeys(): (keyof Schemas)[];
	};

/**
 * Create an async IDB-backed database instance.
 * All data is stored in IndexedDB and loaded on demand.
 *
 * @param config - Database configuration
 * @param config.name - Database name used for IndexedDB
 * @param config.schema - Collection schema definitions
 * @param config.version - Optional database version, defaults to 1
 * @returns A promise that resolves to a database instance
 *
 * @example
 * ```typescript
 * const db = await createAsyncDatabase({
 *   name: "my-app",
 *   schema: {
 *     tasks: { schema: taskSchema, getId: (task) => task.id },
 *   },
 * });
 *
 * const task = await db.tasks.add({ title: 'Learn Starling' });
 * ```
 */
export async function createAsyncDatabase<Schemas extends SchemasMap>(
	config: DbConfig<Schemas>,
): Promise<AsyncDatabase<Schemas>> {
	const { name, schema, version = 1 } = config;

	// Open IndexedDB connection
	const collectionNames = Object.keys(schema) as (keyof Schemas)[];
	const idb = await openIndexedDB(
		name,
		version,
		collectionNames.map(String),
	);

	// Load or create clock
	const savedClock = await loadClock(idb);
	const clock = savedClock
		? createClockFromEventstamp(savedClock)
		: createClock();
	const getEventstamp = () => clock.now();

	// Create IDB-backed collections
	const collections = makeIDBCollections(idb, schema, getEventstamp);

	// Database-level emitter
	const dbEmitter = createEmitter<DatabaseEvents<Schemas>>();

	// Subscribe to all collection events and re-emit at database level
	for (const collectionName of collectionNames) {
		const collection = collections[collectionName];

		collection.on("mutation", (mutations) => {
			// Only emit if there were actual changes
			if (
				mutations.added.length > 0 ||
				mutations.updated.length > 0 ||
				mutations.removed.length > 0
			) {
				dbEmitter.emit("mutation", {
					collection: collectionName,
					added: mutations.added,
					updated: mutations.updated,
					removed: mutations.removed,
				} as DatabaseMutationEvent<Schemas>);
			}
		});
	}

	const db: AsyncDatabase<Schemas> = {
		...(collections as unknown as AsyncCollections<Schemas>),
		name,
		version,
		async begin<R>(
			callback: (tx: AsyncTransactionContext<Schemas>) => Promise<R>,
		): Promise<R> {
			return await executeAsyncTransaction(
				idb,
				schema,
				getEventstamp,
				callback,
			);
		},
		query<R>(
			callback: (ctx: AsyncQueryContext<Schemas>) => Promise<R>,
		): AsyncQueryHandle<R> {
			return executeAsyncQuery(db, callback);
		},
		async toDocuments() {
			const documents = {} as {
				[K in keyof Schemas]: JsonDocument<
					StandardSchemaV1.InferOutput<Schemas[K]>
				>;
			};

			for (const collectionName of collectionNames) {
				documents[collectionName] =
					await collections[collectionName].toDocument();
			}

			return documents;
		},
		on(event, handler) {
			return dbEmitter.on(event, handler);
		},
		async dispose() {
			// Save clock state
			await saveClock(idb, clock.latest());

			// Close IDB connection
			idb.close();
		},
		collectionKeys() {
			return collectionNames;
		},
	};

	return db;
}

function makeIDBCollections<Schemas extends SchemasMap>(
	idb: IDBDatabase,
	configs: CollectionConfigMap<Schemas>,
	getEventstamp: () => string,
): CollectionInstances<Schemas> {
	const collections = {} as CollectionInstances<Schemas>;

	for (const name of Object.keys(configs) as (keyof Schemas)[]) {
		const config = configs[name];
		collections[name] = createIDBCollection(
			idb,
			name as string,
			config.schema,
			config.getId,
			getEventstamp,
		);
	}

	return collections;
}
