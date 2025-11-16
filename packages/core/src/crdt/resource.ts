import {
	type EncodedRecord,
	encodeRecord,
	mergeRecords,
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
		data: resource.attributes,
		deletedAt: resource.meta.deletedAt,
	};
}

export function mergeResources<T extends Record<string, unknown>>(
	into: ResourceObject<T>,
	from: ResourceObject<T>,
): [ResourceObject<T>, string] {
	const mergedRecord = mergeRecords(
		{
			data: into.attributes,
			meta: {
				eventstamps: into.meta.eventstamps,
				latest: into.meta.latest,
			},
		},
		{
			data: from.attributes,
			meta: {
				eventstamps: from.meta.eventstamps,
				latest: from.meta.latest,
			},
		},
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
