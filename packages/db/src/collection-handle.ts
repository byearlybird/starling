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
 * Transaction-safe collection handle that excludes event subscription and serialization.
 * - Event subscriptions don't make sense since events are only emitted after commit
 * - toDocument is excluded as serialization should happen outside transactions
 */
export type TransactionCollectionHandle<Schema extends AnyObjectSchema> = Omit<
	CollectionHandle<Schema>,
	"on" | "toDocument"
>;

export type TransactionCollectionHandles<Schemas extends SchemasMap> = {
	[K in keyof Schemas]: TransactionCollectionHandle<Schemas[K]>;
};

export function createCollectionHandle<Schema extends AnyObjectSchema>(
	getCollection: () => Collection<Schema>,
): CollectionHandle<Schema> {
	return {
		add(item) {
			return getCollection().add(item);
		},

		update(id, updates) {
			getCollection().update(id, updates);
		},

		remove(id) {
			getCollection().remove(id);
		},

		merge(document) {
			getCollection().merge(document);
		},

		toDocument() {
			return getCollection().toDocument();
		},

		get(id, opts) {
			return getCollection().get(id, opts);
		},

		getAll(opts) {
			return getCollection().getAll(opts);
		},

		find(filter, opts) {
			return getCollection().find(filter, opts);
		},

		on(event, handler) {
			return getCollection().on(event, handler);
		},
	};
}
