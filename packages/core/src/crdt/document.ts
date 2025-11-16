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
	attributes: EncodedRecord;
	/** Metadata for tracking deletion and eventstamps */
	meta: {
		/** Eventstamp when this resource was soft-deleted, or null if not deleted */
		deletedAt: string | null;
		/** The greatest eventstamp in this resource (including deletedAt if applicable) */
		latest: string;
	};
};

export function encodeDoc<T extends Record<string, unknown>>(
	type: string,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument {
	const encodedData = encodeRecord(obj, eventstamp);
	const latest =
		deletedAt && deletedAt > eventstamp ? deletedAt : eventstamp;

	return {
		type,
		id,
		attributes: encodedData,
		meta: {
			deletedAt,
			latest,
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
	return {
		type: doc.type,
		id: doc.id,
		data: decodeRecord(doc.attributes) as T,
		deletedAt: doc.meta.deletedAt,
	};
}

export function mergeDocs(
	into: EncodedDocument,
	from: EncodedDocument,
): [EncodedDocument, string] {
	const [mergedData, dataEventstamp] = mergeRecords(
		into.attributes,
		from.attributes,
	);

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
			attributes: mergedData,
			meta: {
				deletedAt: mergedDeletedAt,
				latest: greatestEventstamp,
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
		eventstamp > doc.attributes["~latest"]
			? eventstamp
			: doc.attributes["~latest"];

	return {
		type: doc.type,
		id: doc.id,
		attributes: doc.attributes,
		meta: {
			deletedAt: eventstamp,
			latest,
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
	const processedData = processRecord(doc.attributes, process);

	// Calculate latest from processed data and deletedAt
	const latest =
		doc.meta.deletedAt && doc.meta.deletedAt > processedData["~latest"]
			? doc.meta.deletedAt
			: processedData["~latest"];

	return {
		type: doc.type,
		id: doc.id,
		attributes: processedData,
		meta: {
			deletedAt: doc.meta.deletedAt,
			latest,
		},
	};
}
