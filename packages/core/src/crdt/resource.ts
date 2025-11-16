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
export type ResourceObject<
	T extends Record<string, unknown> = Record<string, unknown>,
> = {
	/** Resource type identifier */
	type: string;
	/** Unique identifier for this resource */
	id: string;
	/** The resource's data as a nested object structure */
	attributes: T;
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
): ResourceObject<T> {
	const encoded = encodeRecord(obj, eventstamp);
	const latest =
		deletedAt && deletedAt > encoded.meta.latest
			? deletedAt
			: encoded.meta.latest;

	return {
		type,
		id,
		attributes: encoded.data as T,
		meta: {
			eventstamps: encoded.meta.eventstamps,
			latest,
			deletedAt,
		},
	};
}

export function decodeResource<T extends Record<string, unknown>>(
	resource: ResourceObject<T>,
): {
	type: string;
	id: string;
	data: T;
	deletedAt: string | null;
} {
	return {
		type: resource.type,
		id: resource.id,
		data: decodeRecord(resource.attributes) as T,
		deletedAt: resource.meta.deletedAt,
	};
}

export function mergeResources<T extends Record<string, unknown>>(
	into: ResourceObject<T>,
	from: ResourceObject<T>,
): [ResourceObject<T>, string] {
	const mergedRecord = mergeRecords(
		into.attributes,
		into.meta.eventstamps,
		into.meta.latest,
		from.attributes,
		from.meta.eventstamps,
		from.meta.latest,
	);

	const mergedDeletedAt =
		into.meta.deletedAt && from.meta.deletedAt
			? into.meta.deletedAt > from.meta.deletedAt
				? into.meta.deletedAt
				: from.meta.deletedAt
			: into.meta.deletedAt || from.meta.deletedAt || null;

	// Calculate the greatest eventstamp from data and deletion timestamp
	let greatestEventstamp: string = mergedRecord.meta.latest;
	if (mergedDeletedAt && mergedDeletedAt > greatestEventstamp) {
		greatestEventstamp = mergedDeletedAt;
	}

	return [
		{
			type: into.type,
			id: into.id,
			attributes: mergedRecord.data as T,
			meta: {
				eventstamps: mergedRecord.meta.eventstamps,
				latest: greatestEventstamp,
				deletedAt: mergedDeletedAt,
			},
		},
		greatestEventstamp,
	];
}

export function deleteResource<T extends Record<string, unknown>>(
	resource: ResourceObject<T>,
	eventstamp: string,
): ResourceObject<T> {
	// The latest is the max of the data's latest and the deletion eventstamp
	const latest =
		eventstamp > resource.meta.latest ? eventstamp : resource.meta.latest;

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
export function processResource<T extends Record<string, unknown>>(
	resource: ResourceObject<T>,
	process: (
		value: unknown,
		eventstamp: string,
	) => { value: unknown; eventstamp: string },
): ResourceObject<T> {
	const processedRecord = processRecord(
		resource.attributes,
		resource.meta.eventstamps,
		process,
	);

	// Calculate latest from processed data and deletedAt
	const latest =
		resource.meta.deletedAt &&
		resource.meta.deletedAt > processedRecord.meta.latest
			? resource.meta.deletedAt
			: processedRecord.meta.latest;

	return {
		type: resource.type,
		id: resource.id,
		attributes: processedRecord.data as T,
		meta: {
			eventstamps: processedRecord.meta.eventstamps,
			latest,
			deletedAt: resource.meta.deletedAt,
		},
	};
}
