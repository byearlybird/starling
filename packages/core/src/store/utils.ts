import type { AnyObject, ResourceObject } from "../document";

/**
 * Map a collection of ResourceObjects to entries (tuples of [id, attributes])
 * @param changes - Map of resource objects
 * @returns Array of readonly tuples containing [id, attributes]
 */
export function mapChangesToEntries<T extends AnyObject>(
	changes: Map<string, ResourceObject<T>>,
): ReadonlyArray<readonly [string, T]> {
	return Array.from(changes.entries()).map(
		([key, doc]) => [key, doc.attributes as T] as const,
	);
}

/**
 * Check if any mutations occurred
 * @param adds - Added entries
 * @param updates - Updated entries
 * @param deletes - Deleted keys
 * @returns True if any changes were made
 */
export function hasChanges(
	adds: readonly unknown[],
	updates: readonly unknown[],
	deletes: readonly unknown[],
): boolean {
	return adds.length > 0 || updates.length > 0 || deletes.length > 0;
}

/**
 * Decode a ResourceObject to its active value, or null if deleted.
 * @param doc - ResourceObject to decode
 * @returns Active value or null if document is deleted
 */
export function decodeActive<T extends AnyObject>(
	doc: ResourceObject<T> | null,
): T | null {
	if (!doc || doc.meta.deletedAt) return null;
	return doc.attributes as T;
}
