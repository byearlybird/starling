import {
	decodeRecord,
	type EncodedRecord,
	encodeRecord,
	mergeRecords,
	processRecord,
} from "./record";

/**
 * Resource object structure representing a single stored entity.
 * Resources are the primary unit of storage and synchronization in Starling.
 *
 * Each resource has a type, unique identifier, attributes containing the data,
 * and metadata for tracking deletion state and eventstamps.
 */
export type ResourceObject = {
	/** Resource type identifier */
	type: string;
	/** Unique identifier for this resource */
	id: string;
	/** The resource's data as a nested object structure */
	attributes: Record<string, unknown>;
	/** Metadata for tracking deletion and eventstamps */
	meta: {
		/** Mirrored structure containing eventstamps for each attribute field */
		eventstamps: Record<string, unknown>;
		/** The greatest eventstamp in this resource (including deletedAt if applicable) */
		latest: string;
		/** Eventstamp when this resource was soft-deleted, or null if not deleted */
		deletedAt: string | null;
	};
};

export function encodeResource<T extends Record<string, unknown>>(
	type: string,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): ResourceObject {
	const encoded = encodeRecord(obj, eventstamp);
	const latest =
		deletedAt && deletedAt > encoded.meta.latest
			? deletedAt
			: encoded.meta.latest;

	return {
		type,
		id,
		attributes: encoded.data,
		meta: {
			eventstamps: encoded.meta.eventstamps,
			latest,
			deletedAt,
		},
	};
}

export function decodeResource<T extends Record<string, unknown>>(
	resource: ResourceObject,
): {
	type: string;
	id: string;
	data: T;
	deletedAt: string | null;
} {
	const encodedRecord: EncodedRecord = {
		data: resource.attributes,
		meta: {
			eventstamps: resource.meta.eventstamps,
			latest: resource.meta.latest,
		},
	};

	return {
		type: resource.type,
		id: resource.id,
		data: decodeRecord(encodedRecord) as T,
		deletedAt: resource.meta.deletedAt,
	};
}

export function mergeResources(
	into: ResourceObject,
	from: ResourceObject,
): [ResourceObject, string] {
	// Reconstruct EncodedRecords for merging
	const intoRecord: EncodedRecord = {
		data: into.attributes,
		meta: {
			eventstamps: into.meta.eventstamps,
			latest: into.meta.latest,
		},
	};

	const fromRecord: EncodedRecord = {
		data: from.attributes,
		meta: {
			eventstamps: from.meta.eventstamps,
			latest: from.meta.latest,
		},
	};

	const [mergedRecord, dataEventstamp] = mergeRecords(intoRecord, fromRecord);

	const mergedDeletedAt =
		into.meta.deletedAt && from.meta.deletedAt
			? into.meta.deletedAt > from.meta.deletedAt
				? into.meta.deletedAt
				: from.meta.deletedAt
			: into.meta.deletedAt || from.meta.deletedAt || null;

	// Calculate the greatest eventstamp from data and deletion timestamp
	let greatestEventstamp: string = dataEventstamp;
	if (mergedDeletedAt && mergedDeletedAt > greatestEventstamp) {
		greatestEventstamp = mergedDeletedAt;
	}

	return [
		{
			type: into.type,
			id: into.id,
			attributes: mergedRecord.data,
			meta: {
				eventstamps: mergedRecord.meta.eventstamps,
				latest: greatestEventstamp,
				deletedAt: mergedDeletedAt,
			},
		},
		greatestEventstamp,
	];
}

export function deleteResource(
	resource: ResourceObject,
	eventstamp: string,
): ResourceObject {
	// The latest is the max of the data's latest and the deletion eventstamp
	const latest =
		eventstamp > resource.meta.latest
			? eventstamp
			: resource.meta.latest;

	return {
		type: resource.type,
		id: resource.id,
		attributes: resource.attributes,
		meta: {
			eventstamps: resource.meta.eventstamps,
			latest,
			deletedAt: eventstamp,
		},
	};
}

/**
 * Transform all values in a resource using a provided function.
 *
 * Useful for custom serialization in plugin hooks (encryption, compression, etc.)
 *
 * @param resource - Resource to transform
 * @param process - Function to apply to each leaf value (receives value and eventstamp, returns transformed value and eventstamp)
 * @returns New resource with transformed values
 *
 * @example
 * ```ts
 * // Encrypt all values before persisting
 * const encrypted = processResource(resource, (value, eventstamp) => ({
 *   value: encrypt(value),
 *   eventstamp: eventstamp
 * }));
 * ```
 */
export function processResource(
	resource: ResourceObject,
	process: (value: unknown, eventstamp: string) => { value: unknown; eventstamp: string },
): ResourceObject {
	const recordToProcess: EncodedRecord = {
		data: resource.attributes,
		meta: {
			eventstamps: resource.meta.eventstamps,
			latest: resource.meta.latest,
		},
	};

	const processedRecord = processRecord(recordToProcess, process);

	// Calculate latest from processed data and deletedAt
	const latest =
		resource.meta.deletedAt && resource.meta.deletedAt > processedRecord.meta.latest
			? resource.meta.deletedAt
			: processedRecord.meta.latest;

	return {
		type: resource.type,
		id: resource.id,
		attributes: processedRecord.data,
		meta: {
			eventstamps: processedRecord.meta.eventstamps,
			latest,
			deletedAt: resource.meta.deletedAt,
		},
	};
}
