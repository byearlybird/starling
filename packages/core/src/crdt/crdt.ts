import { Clock } from "../clock";
import type { Collection } from "./collection";
import { mergeCollections } from "./collection";
import type { EncodedDocument } from "./document";
import { decodeDoc, deleteDoc, encodeDoc, mergeDocs } from "./document";

/**
 * A CRDT collection implementing an Observed-Remove Map (OR-Map) with
 * Last-Write-Wins semantics for conflict resolution.
 *
 * This class provides state-based replication with automatic convergence.
 * Multiple replicas applying the same operations will converge to the same state.
 *
 * The CRDT layer handles merge logic and I/O operations with a clean public
 * interface using plain JavaScript objects, while internally managing encoded
 * documents for merge tracking.
 *
 * @example
 * ```typescript
 * const crdt = new CRDT(new Map());
 * crdt.add("id1", { name: "Alice" });
 * const doc = crdt.get("id1"); // { name: "Alice" }
 * ```
 */
export class CRDT<T> {
	#map: Map<string, EncodedDocument>;
	#clock: Clock;

	constructor(
		map: Map<string, EncodedDocument> = new Map(),
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
		return opts.includeDeleted || !raw["~deletedAt"];
	}

	/**
	 * Get a document by ID.
	 * @returns The decoded plain object, or undefined if not found or deleted
	 */
	get(id: string): T | undefined {
		const raw = this.#map.get(id);
		if (!raw) return undefined;
		return raw["~deletedAt"] ? undefined : (decodeDoc(raw)["~data"] as T);
	}

	/**
	 * Iterate over all non-deleted documents as [id, document] tuples.
	 */
	entries(): IterableIterator<readonly [string, T]> {
		const self = this;
		function* iterator() {
			for (const [key, doc] of self.#map.entries()) {
				if (!doc["~deletedAt"]) {
					const decoded = decodeDoc<T>(doc)["~data"];
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
		const encoded = encodeDoc(id, object, this.#clock.now());
		this.#map.set(id, encoded);
	}

	/**
	 * Update an existing document with new data using field-level Last-Write-Wins merge.
	 * If the document doesn't exist, it will be created.
	 * @param id - Document ID
	 * @param object - Partial object with fields to update
	 */
	update(id: string, object: Partial<T>): void {
		const encoded = encodeDoc(id, object, this.#clock.now());
		const current = this.#map.get(id);
		if (current) {
			const [merged] = mergeDocs(current, encoded);
			this.#map.set(id, merged);
		} else {
			this.#map.set(id, encoded);
		}
	}

	delete(id: string): void {
		const current = this.#map.get(id);
		if (current) {
			const doc = deleteDoc(current, this.#clock.now());
			this.#map.set(id, doc);
		}
	}

	/**
	 * Clone the internal map of encoded documents.
	 */
	cloneMap(): Map<string, EncodedDocument> {
		return new Map(this.#map);
	}

	snapshot(): Collection {
		return {
			"~eventstamp": this.#clock.latest(),
			"~docs": Array.from(this.#map.values()),
		};
	}

	/**
	 * Merge another collection into this CRDT using field-level Last-Write-Wins.
	 * @param collection - Collection from another replica or storage
	 */
	merge(collection: Collection): void {
		const currentCollection = this.snapshot();
		const result = mergeCollections(currentCollection, collection);

		this.#clock.forward(result.collection["~eventstamp"]);
		this.#map = new Map(
			result.collection["~docs"].map((doc) => [doc["~id"], doc]),
		);
	}

	static fromSnapshot<U>(collection: Collection): CRDT<U> {
		return new CRDT<U>(
			new Map(collection["~docs"].map((doc) => [doc["~id"], doc])),
			collection["~eventstamp"],
		);
	}
}
