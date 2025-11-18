import { type AnyObject, Clock } from "@byearlybird/starling";
import { type Collection, createCollection } from "./collection";
import {
	type CollectionHandle,
	createCollectionHandle,
} from "./collection-handle";
import type { StandardSchemaV1 } from "./standard-schema";

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

export type TransactionContext<
	Schemas extends Record<string, AnyObjectSchema>,
> = {
	[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
	rollback(): void;
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
		handles[name] = createCollectionHandle(collections[name]);
	}

	return handles;
}

function executeTransaction<Schemas extends Record<string, AnyObjectSchema>, R>(
	configs: {
		[K in keyof Schemas]: CollectionConfig<Schemas[K]>;
	},
	collections: {
		[K in keyof Schemas]: Collection<Schemas[K]>;
	},
	getEventstamp: () => string,
	callback: (tx: TransactionContext<Schemas>) => R,
): R {
	// Clone all collections by creating new ones with existing data
	const clonedCollections = {} as {
		[K in keyof Schemas]: Collection<Schemas[K]>;
	};
	for (const name of Object.keys(collections) as (keyof Schemas)[]) {
		const config = configs[name];
		clonedCollections[name] = createCollection(
			name as string,
			config.schema,
			config.getId,
			getEventstamp,
			collections[name].data(),
		);
	}

	// Track rollback state
	let shouldRollback = false;

	// Create transaction context with rollback capability
	const txHandles = makeHandles(clonedCollections);
	const tx = {
		...txHandles,
		rollback() {
			shouldRollback = true;
		},
	} as TransactionContext<Schemas>;

	// Execute callback
	let result: R;
	try {
		result = callback(tx);
	} catch (error) {
		// Automatic rollback on exception
		throw error;
	}

	// Commit if not rolled back
	if (!shouldRollback) {
		// Replace each collection with a new one created from transaction data
		for (const name of Object.keys(collections) as (keyof Schemas)[]) {
			const config = configs[name];
			collections[name] = createCollection(
				name as string,
				config.schema,
				config.getId,
				getEventstamp,
				clonedCollections[name].data(),
			);
		}
	}

	return result;
}
