import type { Collection } from "./collection";
import type { StandardSchemaV1 } from "./standard-schema";
import type { AnyObjectSchema } from "./types";

export type CollectionHandle<Schema extends AnyObjectSchema> = {
	add(
		item: StandardSchemaV1.InferInput<Schema>,
	): StandardSchemaV1.InferOutput<Schema>;
	update(
		id: string,
		updates: Partial<StandardSchemaV1.InferInput<Schema>>,
	): void;
	remove(id: string): void;
	get(
		id: string,
		opts?: { includeDeleted?: boolean },
	): StandardSchemaV1.InferOutput<Schema> | null;
	getAll(opts?: {
		includeDeleted?: boolean;
	}): StandardSchemaV1.InferOutput<Schema>[];
	find<U = StandardSchemaV1.InferOutput<Schema>>(
		filter: (item: StandardSchemaV1.InferOutput<Schema>) => boolean,
		opts?: {
			map?: (item: StandardSchemaV1.InferOutput<Schema>) => U;
			sort?: (a: U, b: U) => number;
		},
	): U[];
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

		get(id, opts) {
			return collection.get(id, opts);
		},

		getAll(opts) {
			return collection.getAll(opts);
		},

		find(filter, opts) {
			return collection.find(filter, opts);
		},
	};
}
