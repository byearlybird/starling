import { createClock } from "../clock/clock";
import type {
	AnyObject,
	JsonDocument,
	MergeDocumentsResult,
} from "../document/document";
import { mergeDocuments } from "../document/document";
import type { ResourceObject } from "../document/resource";
import {
	deleteResource,
	makeResource,
	mergeResources,
} from "../document/resource";

/**
 * A ResourceMap container for storing and managing ResourceObjects.
 *
 * This class provides state-based replication and automatic convergence
 * via Last-Write-Wins conflict resolution. It stores complete resource
 * snapshots with encoded metadata, including deletion markers.
 *
 * ResourceMap does NOT filter based on deletion status—it stores and returns
 * all ResourceObjects including deleted ones. The Store class is responsible
 * for filtering what's visible to users.
 *
 * @example
 * ```typescript
 * const resourceMap = new ResourceMap("default");
 * resourceMap.set("id1", { name: "Alice" });
 * const resource = resourceMap.get("id1"); // ResourceObject with metadata
 *
 * // Create from existing document
 * const loaded = ResourceMap.fromDocument(document);
 * ```
 */
export class ResourceMap<T extends AnyObject> {
	private internalMap: Map<string, ResourceObject<T>>;
	private clock: ReturnType<typeof createClock>;
	private resourceType: string;

	constructor(
		resourceType: string,
		map: Map<string, ResourceObject<T>> = new Map(),
		eventstamp?: string,
	) {
		this.resourceType = resourceType;
		this.internalMap = map;
		this.clock = createClock();

		if (eventstamp) {
			this.clock.forward(eventstamp);
		}
	}

	/**
	 * Create a ResourceMap from a JsonDocument snapshot.
	 * @param type - Resource type identifier
	 * @param document - JsonDocument containing resource data
	 */
	static fromDocument<U extends AnyObject>(
		type: string,
		document: JsonDocument<U>,
	): ResourceMap<U> {
		const map = new Map(
			document.data.map((doc) => [doc.id, doc as ResourceObject<U>]),
		);
		return new ResourceMap<U>(type, map, document.meta.latest);
	}

	/**
	 * Check if a resource exists by ID (regardless of deletion status).
	 * @param id - Resource ID
	 */
	has(id: string): boolean {
		return this.internalMap.has(id);
	}

	/**
	 * Get a resource by ID (regardless of deletion status).
	 * @returns The raw resource with metadata (including deletedAt flag), or undefined if not found
	 */
	get(id: string): ResourceObject<T> | undefined {
		return this.internalMap.get(id);
	}

	/**
	 * Iterate over all resources (including deleted) as [id, resource] tuples.
	 */
	entries(): IterableIterator<readonly [string, ResourceObject<T>]> {
		return this.internalMap.entries();
	}

	/**
	 * Set a resource using field-level Last-Write-Wins merge.
	 * Creates a new resource if it doesn't exist, or merges with existing resource.
	 * @param id - Resource ID (provided by caller, not generated)
	 * @param object - Data to set (partial fields are merged, full objects replace)
	 */
	set(id: string, object: Partial<T>): void {
		const encoded = makeResource(
			this.resourceType,
			id,
			object as T,
			this.clock.now(),
		);
		const current = this.internalMap.get(id);
		if (current) {
			const merged = mergeResources(current, encoded);
			this.internalMap.set(id, merged);
		} else {
			this.internalMap.set(id, encoded);
		}
	}

	/**
	 * Soft-delete a resource by marking it with a deletedAt eventstamp.
	 * @param id - Resource ID to delete
	 */
	delete(id: string): void {
		const current = this.internalMap.get(id);
		if (current) {
			const doc = deleteResource(current, this.clock.now());
			this.internalMap.set(id, doc);
		}
	}

	/**
	 * Clone the internal map of encoded resources.
	 */
	cloneMap(): Map<string, ResourceObject<T>> {
		return new Map(this.internalMap);
	}

	/**
	 * Export the current state as a JsonDocument snapshot.
	 */
	toDocument(): JsonDocument<T> {
		return {
			jsonapi: { version: "1.1" },
			meta: {
				latest: this.clock.latest(),
			},
			data: Array.from(this.internalMap.values()),
		};
	}

	/**
	 * Merge another document into this ResourceMap using field-level Last-Write-Wins.
	 * @param document - JsonDocument from another replica or storage
	 * @returns The merge result containing the merged document and tracked changes
	 */
	merge(document: JsonDocument<T>): MergeDocumentsResult<T> {
		const currentDocument = this.toDocument();
		const result = mergeDocuments(currentDocument, document);

		this.clock.forward(result.document.meta.latest);
		this.internalMap = new Map(
			result.document.data.map((doc) => [doc.id, doc as ResourceObject<T>]),
		);

		return result;
	}
}
