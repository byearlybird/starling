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
export type EncodedDocument = {
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

export function encodeDoc<T extends Record<string, unknown>>(
	type: string,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument {
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

export function decodeDoc<T extends Record<string, unknown>>(
	doc: EncodedDocument,
): {
	type: string;
	id: string;
	data: T;
	deletedAt: string | null;
} {
	const encodedRecord: EncodedRecord = {
		data: doc.attributes,
		meta: {
			eventstamps: doc.meta.eventstamps,
			latest: doc.meta.latest,
		},
	};

	return {
		type: doc.type,
		id: doc.id,
		data: decodeRecord(encodedRecord) as T,
		deletedAt: doc.meta.deletedAt,
	};
}

export function mergeDocs(
	into: EncodedDocument,
	from: EncodedDocument,
): [EncodedDocument, string] {
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

export function deleteDoc(
	doc: EncodedDocument,
	eventstamp: string,
): EncodedDocument {
	// The latest is the max of the data's latest and the deletion eventstamp
	const latest =
		eventstamp > doc.meta.latest
			? eventstamp
			: doc.meta.latest;

	return {
		type: doc.type,
		id: doc.id,
		attributes: doc.attributes,
		meta: {
			eventstamps: doc.meta.eventstamps,
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
 * @param doc - Resource to transform
 * @param process - Function to apply to each leaf value (receives value and eventstamp, returns transformed value and eventstamp)
 * @returns New resource with transformed values
 *
 * @example
 * ```ts
 * // Encrypt all values before persisting
 * const encrypted = processDocument(doc, (value, eventstamp) => ({
 *   value: encrypt(value),
 *   eventstamp: eventstamp
 * }));
 * ```
 */
export function processDocument(
	doc: EncodedDocument,
	process: (value: unknown, eventstamp: string) => { value: unknown; eventstamp: string },
): EncodedDocument {
	const recordToProcess: EncodedRecord = {
		data: doc.attributes,
		meta: {
			eventstamps: doc.meta.eventstamps,
			latest: doc.meta.latest,
		},
	};

	const processedRecord = processRecord(recordToProcess, process);

	// Calculate latest from processed data and deletedAt
	const latest =
		doc.meta.deletedAt && doc.meta.deletedAt > processedRecord.meta.latest
			? doc.meta.deletedAt
			: processedRecord.meta.latest;

	return {
		type: doc.type,
		id: doc.id,
		attributes: processedRecord.data,
		meta: {
			eventstamps: processedRecord.meta.eventstamps,
			latest,
			deletedAt: doc.meta.deletedAt,
		},
	};
}
