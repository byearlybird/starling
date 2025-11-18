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
	// Track which collections have been cloned (copy-on-write optimization)
	const clonedCollections = new Map<keyof Schemas, Collection<any>>();

	// Create lazy transaction handles
	const txHandles = {} as {
		[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
	};

	for (const name of Object.keys(collections) as (keyof Schemas)[]) {
		const originalCollection = collections[name];
		const config = configs[name];

		// Clone function (called lazily on first write)
		const getClonedCollection = () => {
			if (!clonedCollections.has(name)) {
				const cloned = createCollection(
					name as string,
					config.schema,
					config.getId,
					getEventstamp,
					originalCollection.data(),
				);
				clonedCollections.set(name, cloned);
			}
			return clonedCollections.get(name)!;
		};

		txHandles[name] = createLazyTransactionHandle(
			originalCollection,
			getClonedCollection,
		);
	}

	// Track rollback state
	let shouldRollback = false;

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

	// Commit only the collections that were actually modified
	if (!shouldRollback) {
		for (const [name, clonedCollection] of clonedCollections.entries()) {
			const config = configs[name];
			collections[name] = createCollection(
				name as string,
				config.schema,
				config.getId,
				getEventstamp,
				clonedCollection.data(),
			);
		}
	}

	return result;
}

/**
 * Create a transaction handle that lazily clones on first write (copy-on-write).
 * Reads use the original collection until a write occurs, then switch to the clone.
 */
function createLazyTransactionHandle<T extends AnyObjectSchema>(
	originalCollection: Collection<T>,
	getClonedCollection: () => Collection<T>,
): CollectionHandle<T> {
	let cloned: Collection<T> | null = null;

	const ensureCloned = () => {
		if (!cloned) {
			cloned = getClonedCollection();
		}
		return cloned;
	};

	const getActiveCollection = () => cloned ?? originalCollection;

	return {
		get(id, opts) {
			return getActiveCollection().get(id, opts);
		},

		getAll(opts) {
			return getActiveCollection().getAll(opts);
		},

		find(filter, opts) {
			return getActiveCollection().find(filter, opts);
		},

		add(item) {
			return ensureCloned().add(item);
		},

		update(id, updates) {
			ensureCloned().update(id, updates);
		},

		remove(id) {
			ensureCloned().remove(id);
		},
	};
}
