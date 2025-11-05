import { mergeDocs, type EncodedDocument } from "./document";

/**
 * A collection represents the complete state of a store:
 * - A set of documents (including soft-deleted ones)
 * - The highest eventstamp observed across all operations
 *
 * Collections are the unit of synchronization between store replicas.
 */
export type Collection = {
	/** Array of encoded documents with eventstamps and metadata */
	"~docs": EncodedDocument[];

	/** Latest eventstamp observed by this collection for clock synchronization */
	"~eventstamp": string;
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
	for (const doc of into["~docs"]) {
		intoDocsById.set(doc["~id"], doc);
	}

	// Track changes for hook notifications
	const added = new Map<string, EncodedDocument>();
	const updated = new Map<string, EncodedDocument>();
	const deleted = new Set<string>();

	// Start with base documents, will update/add as we process source
	const mergedDocsById = new Map<string, EncodedDocument>(intoDocsById);

	// Process each source document
	for (const fromDoc of from["~docs"]) {
		const id = fromDoc["~id"];
		const intoDoc = intoDocsById.get(id);

		if (!intoDoc) {
			// New document from source
			mergedDocsById.set(id, fromDoc);

			// Only count as "added" if it's not deleted
			if (!fromDoc["~deletedAt"]) {
				added.set(id, fromDoc);
			}
		} else {
			// Merge existing document using field-level LWW
			const [mergedDoc] = mergeDocs(intoDoc, fromDoc);
			mergedDocsById.set(id, mergedDoc);

			// Detect state transitions for change tracking
			const wasDeleted = intoDoc["~deletedAt"] !== null;
			const isDeleted = mergedDoc["~deletedAt"] !== null;

			if (!wasDeleted && isDeleted) {
				// Document was deleted
				deleted.add(id);
			} else if (wasDeleted && !isDeleted) {
				// Document was restored (deletion was overwritten)
				added.set(id, mergedDoc);
			} else if (!isDeleted) {
				// Document changed (only track updates for non-deleted docs)
				// Check if the document actually changed by comparing references
				if (intoDoc !== mergedDoc) {
					updated.set(id, mergedDoc);
				}
			}
		}
	}

	// Forward clock to the newest eventstamp (eventstamps are lexicographically comparable)
	const newestEventstamp =
		into["~eventstamp"] >= from["~eventstamp"]
			? into["~eventstamp"]
			: from["~eventstamp"];

	return {
		collection: {
			"~docs": Array.from(mergedDocsById.values()),
			"~eventstamp": newestEventstamp,
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
		"~docs": [],
		"~eventstamp": eventstamp,
	};
}
