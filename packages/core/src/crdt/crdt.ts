import { Clock } from "../clock";
import type { Document } from "./document";
import { mergeDocuments } from "./document";
import type { ResourceObject } from "./resource";
import { deleteResource, encodeResource, mergeResources } from "./resource";

/**
 * A CRDT collection implementing an Observed-Remove Map (OR-Map) with
 * Last-Write-Wins semantics for conflict resolution.
 *
 * This class provides state-based replication with automatic convergence.
 * Multiple replicas applying the same operations will converge to the same state.
 *
 * The CRDT layer handles merge logic and I/O operations with a clean public
 * interface using plain JavaScript objects, while internally managing encoded
 * resources for merge tracking.
 *
 * @example
 * ```typescript
 * const crdt = new CRDT(new Map(), "default");
 * crdt.add("id1", { name: "Alice" });
 * const doc = crdt.get("id1"); // { name: "Alice" }
 * ```
 */
export class CRDT<T extends Record<string, unknown>> {
	#map: Map<string, ResourceObject<T>>;
	#clock: Clock;
	#type: string;

	constructor(
		map: Map<string, ResourceObject<T>> = new Map(),
		type: string = "default",
		eventstamp?: string,
	) {
		this.#map = map;
		this.#type = type;
		this.#clock = new Clock();
		if (eventstamp) {
			this.#clock.forward(eventstamp);
		}
	}

	/**
	 * Check if a resource exists by ID.
	 * @param id - Resource ID
	 * @param opts - Options object with includeDeleted flag
	 */
	has(id: string, opts: { includeDeleted?: boolean } = {}): boolean {
		const raw = this.#map.get(id);
		if (!raw) return false;
		return opts.includeDeleted || !raw.meta.deletedAt;
	}

	/**
	 * Get a resource by ID.
	 * @returns The raw resource with metadata, or undefined if not found or deleted
	 */
	get(id: string): ResourceObject<T> | undefined {
		const raw = this.#map.get(id);
		if (!raw) return undefined;
		return raw.meta.deletedAt ? undefined : raw;
	}

	/**
	 * Iterate over all non-deleted resources as [id, resource] tuples.
	 */
	entries(): IterableIterator<readonly [string, ResourceObject<T>]> {
		const self = this;
		function* iterator() {
			for (const [key, doc] of self.#map.entries()) {
				if (!doc.meta.deletedAt) {
					yield [key, doc] as const;
				}
			}
		}
		return iterator();
	}

	/**
	 * Add a new resource with the given ID and data.
	 * @param id - Resource ID (provided by caller, not generated)
	 * @param object - Plain JavaScript object to store
	 */
	add(id: string, object: T): void {
		const encoded = encodeResource(this.#type, id, object, this.#clock.now());
		this.#map.set(id, encoded);
	}

	/**
	 * Update an existing resource with new data using field-level Last-Write-Wins merge.
	 * If the resource doesn't exist, it will be created.
	 * @param id - Resource ID
	 * @param object - Partial object with fields to update
	 */
	update(id: string, object: Partial<T>): void {
		const encoded = encodeResource(this.#type, id, object as T, this.#clock.now());
		const current = this.#map.get(id);
		if (current) {
			const [merged] = mergeResources(current, encoded);
			this.#map.set(id, merged);
		} else {
			this.#map.set(id, encoded);
		}
	}

	delete(id: string): void {
		const current = this.#map.get(id);
		if (current) {
			const doc = deleteResource(current, this.#clock.now());
			this.#map.set(id, doc);
		}
	}

	/**
	 * Clone the internal map of encoded resources.
	 */
	cloneMap(): Map<string, ResourceObject<T>> {
		return new Map(this.#map);
	}

	snapshot(): Document {
		return {
			jsonapi: { version: "1.1" },
			meta: {
				eventstamp: this.#clock.latest(),
			},
			data: Array.from(this.#map.values()),
		};
	}

	/**
	 * Merge another document into this CRDT using field-level Last-Write-Wins.
	 * @param collection - Document from another replica or storage
	 */
	merge(collection: Document): void {
		const currentCollection = this.snapshot();
		const result = mergeDocuments(currentCollection, collection);

		this.#clock.forward(result.document.meta.eventstamp);
		this.#map = new Map(
			result.document.data.map((doc) => [doc.id, doc as ResourceObject<T>]),
		);
	}

	static fromSnapshot<U extends Record<string, unknown>>(
		collection: Document,
		type: string = "default",
	): CRDT<U> {
		// Infer type from first resource if available, otherwise use provided type
		const inferredType = collection.data[0]?.type ?? type;
		return new CRDT<U>(
			new Map(collection.data.map((doc) => [doc.id, doc as ResourceObject<U>])),
			inferredType,
			collection.meta.eventstamp,
		);
	}
}
