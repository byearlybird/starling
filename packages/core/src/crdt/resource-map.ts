import { Clock } from "../clock";
import type { Document } from "./document";
import { mergeDocuments } from "./document";
import type { ResourceObject } from "./resource";
import {
	decodeResource,
	deleteResource,
	encodeResource,
	mergeResources,
} from "./resource";

/**
 * An Observed-Remove Map (OR-Map) with Last-Write-Wins semantics for
 * conflict resolution.
 *
 * This class provides state-based replication with automatic convergence.
 * Multiple replicas applying the same operations will converge to the same state.
 *
 * The ResourceMap handles merge logic and I/O operations with a clean public
 * interface using plain JavaScript objects, while internally managing encoded
 * resource objects for merge tracking.
 *
 * Documents must be objects (not primitives).
 *
 * @example
 * ```typescript
 * const map = new ResourceMap();
 * map.add("id1", { name: "Alice" });
 * const doc = map.get("id1"); // { name: "Alice" }
 * ```
 */
export class ResourceMap<T extends Record<string, unknown>> {
	#map: Map<string, ResourceObject>;
	#clock: Clock;

	constructor(
		map: Map<string, ResourceObject> = new Map(),
		eventstamp?: string,
	) {
		this.#map = map;
		this.#clock = new Clock();
		if (eventstamp) {
			this.#clock.forward(eventstamp);
		}
	}

	/**
	 * Check if a document exists by ID.
	 * @param id - Document ID
	 * @param opts - Options object with includeDeleted flag
	 */
	has(id: string, opts: { includeDeleted?: boolean } = {}): boolean {
		const raw = this.#map.get(id);
		if (!raw) return false;
		return opts.includeDeleted || !raw.meta["~deletedAt"];
	}

	/**
	 * Get a document by ID.
	 * @returns The decoded plain object, or undefined if not found or deleted
	 */
	get(id: string): T | undefined {
		const raw = this.#map.get(id);
		if (!raw) return undefined;
		return raw.meta["~deletedAt"] ? undefined : (decodeResource(raw).data as T);
	}

	/**
	 * Iterate over all non-deleted documents as [id, document] tuples.
	 */
	entries(): IterableIterator<readonly [string, T]> {
		const self = this;
		function* iterator() {
			for (const [key, resource] of self.#map.entries()) {
				if (!resource.meta["~deletedAt"]) {
					const decoded = decodeResource<T>(resource).data;
					yield [key, decoded] as const;
				}
			}
		}
		return iterator();
	}

	/**
	 * Add a new document with the given ID and data.
	 * @param id - Document ID (provided by caller, not generated)
	 * @param object - Plain JavaScript object to store
	 */
	add(id: string, object: T): void {
		const encoded = encodeResource(id, object, this.#clock.now());
		this.#map.set(id, encoded);
	}

	/**
	 * Update an existing document with new data using field-level Last-Write-Wins merge.
	 * If the document doesn't exist, it will be created.
	 * @param id - Document ID
	 * @param object - Partial object with fields to update
	 */
	update(id: string, object: Partial<T>): void {
		const encoded = encodeResource(id, object, this.#clock.now());
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
			const resource = deleteResource(current, this.#clock.now());
			this.#map.set(id, resource);
		}
	}

	/**
	 * Clone the internal map of encoded resource objects.
	 */
	cloneMap(): Map<string, ResourceObject> {
		return new Map(this.#map);
	}

	/**
	 * Export the current state as a document.
	 * @returns Document containing all resource objects and metadata
	 */
	document(): Document {
		return {
			data: Array.from(this.#map.values()),
			meta: {
				"~eventstamp": this.#clock.latest(),
			},
		};
	}

	/**
	 * Merge another document into this map using field-level Last-Write-Wins.
	 * @param document - Document from another replica or storage
	 */
	merge(document: Document): void {
		const currentDocument = this.document();
		const result = mergeDocuments(currentDocument, document);

		this.#clock.forward(result.document.meta["~eventstamp"]);
		this.#map = new Map(
			result.document.data.map((resource) => [resource.id, resource]),
		);
	}

	/**
	 * Create a ResourceMap instance from a document.
	 * @param document - Document to hydrate from
	 * @returns New ResourceMap instance initialized with the document's data
	 */
	static fromDocument<U extends Record<string, unknown>>(
		document: Document,
	): ResourceMap<U> {
		return new ResourceMap<U>(
			new Map(document.data.map((resource) => [resource.id, resource])),
			document.meta["~eventstamp"],
		);
	}
}
