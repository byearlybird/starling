import {
	deleteResource,
	type JsonDocument,
	makeResource,
	mergeDocuments,
	mergeResources,
	type ResourceObject,
} from "@byearlybird/starling";
import { createEmitter } from "./emitter";
import { type StandardSchemaV1, standardValidate } from "./standard-schema";
import type { AnyObjectSchema } from "./types";

export type CollectionMutationEvent<T> = {
	added: Array<{ id: string; item: T }>;
	updated: Array<{ id: string; before: T; after: T }>;
	removed: Array<{ id: string; item: T }>;
};

export type CollectionEvents<T> = {
	mutation: CollectionMutationEvent<T>;
};

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
	merge(document: JsonDocument<StandardSchemaV1.InferOutput<T>>): void;
	data(): Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>;
	on(
		event: "mutation",
		handler: (
			payload: CollectionMutationEvent<StandardSchemaV1.InferOutput<T>>,
		) => void,
	): () => void;
	_flushMutations(): void;
	_getPendingMutations(): CollectionMutationEvent<
		StandardSchemaV1.InferOutput<T>
	>;
	_emitMutations(
		mutations: CollectionMutationEvent<StandardSchemaV1.InferOutput<T>>,
	): void;
};

export function createCollection<T extends AnyObjectSchema>(
	name: string,
	schema: T,
	getId: (item: StandardSchemaV1.InferOutput<T>) => string,
	getEventstamp: () => string,
	initialData?: Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>,
	options?: { autoFlush?: boolean },
): Collection<T> {
	const autoFlush = options?.autoFlush ?? true;
	const data =
		initialData ??
		new Map<string, ResourceObject<StandardSchemaV1.InferOutput<T>>>();

	const emitter =
		createEmitter<CollectionEvents<StandardSchemaV1.InferOutput<T>>>();

	// Pending mutations buffer
	const pendingMutations: CollectionMutationEvent<
		StandardSchemaV1.InferOutput<T>
	> = {
		added: [],
		updated: [],
		removed: [],
	};

	const flushMutations = () => {
		if (
			pendingMutations.added.length > 0 ||
			pendingMutations.updated.length > 0 ||
			pendingMutations.removed.length > 0
		) {
			emitter.emit("mutation", {
				added: [...pendingMutations.added],
				updated: [...pendingMutations.updated],
				removed: [...pendingMutations.removed],
			});

			// Clear the buffer
			pendingMutations.added = [];
			pendingMutations.updated = [];
			pendingMutations.removed = [];
		}
	};

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

			// Buffer the add mutation
			pendingMutations.added.push({ id, item: validated });

			// Flush immediately for non-transaction operations
			if (autoFlush) {
				flushMutations();
			}

			return validated;
		},

		update(id: string, updates: Partial<StandardSchemaV1.InferInput<T>>) {
			const existing = data.get(id);

			if (!existing) {
				throw new IdNotFoundError(id);
			}

			// Capture the before state
			const before = existing.attributes;

			const merged = mergeResources(
				existing,
				makeResource(name, id, updates, getEventstamp()),
			);

			standardValidate(schema, merged.attributes);

			data.set(id, merged);

			// Buffer the update mutation
			pendingMutations.updated.push({
				id,
				before,
				after: merged.attributes,
			});

			// Flush immediately for non-transaction operations
			if (autoFlush) {
				flushMutations();
			}
		},

		remove(id: string) {
			const existing = data.get(id);
			if (!existing) {
				throw new IdNotFoundError(id);
			}

			// Capture the item before deletion
			const item = existing.attributes;

			const removed = deleteResource(existing, getEventstamp());

			data.set(id, removed);

			// Buffer the remove mutation
			pendingMutations.removed.push({ id, item });

			// Flush immediately for non-transaction operations
			if (autoFlush) {
				flushMutations();
			}
		},

		merge(document: JsonDocument<StandardSchemaV1.InferOutput<T>>) {
			// Capture before state for update/delete event tracking
			const beforeState = new Map<string, StandardSchemaV1.InferOutput<T>>();
			for (const [id, resource] of data.entries()) {
				beforeState.set(id, resource.attributes);
			}

			// Build current document from collection state
			const currentResources = Array.from(data.values());
			const currentLatest = currentResources.reduce(
				(max, r) => (r.meta.latest > max ? r.meta.latest : max),
				getEventstamp(),
			);

			const currentDoc: JsonDocument<StandardSchemaV1.InferOutput<T>> = {
				jsonapi: { version: "1.1" },
				meta: { latest: currentLatest },
				data: currentResources,
			};

			// Merge using core mergeDocuments
			const result = mergeDocuments(currentDoc, document);

			// Replace collection data with merged result
			data.clear();
			for (const resource of result.document.data) {
				data.set(resource.id, resource);
			}

			// Emit events for changes
			for (const [id, resource] of result.changes.added) {
				standardValidate(schema, resource.attributes);
				pendingMutations.added.push({ id, item: resource.attributes });
			}

			for (const [id, resource] of result.changes.updated) {
				standardValidate(schema, resource.attributes);
				const before = beforeState.get(id);
				if (before) {
					pendingMutations.updated.push({
						id,
						before,
						after: resource.attributes,
					});
				}
			}

			for (const id of result.changes.deleted) {
				const before = beforeState.get(id);
				if (before) {
					pendingMutations.removed.push({ id, item: before });
				}
			}

			// Flush immediately for non-transaction operations
			if (autoFlush) {
				flushMutations();
			}
		},

		data() {
			return new Map(data);
		},

		on(event, handler) {
			return emitter.on(event, handler);
		},

		_flushMutations() {
			flushMutations();
		},

		_getPendingMutations() {
			return {
				added: [...pendingMutations.added],
				updated: [...pendingMutations.updated],
				removed: [...pendingMutations.removed],
			};
		},

		_emitMutations(mutations) {
			if (
				mutations.added.length > 0 ||
				mutations.updated.length > 0 ||
				mutations.removed.length > 0
			) {
				emitter.emit("mutation", mutations);
			}
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
