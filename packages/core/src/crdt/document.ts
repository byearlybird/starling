import { type ResourceObject, mergeResources } from "./resource";

/**
 * A JSON:API document represents the complete state of a store:
 * - API version information
 * - Metadata including the highest eventstamp observed across all operations
 * - A set of resource objects (including soft-deleted ones)
 *
 * Documents are the unit of synchronization between store replicas.
 */
export type Document = {
	/** API version information */
	jsonapi: {
		version: "1.1";
	};

	/** Document-level metadata */
	meta: {
		/** Latest eventstamp observed by this document for clock synchronization */
		eventstamp: string;
	};

	/** Array of resource objects with eventstamps and metadata */
	data: ResourceObject[];
};

/**
 * Change tracking information returned by mergeDocuments.
 * Categorizes resources by mutation type for hook notifications.
 */
export type DocumentChanges = {
	/** Resources that were newly added (didn't exist before or were previously deleted) */
	added: Map<string, ResourceObject>;

	/** Resources that were modified (existed before and changed) */
	updated: Map<string, ResourceObject>;

	/** Resources that were deleted (newly marked with deletedAt) */
	deleted: Set<string>;
};

/**
 * Result of merging two JSON:API documents.
 */
export type MergeDocumentsResult = {
	/** The merged document with updated resources and forwarded clock */
	document: Document;

	/** Change tracking for plugin hook notifications */
	changes: DocumentChanges;
};

/**
 * Merges two JSON:API documents using field-level Last-Write-Wins semantics.
 *
 * The merge operation:
 * 1. Forwards the clock to the newest eventstamp from either document
 * 2. Merges each resource pair using field-level LWW (via mergeResources)
 * 3. Tracks what changed for hook notifications (added/updated/deleted)
 *
 * Deletion is final: once a resource is deleted, updates to it are merged into
 * the resource's attributes but don't restore visibility. Only new resources or
 * transitions into the deleted state are tracked.
 *
 * @param into - The base document to merge into
 * @param from - The source document to merge from
 * @returns Merged document and categorized changes
 *
 * @example
 * ```typescript
 * const into = {
 *   jsonapi: { version: "1.1" },
 *   meta: { eventstamp: "2025-01-01T00:00:00.000Z|0001|a1b2" },
 *   data: [{ type: "items", id: "doc1", attributes: {...}, meta: { deletedAt: null, latest: "..." } }]
 * };
 *
 * const from = {
 *   jsonapi: { version: "1.1" },
 *   meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
 *   data: [
 *     { type: "items", id: "doc1", attributes: {...}, meta: { deletedAt: null, latest: "..." } }, // updated
 *     { type: "items", id: "doc2", attributes: {...}, meta: { deletedAt: null, latest: "..." } }  // new
 *   ]
 * };
 *
 * const result = mergeDocuments(into, from);
 * // result.document.meta.eventstamp === "2025-01-01T00:05:00.000Z|0001|c3d4"
 * // result.changes.added has "doc2"
 * // result.changes.updated has "doc1"
 * ```
 */
export function mergeDocuments(
	into: Document,
	from: Document,
): MergeDocumentsResult {
	// Build index of base resources by ID for efficient lookup
	const intoDocsById = new Map<string, ResourceObject>();
	for (const doc of into.data) {
		intoDocsById.set(doc.id, doc);
	}

	// Track changes for hook notifications
	const added = new Map<string, ResourceObject>();
	const updated = new Map<string, ResourceObject>();
	const deleted = new Set<string>();

	// Start with base resources, will update/add as we process source
	const mergedDocsById = new Map<string, ResourceObject>(intoDocsById);

	// Process each source resource
	for (const fromDoc of from.data) {
		const id = fromDoc.id;
		const intoDoc = intoDocsById.get(id);

		if (!intoDoc) {
			// New resource from source - store it and track if not deleted
			mergedDocsById.set(id, fromDoc);
			if (!fromDoc.meta.deletedAt) {
				added.set(id, fromDoc);
			}
		} else {
			// Skip merge if resources are identical (same reference)
			if (intoDoc === fromDoc) {
				continue;
			}

			// Merge existing resource using field-level LWW
			const mergedDoc = mergeResources(intoDoc, fromDoc);
			mergedDocsById.set(id, mergedDoc);

			// Track state transitions for hook notifications
			const wasDeleted = intoDoc.meta.deletedAt !== null;
			const isDeleted = mergedDoc.meta.deletedAt !== null;

			// Only track transitions: new deletion or non-deleted update
			if (!wasDeleted && isDeleted) {
				// Transitioned to deleted
				deleted.add(id);
			} else if (!isDeleted) {
				// Not deleted, so this is an update
				// (including updates that occur while resource is deleted, which merge silently)
				updated.set(id, mergedDoc);
			}
			// If wasDeleted && isDeleted, resource stays deleted - no change tracking
		}
	}

	// Forward clock to the newest eventstamp (eventstamps are lexicographically comparable)
	const newestEventstamp =
		into.meta.eventstamp >= from.meta.eventstamp
			? into.meta.eventstamp
			: from.meta.eventstamp;

	return {
		document: {
			jsonapi: { version: "1.1" },
			meta: {
				eventstamp: newestEventstamp,
			},
			data: Array.from(mergedDocsById.values()),
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
		jsonapi: { version: "1.1" },
		meta: {
			eventstamp,
		},
		data: [],
	};
}
