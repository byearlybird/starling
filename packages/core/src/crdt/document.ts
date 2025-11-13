import {
	decodeRecord,
	type EncodedRecord,
	encodeRecord,
	mergeRecords,
	processRecord,
} from "./record";
import { isObject } from "./utils";
import type { EncodedValue } from "./value";

/**
 * JSON:API resource object representing a document with CRDT data.
 *
 * Resource objects are the primary unit of storage and synchronization in Starling.
 * This format is used consistently across disk storage, sync messages, network
 * transport, and export/import operations.
 *
 * Per JSON:API specification, attributes must be an object (not a primitive).
 *
 * @see https://jsonapi.org/format/#document-resource-objects
 */
export type ResourceObject = {
	/** Resource type identifier (collection name) */
	type: string;
	/** Unique identifier for this resource */
	id: string;
	/** The resource's CRDT data with eventstamps (must be an object per JSON:API spec) */
	attributes: EncodedRecord;
	/** System metadata and internal fields */
	meta: {
		/** Eventstamp when this resource was soft-deleted, or null if not deleted */
		"~deletedAt": string | null;
	};
};

/**
 * Encode a plain JavaScript object into a JSON:API resource object with CRDT metadata.
 *
 * Per JSON:API specification, only objects are supported (not primitives).
 *
 * @param id - Unique identifier for this resource
 * @param obj - Plain JavaScript object to encode (must be an object, not a primitive)
 * @param eventstamp - Timestamp for this write operation
 * @param deletedAt - Optional deletion timestamp
 * @param type - Resource type identifier (defaults to "resource")
 * @returns Encoded resource object with CRDT data
 * @throws Error if obj is not an object
 */
export function encodeResource<T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
	type = "resource",
): ResourceObject {
	if (!isObject(obj)) {
		throw new Error(
			"Resource attributes must be an object per JSON:API specification",
		);
	}

	return {
		type,
		id,
		attributes: encodeRecord(obj, eventstamp),
		meta: {
			"~deletedAt": deletedAt,
		},
	};
}

/**
 * Decode a JSON:API resource object back into a plain JavaScript object.
 *
 * @param resource - Encoded resource object
 * @returns Decoded object with type, id, data, and metadata
 */
export function decodeResource<T extends Record<string, unknown>>(
	resource: ResourceObject,
): {
	type: string;
	id: string;
	data: T;
	meta: {
		"~deletedAt": string | null;
	};
} {
	return {
		type: resource.type,
		id: resource.id,
		data: decodeRecord(resource.attributes) as T,
		meta: {
			"~deletedAt": resource.meta["~deletedAt"],
		},
	};
}

/**
 * Merge two JSON:API resource objects using field-level Last-Write-Wins.
 *
 * Per JSON:API specification, attributes are always objects, so we merge them
 * using field-level LWW semantics.
 *
 * @param into - Base resource object
 * @param from - Source resource object to merge in
 * @returns Tuple of [merged resource object, greatest eventstamp]
 */
export function mergeResources(
	into: ResourceObject,
	from: ResourceObject,
): [ResourceObject, string] {
	// Merge attributes using field-level LWW (both are EncodedRecord per JSON:API spec)
	const [mergedData, dataEventstamp] = mergeRecords(
		into.attributes,
		from.attributes,
	);

	const mergedDeletedAt =
		into.meta["~deletedAt"] && from.meta["~deletedAt"]
			? into.meta["~deletedAt"] > from.meta["~deletedAt"]
				? into.meta["~deletedAt"]
				: from.meta["~deletedAt"]
			: into.meta["~deletedAt"] || from.meta["~deletedAt"] || null;

	// Bubble up the greatest eventstamp from both data and deletion timestamp
	let greatestEventstamp: string = dataEventstamp;
	if (mergedDeletedAt && mergedDeletedAt > greatestEventstamp) {
		greatestEventstamp = mergedDeletedAt;
	}

	return [
		{
			type: into.type,
			id: into.id,
			attributes: mergedData,
			meta: {
				"~deletedAt": mergedDeletedAt,
			},
		},
		greatestEventstamp,
	];
}

/**
 * Mark a JSON:API resource object as soft-deleted.
 *
 * @param resource - Resource object to delete
 * @param eventstamp - Deletion timestamp
 * @returns Resource object marked with deletion timestamp
 */
export function deleteResource(
	resource: ResourceObject,
	eventstamp: string,
): ResourceObject {
	return {
		type: resource.type,
		id: resource.id,
		attributes: resource.attributes,
		meta: {
			"~deletedAt": eventstamp,
		},
	};
}

/**
 * Transform all values in a resource object using a provided function.
 *
 * Useful for custom serialization in plugin hooks (encryption, compression, etc.)
 *
 * @param resource - Resource object to transform
 * @param process - Function to apply to each leaf value
 * @returns New resource object with transformed values
 *
 * @example
 * ```ts
 * // Encrypt all values before persisting
 * const encrypted = processResource(resource, (value) => ({
 *   ...value,
 *   "~value": encrypt(value["~value"])
 * }));
 * ```
 */
export function processResource(
	resource: ResourceObject,
	process: (value: EncodedValue<unknown>) => EncodedValue<unknown>,
): ResourceObject {
	// Per JSON:API spec, attributes are always objects (EncodedRecord)
	const processedData = processRecord(resource.attributes, process);

	return {
		type: resource.type,
		id: resource.id,
		attributes: processedData,
		meta: {
			"~deletedAt": resource.meta["~deletedAt"],
		},
	};
}
