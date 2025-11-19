import type { StandardSchemaV1 } from "./standard-schema";
import type { AnyObjectSchema } from "./types";
import type { Collection } from "./collection";
import { createCollection } from "./collection";
import {
	type CollectionHandle,
	createCollectionHandle,
} from "./collection-handle";
import type { CollectionConfig } from "./db";

export type TransactionContext<
	Schemas extends Record<string, AnyObjectSchema>,
> = {
	[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
} & {
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
export function executeTransaction<
	Schemas extends Record<string, AnyObjectSchema>,
	R,
>(
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

		// Clone function (called lazily on first access - read or write)
		const getClonedCollection = () => {
			if (!clonedCollections.has(name)) {
				const cloned = createCollection(
					name as string,
					config.schema,
					config.getId,
					getEventstamp,
					originalCollection.data(),
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
			const originalCollection = collections[name];

			// Get pending mutations from the cloned collection
			const pendingMutations = clonedCollection._getPendingMutations();

			// Replace the collection with the committed version FIRST
			// This ensures the new data is in place when events are emitted
			collections[name] = createCollection(
				name as string,
				config.schema,
				config.getId,
				getEventstamp,
				clonedCollection.data(),
			);

			// Emit the batched mutation event on the original collection
			// (which still has the event subscriptions)
			originalCollection._emitMutations(pendingMutations);
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
	};
}
