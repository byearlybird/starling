import type { Collection } from "./collection";
import type { AnyObjectSchema, SchemasMap } from "./types";

export type CollectionHandle<Schema extends AnyObjectSchema> = Pick<
	Collection<Schema>,
	| "add"
	| "update"
	| "remove"
	| "merge"
	| "get"
	| "getAll"
	| "find"
	| "toDocument"
	| "on"
>;

export type CollectionHandles<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: CollectionHandle<Schemas[K]>;
};

/**
 * Transaction-safe collection handle that excludes event subscription.
 * Event subscriptions don't make sense within transactions since events
 * are only emitted after the transaction commits.
 */
export type TransactionCollectionHandle<Schema extends AnyObjectSchema> = Omit<
	CollectionHandle<Schema>,
	"on"
>;

export type TransactionCollectionHandles<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: TransactionCollectionHandle<Schemas[K]>;
};

export function createCollectionHandle<Schema extends AnyObjectSchema>(
	collection: Collection<Schema>,
): CollectionHandle<Schema> {
	return {
		add(item) {
			return collection.add(item);
		},

		update(id, updates) {
			collection.update(id, updates);
		},

		remove(id) {
			collection.remove(id);
		},

		merge(document) {
			collection.merge(document);
		},

		toDocument() {
			return collection.toDocument();
		},

		get(id, opts) {
			return collection.get(id, opts);
		},

		getAll(opts) {
			return collection.getAll(opts);
		},

		find(filter, opts) {
			return collection.find(filter, opts);
		},

		on(event, handler) {
			return collection.on(event, handler);
		},
	};
}
