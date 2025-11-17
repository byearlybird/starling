import type { AnyObject, Document } from "../document";
import { mergeDocuments } from "../document";
import {
	createResourceMapFromDocument,
	type createResourceMap,
} from "../store/resource-map";
import { decodeActive, hasChanges, mapChangesToEntries } from "../store/utils";
import type {
	Collection,
	CollectionAddOptions,
	CollectionConfig,
	CollectionTransaction,
	DBSchema,
	DeepPartial,
	InferSchemaOutput,
} from "./types";
import { validateSchema } from "./validation";

type ResourceMapGetter = () => ReturnType<typeof createResourceMap>;
type MutationEmitter<T> = (
	addEntries: ReadonlyArray<readonly [string, T]>,
	updateEntries: ReadonlyArray<readonly [string, T]>,
	deleteKeys: ReadonlyArray<string>,
) => void;

/**
 * Create a collection instance for a specific collection in the DB.
 * This is the imperative shell that manages collection state.
 *
 * @param collectionName - Name of the collection
 * @param collectionConfig - Schema config for this collection
 * @param getResourceMap - Getter for the current resource map (allows dynamic lookup)
 * @param setResourceMap - Setter for updating the resource map
 * @param emitMutations - Callback to emit mutations to plugin hooks
 */
export function createCollection<TSchema extends DBSchema, K extends keyof TSchema>(
	collectionName: K,
	collectionConfig: CollectionConfig<TSchema[K]["schema"]>,
	getResourceMap: ResourceMapGetter,
	setResourceMap: (map: ReturnType<typeof createResourceMap>) => void,
	emitMutations: MutationEmitter<InferSchemaOutput<TSchema[K]["schema"]>>,
): Collection<InferSchemaOutput<TSchema[K]["schema"]>> {
	type T = InferSchemaOutput<TSchema[K]["schema"]>;

	function has(key: string): boolean {
		const resource = getResourceMap().get(key);
		return resource != null && !resource.meta.deletedAt;
	}

	function get(key: string): T | null {
		const current = getResourceMap().get(key);
		return decodeActive(current ?? null) as T | null;
	}

	function getAll(): T[] {
		const results: T[] = [];
		for (const [, resource] of getResourceMap().entries()) {
			if (!resource.meta.deletedAt) {
				results.push(resource.attributes as T);
			}
		}
		return results;
	}

	function collectionSnapshot(): Document<T> {
		return getResourceMap().snapshot() as Document<T>;
	}

	async function merge(document: Document<T>): Promise<void> {
		const currentCollection = collectionSnapshot();
		const result = mergeDocuments<T>(currentCollection, document);

		// Replace the ResourceMap with the merged state
		const mergedMap = createResourceMapFromDocument<T>(
			result.document,
			String(collectionName),
		);

		setResourceMap(mergedMap);

		const addEntries = mapChangesToEntries(
			result.changes.added,
		) as ReadonlyArray<readonly [string, T]>;
		const updateEntries = mapChangesToEntries(
			result.changes.updated,
		) as ReadonlyArray<readonly [string, T]>;
		const deleteKeys = Array.from(result.changes.deleted);

		if (hasChanges(addEntries, updateEntries, deleteKeys)) {
			emitMutations(addEntries, updateEntries, deleteKeys);
		}
	}

	function begin<R = void>(
		callback: (tx: CollectionTransaction<T>) => R,
		opts?: { silent?: boolean },
	): R {
		const silent = opts?.silent ?? false;

		const addEntries: Array<readonly [string, T]> = [];
		const updateEntries: Array<readonly [string, T]> = [];
		const deleteKeys: Array<string> = [];

		// Create a staging ResourceMap by cloning the current state
		const staging = createResourceMapFromDocument<T>(
			getResourceMap().snapshot() as Document<T>,
			String(collectionName),
		);
		let rolledBack = false;

		const tx: CollectionTransaction<T> = {
			add: (value, options) => {
				const key = options?.withId ?? collectionConfig.getId(value);
				staging.set(key, value as AnyObject);
				addEntries.push([key, value] as const);
				return key;
			},
			update: (key, value) => {
				staging.set(key, value as AnyObject);
				const merged = staging.get(key);
				if (merged !== undefined) {
					updateEntries.push([key, merged.attributes as T] as const);
				}
			},
			remove: (key) => {
				if (!staging.has(key)) return;
				staging.delete(key);
				deleteKeys.push(key);
			},
			get: (key) => {
				const encoded = staging.get(key);
				return decodeActive(encoded ?? null) as T | null;
			},
			rollback: () => {
				rolledBack = true;
			},
		};

		const result = callback(tx);

		if (!rolledBack) {
			setResourceMap(staging);
			if (!silent) {
				emitMutations(addEntries, updateEntries, deleteKeys);
			}
		}

		return result;
	}

	async function add(value: T, options?: CollectionAddOptions): Promise<string> {
		const validated = await validateSchema(collectionConfig.schema, value);
		return begin((tx) => tx.add(validated, options));
	}

	async function update(key: string, value: DeepPartial<T>): Promise<void> {
		// For partial updates, we don't validate since we're doing a field-level merge
		// The schema validation happens on add, and the merge logic preserves type safety
		begin((tx) => tx.update(key, value));
	}

	async function remove(key: string): Promise<void> {
		begin((tx) => tx.remove(key));
	}

	return {
		has,
		get,
		getAll,
		collection: collectionSnapshot,
		merge,
		begin,
		add,
		update,
		remove,
	};
}
