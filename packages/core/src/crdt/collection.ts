import { type EncodedDocument, mergeDocs } from "./document";

/**
 * A collection represents the complete state of a store following JSON:API
 * document structure.
 *
 * This is the canonical format used across disk storage, sync messages,
 * network transport, and export/import operations.
 *
 * Collections contain:
 * - An array of resource objects (documents, including soft-deleted ones)
 * - Metadata including the highest eventstamp for clock synchronization
 *
 * Collections are the unit of synchronization between store replicas.
 *
 * @see https://jsonapi.org/format/#document-structure
 */
export type Collection = {
	/** Array of resource objects (documents) with CRDT data and metadata */
	data: EncodedDocument[];

	/** Collection-level metadata */
	meta: {
		/** Latest eventstamp observed by this collection for clock synchronization */
		eventstamp: string;
	};
};

/**
 * Change tracking information returned by mergeCollections.
 * Categorizes documents by mutation type for hook notifications.
 */
export type CollectionChanges = {
	/** Documents that were newly added (didn't exist before or were previously deleted) */
	added: Map<string, EncodedDocument>;

	/** Documents that were modified (existed before and changed) */
	updated: Map<string, EncodedDocument>;

	/** Documents that were deleted (newly marked with ~deletedAt) */
	deleted: Set<string>;
};

/**
 * Result of merging two collections.
 */
export type MergeCollectionsResult = {
	/** The merged collection with updated documents and forwarded clock */
	collection: Collection;

	/** Change tracking for plugin hook notifications */
	changes: CollectionChanges;
};

/**
 * Merges two collections using field-level Last-Write-Wins semantics.
 *
 * The merge operation:
 * 1. Forwards the clock to the newest eventstamp from either collection
 * 2. Merges each document pair using field-level LWW (via mergeDocs)
 * 3. Tracks what changed for hook notifications (added/updated/deleted)
 *
 * Deletion is final: once a document is deleted, updates to it are merged into
 * the document's data but don't restore visibility. Only new documents or
 * transitions into the deleted state are tracked.
 *
 * @param into - The base collection to merge into
 * @param from - The source collection to merge from
 * @returns Merged collection and categorized changes
 *
 * @example
 * ```typescript
 * const into = {
 *   "~docs": [{ "~id": "doc1", "~data": {...}, "~deletedAt": null }],
 *   "~eventstamp": "2025-01-01T00:00:00.000Z|0001|a1b2"
 * };
 *
 * const from = {
 *   "~docs": [
 *     { "~id": "doc1", "~data": {...}, "~deletedAt": null }, // updated
 *     { "~id": "doc2", "~data": {...}, "~deletedAt": null }  // new
 *   ],
 *   "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4"
 * };
 *
 * const result = mergeCollections(into, from);
 * // result.collection.~eventstamp === "2025-01-01T00:05:00.000Z|0001|c3d4"
 * // result.changes.added has "doc2"
 * // result.changes.updated has "doc1"
 * ```
 */
export function mergeCollections(
	into: Collection,
	from: Collection,
): MergeCollectionsResult {
	// Build index of base documents by ID for efficient lookup
	const intoDocsById = new Map<string, EncodedDocument>();
	for (const doc of into.data) {
		intoDocsById.set(doc.id, doc);
	}

	// Track changes for hook notifications
	const added = new Map<string, EncodedDocument>();
	const updated = new Map<string, EncodedDocument>();
	const deleted = new Set<string>();

	// Start with base documents, will update/add as we process source
	const mergedDocsById = new Map<string, EncodedDocument>(intoDocsById);

	// Process each source document
	for (const fromDoc of from.data) {
		const id = fromDoc.id;
		const intoDoc = intoDocsById.get(id);

		if (!intoDoc) {
			// New document from source - store it and track if not deleted
			mergedDocsById.set(id, fromDoc);
			if (!fromDoc.meta["~deletedAt"]) {
				added.set(id, fromDoc);
			}
		} else {
			// Skip merge if documents are identical (same reference)
			if (intoDoc === fromDoc) {
				continue;
			}

			// Merge existing document using field-level LWW
			const [mergedDoc] = mergeDocs(intoDoc, fromDoc);
			mergedDocsById.set(id, mergedDoc);

			// Track state transitions for hook notifications
			const wasDeleted = intoDoc.meta["~deletedAt"] !== null;
			const isDeleted = mergedDoc.meta["~deletedAt"] !== null;

			// Only track transitions: new deletion or non-deleted update
			if (!wasDeleted && isDeleted) {
				// Transitioned to deleted
				deleted.add(id);
			} else if (!isDeleted) {
				// Not deleted, so this is an update
				// (including updates that occur while doc is deleted, which merge silently)
				updated.set(id, mergedDoc);
			}
			// If wasDeleted && isDeleted, doc stays deleted - no change tracking
		}
	}

	// Forward clock to the newest eventstamp (eventstamps are lexicographically comparable)
	const newestEventstamp =
		into.meta.eventstamp >= from.meta.eventstamp
			? into.meta.eventstamp
			: from.meta.eventstamp;

	return {
		collection: {
			data: Array.from(mergedDocsById.values()),
			meta: {
				eventstamp: newestEventstamp,
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
 * Creates an empty collection with the given eventstamp.
 * Useful for initializing new stores or testing.
 *
 * @param eventstamp - Initial clock value for this collection
 * @returns Empty collection
 *
 * @example
 * ```typescript
 * const empty = createCollection("2025-01-01T00:00:00.000Z|0000|0000");
 * ```
 */
export function createCollection(eventstamp: string): Collection {
	return {
		data: [],
		meta: {
			eventstamp,
		},
	};
}
