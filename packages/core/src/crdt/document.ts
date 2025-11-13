import {
	decodeRecord,
	type EncodedRecord,
	encodeRecord,
	mergeRecords,
	processRecord,
} from "./record";
import { isEncodedValue, isObject } from "./utils";
import {
	decodeValue,
	type EncodedValue,
	encodeValue,
	mergeValues,
} from "./value";

/**
 * JSON:API resource object representing a document with CRDT data.
 *
 * Resource objects are the primary unit of storage and synchronization in Starling.
 * This format is used consistently across disk storage, sync messages, network
 * transport, and export/import operations.
 *
 * @see https://jsonapi.org/format/#document-resource-objects
 */
export type ResourceObject = {
	/** Resource type identifier (collection name) */
	type: string;
	/** Unique identifier for this document */
	id: string;
	/** The document's CRDT data with eventstamps */
	attributes: EncodedValue<unknown> | EncodedRecord;
	/** System metadata and internal fields */
	meta: {
		/** Eventstamp when this document was soft-deleted, or null if not deleted */
		"~deletedAt": string | null;
	};
};

/**
 * Encode a plain JavaScript object into a JSON:API resource object with CRDT metadata.
 *
 * @param id - Unique identifier for this resource
 * @param obj - Plain JavaScript object to encode
 * @param eventstamp - Timestamp for this write operation
 * @param deletedAt - Optional deletion timestamp
 * @param type - Resource type identifier (defaults to "resource")
 * @returns Encoded resource object with CRDT data
 */
export function encodeResource<T>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
	type = "resource",
): ResourceObject {
	return {
		type,
		id,
		attributes: isObject(obj)
			? encodeRecord(obj as Record<string, unknown>, eventstamp)
			: encodeValue(obj, eventstamp),
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
export function decodeResource<T>(resource: ResourceObject): {
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
		data: (isEncodedValue(resource.attributes)
			? decodeValue(resource.attributes as EncodedValue<T>)
			: decodeRecord(resource.attributes as EncodedRecord)) as T,
		meta: {
			"~deletedAt": resource.meta["~deletedAt"],
		},
	};
}

/**
 * Merge two JSON:API resource objects using field-level Last-Write-Wins.
 *
 * @param into - Base resource object
 * @param from - Source resource object to merge in
 * @returns Tuple of [merged resource object, greatest eventstamp]
 */
export function mergeResources(
	into: ResourceObject,
	from: ResourceObject,
): [ResourceObject, string] {
	const intoIsValue = isEncodedValue(into.attributes);
	const fromIsValue = isEncodedValue(from.attributes);

	// Type mismatch: cannot merge primitive with object
	if (intoIsValue !== fromIsValue) {
		throw new Error("Merge error: Incompatible types");
	}

	const [mergedData, dataEventstamp] =
		intoIsValue && fromIsValue
			? mergeValues(
					into.attributes as EncodedValue<unknown>,
					from.attributes as EncodedValue<unknown>,
				)
			: mergeRecords(
					into.attributes as EncodedRecord,
					from.attributes as EncodedRecord,
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
	const processedData = isEncodedValue(resource.attributes)
		? process(resource.attributes as EncodedValue<unknown>)
		: processRecord(resource.attributes as EncodedRecord, process);

	return {
		type: resource.type,
		id: resource.id,
		attributes: processedData,
		meta: {
			"~deletedAt": resource.meta["~deletedAt"],
		},
	};
}
