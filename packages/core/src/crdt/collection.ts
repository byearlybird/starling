import { mergeResources, type ResourceObject } from "./document";

/**
 * A JSON:API document representing the complete state of a store.
 *
 * This is the canonical format used across disk storage, sync messages,
 * network transport, and export/import operations.
 *
 * Documents contain:
 * - An array of resource objects (including soft-deleted ones)
 * - Metadata including the highest eventstamp for clock synchronization
 *
 * Documents are the unit of synchronization between store replicas.
 *
 * @see https://jsonapi.org/format/#document-structure
 */
export type Document = {
	/** Array of resource objects with CRDT data and metadata */
	data: ResourceObject[];

	/** Document-level metadata */
	meta: {
		/** Latest eventstamp observed by this document for clock synchronization */
		"~eventstamp": string;
	};
};

/**
 * Change tracking information returned by mergeDocuments.
 * Categorizes resource objects by mutation type for hook notifications.
 */
export type DocumentChanges = {
	/** Resource objects that were newly added (didn't exist before or were previously deleted) */
	added: Map<string, ResourceObject>;

	/** Resource objects that were modified (existed before and changed) */
	updated: Map<string, ResourceObject>;

	/** Resource objects that were deleted (newly marked with ~deletedAt) */
	deleted: Set<string>;
};

/**
 * Result of merging two JSON:API documents.
 */
export type MergeDocumentsResult = {
	/** The merged document with updated resource objects and forwarded clock */
	document: Document;

	/** Change tracking for plugin hook notifications */
	changes: DocumentChanges;
};

/**
 * Merges two JSON:API documents using field-level Last-Write-Wins semantics.
 *
 * The merge operation:
 * 1. Forwards the clock to the newest eventstamp from either document
 * 2. Merges each resource object pair using field-level LWW (via mergeDocs)
 * 3. Tracks what changed for hook notifications (added/updated/deleted)
 *
 * Deletion is final: once a resource object is deleted, updates to it are merged
 * into its data but don't restore visibility. Only new resource objects or
 * transitions into the deleted state are tracked.
 *
 * @param into - The base document to merge into
 * @param from - The source document to merge from
 * @returns Merged document and categorized changes
 *
 * @example
 * ```typescript
 * const into = {
 *   data: [{ type: "resource", id: "doc1", attributes: {...}, meta: { "~deletedAt": null } }],
 *   meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0001|a1b2" }
 * };
 *
 * const from = {
 *   data: [
 *     { type: "resource", id: "doc1", attributes: {...}, meta: { "~deletedAt": null } }, // updated
 *     { type: "resource", id: "doc2", attributes: {...}, meta: { "~deletedAt": null } }  // new
 *   ],
 *   meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" }
 * };
 *
 * const result = mergeDocuments(into, from);
 * // result.document.meta["~eventstamp"] === "2025-01-01T00:05:00.000Z|0001|c3d4"
 * // result.changes.added has "doc2"
 * // result.changes.updated has "doc1"
 * ```
 */
export function mergeDocuments(
	into: Document,
	from: Document,
): MergeDocumentsResult {
	// Build index of base resource objects by ID for efficient lookup
	const intoResourcesById = new Map<string, ResourceObject>();
	for (const resource of into.data) {
		intoResourcesById.set(resource.id, resource);
	}

	// Track changes for hook notifications
	const added = new Map<string, ResourceObject>();
	const updated = new Map<string, ResourceObject>();
	const deleted = new Set<string>();

	// Start with base resource objects, will update/add as we process source
	const mergedResourcesById = new Map<string, ResourceObject>(
		intoResourcesById,
	);

	// Process each source resource object
	for (const fromResource of from.data) {
		const id = fromResource.id;
		const intoResource = intoResourcesById.get(id);

		if (!intoResource) {
			// New resource object from source - store it and track if not deleted
			mergedResourcesById.set(id, fromResource);
			if (!fromResource.meta["~deletedAt"]) {
				added.set(id, fromResource);
			}
		} else {
			// Skip merge if resource objects are identical (same reference)
			if (intoResource === fromResource) {
				continue;
			}

			// Merge existing resource object using field-level LWW
			const [mergedResource] = mergeResources(intoResource, fromResource);
			mergedResourcesById.set(id, mergedResource);

			// Track state transitions for hook notifications
			const wasDeleted = intoResource.meta["~deletedAt"] !== null;
			const isDeleted = mergedResource.meta["~deletedAt"] !== null;

			// Only track transitions: new deletion or non-deleted update
			if (!wasDeleted && isDeleted) {
				// Transitioned to deleted
				deleted.add(id);
			} else if (!isDeleted) {
				// Not deleted, so this is an update
				// (including updates that occur while resource is deleted, which merge silently)
				updated.set(id, mergedResource);
			}
			// If wasDeleted && isDeleted, resource stays deleted - no change tracking
		}
	}

	// Forward clock to the newest eventstamp (eventstamps are lexicographically comparable)
	const newestEventstamp =
		into.meta["~eventstamp"] >= from.meta["~eventstamp"]
			? into.meta["~eventstamp"]
			: from.meta["~eventstamp"];

	return {
		document: {
			data: Array.from(mergedResourcesById.values()),
			meta: {
				"~eventstamp": newestEventstamp,
			},
		},
		changes: {
			added,
			updated,
			deleted,
		},
	};
}

/**
 * Creates an empty JSON:API document with the given eventstamp.
 * Useful for initializing new stores or testing.
 *
 * @param eventstamp - Initial clock value for this document
 * @returns Empty document
 *
 * @example
 * ```typescript
 * const empty = createDocument("2025-01-01T00:00:00.000Z|0000|0000");
 * ```
 */
export function createDocument(eventstamp: string): Document {
	return {
		data: [],
		meta: {
			"~eventstamp": eventstamp,
		},
	};
}
