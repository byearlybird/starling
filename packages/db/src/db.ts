import { type AnyObject, Clock } from "@byearlybird/starling";
import { type Collection, createCollection } from "./collection";
import {
	type CollectionHandle,
	createCollectionHandle,
} from "./collection-handle";
import type { StandardSchemaV1 } from "./standard-schema";
import { type TransactionContext, executeTransaction } from "./transaction";

type AnyObjectSchema<T extends AnyObject = AnyObject> = StandardSchemaV1<T>;

export type CollectionConfig<T extends AnyObjectSchema> = {
	schema: T;
	getId: (item: StandardSchemaV1.InferOutput<T>) => string;
};

export type DbConfig<Schemas extends Record<string, AnyObjectSchema>> = {
	schema: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	};
};

export type Database<Schemas extends Record<string, AnyObjectSchema>> = {
	[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
	begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R;
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
	const clock = new Clock();
	const getEventstamp = () => clock.now();
	const collections = makeCollections(config.schema, getEventstamp);
	const handles = makeHandles(collections);

	return {
		...handles,
		begin<R>(callback: (tx: TransactionContext<Schemas>) => R): R {
			return executeTransaction(config.schema, collections, getEventstamp, callback);
		},
	};
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
			get(id, opts) {
				return collections[name].get(id, opts);
			},
			getAll(opts) {
				return collections[name].getAll(opts);
			},
			find(filter, opts) {
				return collections[name].find(filter, opts);
			},
		} as CollectionHandle<Schemas[typeof name]>;
	}

	return handles;
}
