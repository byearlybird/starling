import { maxEventstamp } from "../clock/eventstamp";
import type { AnyObject, JsonDocument } from "./document";
import type { ResourceObject } from "./resource";

/**
 * Convert a JsonDocument's data array into a Map keyed by resource ID.
 * @param document - JsonDocument containing resource data
 * @returns Map of resource ID to ResourceObject
 */
export function documentToMap<T extends AnyObject>(
	document: JsonDocument<T>,
): Map<string, ResourceObject<T>> {
	return new Map(
		document.data.map((doc) => [doc.id, doc as ResourceObject<T>]),
	);
}

/**
 * Convert a Map of resources into a JsonDocument.
 * @param resources - Map of resource ID to ResourceObject
 * @param fallbackEventstamp - Eventstamp to include when computing the max (optional)
 * @returns JsonDocument representation of the resources
 */
export function mapToDocument<T extends AnyObject>(
	resources: Map<string, ResourceObject<T>>,
	fallbackEventstamp?: string,
): JsonDocument<T> {
	const resourceArray = Array.from(resources.values());
	const eventstamps = resourceArray.map((r) => r.meta.latest);

	// Include fallback eventstamp in the max calculation if provided
	if (fallbackEventstamp) {
		eventstamps.push(fallbackEventstamp);
	}

	const latest = maxEventstamp(eventstamps);

	return {
		jsonapi: { version: "1.1" },
		meta: { latest },
		data: resourceArray,
	};
}
