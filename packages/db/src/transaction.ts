import {
	type Collection,
	CollectionInternals,
	type CollectionWithInternals,
	createCollection,
} from "./collection";
import type { CollectionConfigMap } from "./db";
import type { AnyObjectSchema, SchemasMap } from "./types";

/** Transaction-safe collection handle that excludes event subscription and serialization */
export type TransactionCollectionHandle<T extends AnyObjectSchema> = Omit<
	Collection<T>,
	"on" | "toDocument"
>;

type TransactionCollectionHandles<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: TransactionCollectionHandle<Schemas[K]>;
};

export type TransactionContext<Schemas extends SchemasMap> =
	TransactionCollectionHandles<Schemas> & {
		rollback(): void;
	};

/**
 * Execute a transaction with snapshot isolation and copy-on-write optimization.
 *
 * @param configs - Collection configurations for creating new instances
 * @param collections - Active collection instances (mutable reference)
 * @param getEventstamp - Function to generate eventstamps
 * @param callback - Transaction callback with tx context
 * @returns The return value from the callback
 *
 * @remarks
 * - Collections are cloned lazily on first access (read or write)
 * - Provides snapshot isolation: tx sees consistent data from first access
 * - Explicit rollback via tx.rollback() or implicit on exception
 * - Only modified collections are committed back
 */
export function executeTransaction<Schemas extends SchemasMap, R>(
	configs: CollectionConfigMap<Schemas>,
	collections: { [K in keyof Schemas]: CollectionWithInternals<Schemas[K]> },
	getEventstamp: () => string,
	callback: (tx: TransactionContext<Schemas>) => R,
): R {
	// Track which collections have been cloned (copy-on-write optimization)
	const clonedCollections = new Map<
		keyof Schemas,
		CollectionWithInternals<AnyObjectSchema>
	>();

	// Create lazy transaction handles
	const txHandles = {} as TransactionCollectionHandles<Schemas>;

	for (const name of Object.keys(collections) as (keyof Schemas)[]) {
		const originalCollection = collections[name];
		const config = configs[name];

		// Clone function (called lazily on first access - read or write)
		const getClonedCollection = () => {
			if (!clonedCollections.has(name)) {
				const cloned = createCollection(
					name as string,
					config.schema,
					config.getId,
					getEventstamp,
					originalCollection[CollectionInternals.data](),
					{ autoFlush: false }, // Don't auto-flush during transactions
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
	result = callback(tx);

	// Commit only the collections that were actually modified
	if (!shouldRollback) {
		for (const [name, clonedCollection] of clonedCollections.entries()) {
			const originalCollection = collections[name];

			// Get pending mutations from the cloned collection
			const pendingMutations =
				clonedCollection[CollectionInternals.getPendingMutations]();

			// Replace the data inside the original collection
			originalCollection[CollectionInternals.replaceData](
				clonedCollection[CollectionInternals.data](),
			);

			// Emit the batched mutation event on the original collection
			originalCollection[CollectionInternals.emitMutations](pendingMutations);
		}
	}

	return result;
}

/**
 * Create a transaction handle that lazily clones on first access (copy-on-write).
 *
 * @param originalCollection - The base collection (not modified)
 * @param getClonedCollection - Lazy cloner (invoked on first access)
 * @returns A collection handle with snapshot isolation
 *
 * @remarks
 * First read or write triggers cloning, providing snapshot isolation.
 * All subsequent operations use the cloned collection.
 * Excluded methods:
 * - on(): events are only emitted after the transaction commits
 * - toDocument(): serialization should happen outside transactions
 */
function createLazyTransactionHandle<T extends AnyObjectSchema>(
	_originalCollection: CollectionWithInternals<T>,
	getClonedCollection: () => CollectionWithInternals<T>,
): TransactionCollectionHandle<T> {
	let cloned: CollectionWithInternals<T> | null = null;

	const ensureCloned = () => {
		if (!cloned) {
			cloned = getClonedCollection();
		}
		return cloned;
	};

	return {
		get(id, opts) {
			return ensureCloned().get(id, opts);
		},

		getAll(opts) {
			return ensureCloned().getAll(opts);
		},

		find(filter, opts) {
			return ensureCloned().find(filter, opts);
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

		merge(document) {
			ensureCloned().merge(document);
		},
	};
}
