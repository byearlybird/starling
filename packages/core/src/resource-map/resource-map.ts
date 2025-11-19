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
 * Convert a JsonDocument's data array into a Map keyed by resource ID.
 */
function documentToMap<T extends AnyObject>(
	document: JsonDocument<T>,
): Map<string, ResourceObject<T>> {
	return new Map(
		document.data.map((doc) => [doc.id, doc as ResourceObject<T>]),
	);
}

/**
 * A ResourceMap container for storing and managing ResourceObjects.
 *
 * This factory function creates a ResourceMap with state-based replication
 * and automatic convergence via Last-Write-Wins conflict resolution.
 * It stores complete resource snapshots with encoded metadata, including deletion markers.
 *
 * ResourceMap does NOT filter based on deletion status—it stores and returns
 * all ResourceObjects including deleted ones. The Store class is responsible
 * for filtering what's visible to users.
 *
 * @example
 * ```typescript
 * const resourceMap = createMap("todos");
 * resourceMap.set("id1", { name: "Alice" });
 * const resource = resourceMap.get("id1"); // ResourceObject with metadata
 * ```
 */
export function createMap<T extends AnyObject>(
	resourceType: string,
	initialMap: Map<string, ResourceObject<T>> = new Map(),
	eventstamp?: string,
) {
	let internalMap = initialMap;
	const clock = createClock();

	if (eventstamp) {
		clock.forward(eventstamp);
	}

	return {
		/**
		 * Check if a resource exists by ID (regardless of deletion status).
		 * @param id - Resource ID
		 */
		has(id: string): boolean {
			return internalMap.has(id);
		},

		/**
		 * Get a resource by ID (regardless of deletion status).
		 * @returns The raw resource with metadata (including deletedAt flag), or undefined if not found
		 */
		get(id: string): ResourceObject<T> | undefined {
			return internalMap.get(id);
		},

		/**
		 * Iterate over all resources (including deleted) as [id, resource] tuples.
		 */
		entries(): IterableIterator<readonly [string, ResourceObject<T>]> {
			return internalMap.entries();
		},

		/**
		 * Set a resource using field-level Last-Write-Wins merge.
		 * Creates a new resource if it doesn't exist, or merges with existing resource.
		 * @param id - Resource ID (provided by caller, not generated)
		 * @param object - Data to set (partial fields are merged, full objects replace)
		 */
		set(id: string, object: Partial<T>): void {
			const encoded = makeResource(resourceType, id, object as T, clock.now());
			const current = internalMap.get(id);
			if (current) {
				const merged = mergeResources(current, encoded);
				internalMap.set(id, merged);
			} else {
				internalMap.set(id, encoded);
			}
		},

		delete(id: string): void {
			const current = internalMap.get(id);
			if (current) {
				const doc = deleteResource(current, clock.now());
				internalMap.set(id, doc);
			}
		},

		/**
		 * Clone the internal map of encoded resources.
		 */
		cloneMap(): Map<string, ResourceObject<T>> {
			return new Map(internalMap);
		},

		/**
		 * Export the current state as a JsonDocument snapshot.
		 */
		toDocument(): JsonDocument<T> {
			return {
				jsonapi: { version: "1.1" },
				meta: {
					latest: clock.latest(),
				},
				data: Array.from(internalMap.values()),
			};
		},

		/**
		 * Merge another document into this ResourceMap using field-level Last-Write-Wins.
		 * @returns The merge result containing the merged document and tracked changes
		 * @param document - JsonDocument from another replica or storage
		 */
		merge(document: JsonDocument<T>): MergeDocumentsResult<T> {
			const currentDocument: JsonDocument<T> = {
				jsonapi: { version: "1.1" },
				meta: {
					latest: clock.latest(),
				},
				data: Array.from(internalMap.values()),
			};
			const result = mergeDocuments(currentDocument, document);

			clock.forward(result.document.meta.latest);
			internalMap = documentToMap(result.document);
			return result;
		},
	};
}

/**
 * Create a ResourceMap from a JsonDocument snapshot.
 * @param type - Resource type identifier (defaults to "default")
 * @param document - JsonDocument containing resource data
 */
export function createMapFromDocument<U extends AnyObject>(
	type: string,
	document: JsonDocument<U>,
): ReturnType<typeof createMap<U>> {
	// Infer type from first resource if available, otherwise use provided type
	const inferredType = document.data[0]?.type ?? type;
	return createMap<U>(
		inferredType,
		documentToMap(document),
		document.meta.latest,
	);
}
