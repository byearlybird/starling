import type { ResourceObject } from "../document";
import type { QueryInternal } from "./types";

/**
 * Decode a ResourceObject to its active value, or null if deleted.
 * @param doc - ResourceObject to decode
 * @returns Active value or null if document is deleted
 */
export function decodeActive<T extends Record<string, unknown>>(
	doc: ResourceObject<T> | null,
): T | null {
	if (!doc || doc.meta.deletedAt) return null;
	return doc.attributes as T;
}

/**
 * Apply optional select transformation to a value.
 * @param query - Query configuration with optional select function
 * @param value - Value to transform
 * @returns Transformed value or original value if no select function
 */
export function selectValue<T extends Record<string, unknown>, U>(
	query: QueryInternal<T, U>,
	value: T,
): U {
	return query.select ? query.select(value) : (value as unknown as U);
}
