import {
	deleteResource,
	makeResource,
	mergeResources,
	type ResourceObject,
} from "@byearlybird/starling";
import { type StandardSchemaV1, standardValidate } from "./standard-schema";
import type { AnyObjectSchema } from "./types";

export type Collection<T extends AnyObjectSchema> = {
	get(
		id: string,
		opts?: { includeDeleted?: boolean },
	): StandardSchemaV1.InferOutput<T> | null;
	getAll(opts?: {
		includeDeleted?: boolean;
	}): StandardSchemaV1.InferOutput<T>[];
	find<U = StandardSchemaV1.InferOutput<T>>(
		filter: (item: StandardSchemaV1.InferOutput<T>) => boolean,
		opts?: {
			map?: (item: StandardSchemaV1.InferOutput<T>) => U;
			sort?: (a: U, b: U) => number;
		},
	): U[];
	add(item: StandardSchemaV1.InferInput<T>): StandardSchemaV1.InferOutput<T>;
	update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>): void;
	remove(id: string): void;
	clone(): Collection<T>;
};

export function createCollection<T extends AnyObjectSchema>(
	name: string,
	schema: T,
	getId: (item: StandardSchemaV1.InferOutput<T>) => string,
	getEventstamp: () => string,
	initialData?: Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>,
): Collection<T> {
	const data =
		initialData ??
		new Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>();

	return {
		get(id: string, opts: { includeDeleted?: boolean } = {}) {
			const resource = data.get(id);
			if (!resource) {
				return null;
			}

			if (!opts.includeDeleted && resource.meta.deletedAt) {
				return null;
			}

			return resource.attributes;
		},

		getAll(opts: { includeDeleted?: boolean } = {}) {
			const resources = Array.from(data.values());
			if (opts.includeDeleted) {
				return resources.map((resource) => resource.attributes);
			} else {
				return resources
					.filter((resource) => !resource.meta.deletedAt)
					.map((resource) => resource.attributes);
			}
		},

		find<U = StandardSchemaV1.InferOutput<T>>(
			filter: (item: StandardSchemaV1.InferOutput<T>) => boolean,
			opts?: {
				map?: (item: StandardSchemaV1.InferOutput<T>) => U;
				sort?: (a: U, b: U) => number;
			},
		): U[] {
			const results: U[] = [];

			for (const [, resource] of data.entries()) {
				const attributes = resource.attributes;

				if (filter(attributes)) {
					const value = opts?.map ? opts.map(attributes) : (attributes as U);

					results.push(value);
				}
			}

			if (opts?.sort) {
				results.sort(opts.sort);
			}

			return results;
		},

		add(item: StandardSchemaV1.InferInput<T>) {
			const validated = standardValidate(schema, item);
			const id = getId(validated);

			if (data.has(id)) {
				throw new DuplicateIdError(id);
			}

			const resource = makeResource(name, id, validated, getEventstamp());
			data.set(id, resource);
			return validated;
		},

		update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>) {
			const existing = data.get(id);

			if (!existing) {
				throw new IdNotFoundError(id);
			}

			const merged = mergeResources(
				existing,
				makeResource(name, id, updates, getEventstamp()),
			);

			standardValidate(schema, merged.attributes);

			data.set(id, merged);
		},

		remove(id: string) {
			const existing = data.get(id);
			if (!existing) {
				throw new IdNotFoundError(id);
			}

			const removed = deleteResource(existing, getEventstamp());

			data.set(id, removed);
		},

		clone() {
			return createCollection(
				name,
				schema,
				getId,
				getEventstamp,
				new Map(data),
			);
		},
	};
}

export class IdNotFoundError extends Error {
	constructor(id: string) {
		super(`Resource with id ${id} not found`);
		this.name = "IdNotFoundError";
	}
}

export class DuplicateIdError extends Error {
	constructor(id: string) {
		super(`Resource with id ${id} already exists`);
		this.name = "DuplicateIdError";
	}
}
