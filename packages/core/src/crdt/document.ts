import {
	decodeRecord,
	type EncodedRecord,
	encodeRecord,
	mergeRecords,
	processRecord,
} from "./record";

/**
 * Top-level document structure with system metadata for tracking identity,
 * data, and deletion state. Documents are the primary unit of storage and
 * synchronization in Starling.
 *
 * The tilde prefix (~) distinguishes system metadata from user-defined data.
 */
export type EncodedDocument = {
	/** Unique identifier for this document */
	"~id": string;
	/** The document's data as a nested object structure */
	"~data": EncodedRecord;
	/** Eventstamp when this document was soft-deleted, or null if not deleted */
	"~deletedAt": string | null;
	/** The greatest eventstamp in this document (including deletedAt if applicable) */
	"~latest": string;
};

export function encodeDoc<T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument {
	const encodedData = encodeRecord(obj, eventstamp);
	const latest =
		deletedAt && deletedAt > eventstamp ? deletedAt : eventstamp;

	return {
		"~id": id,
		"~data": encodedData,
		"~deletedAt": deletedAt,
		"~latest": latest,
	};
}

export function decodeDoc<T extends Record<string, unknown>>(
	doc: EncodedDocument,
): {
	"~id": string;
	"~data": T;
	"~deletedAt": string | null;
} {
	return {
		"~id": doc["~id"],
		"~data": decodeRecord(doc["~data"]) as T,
		"~deletedAt": doc["~deletedAt"],
	};
}

export function mergeDocs(
	into: EncodedDocument,
	from: EncodedDocument,
): [EncodedDocument, string] {
	const [mergedData, dataEventstamp] = mergeRecords(
		into["~data"],
		from["~data"],
	);

	const mergedDeletedAt =
		into["~deletedAt"] && from["~deletedAt"]
			? into["~deletedAt"] > from["~deletedAt"]
				? into["~deletedAt"]
				: from["~deletedAt"]
			: into["~deletedAt"] || from["~deletedAt"] || null;

	// Calculate the greatest eventstamp from data and deletion timestamp
	let greatestEventstamp: string = dataEventstamp;
	if (mergedDeletedAt && mergedDeletedAt > greatestEventstamp) {
		greatestEventstamp = mergedDeletedAt;
	}

	return [
		{
			"~id": into["~id"],
			"~data": mergedData,
			"~deletedAt": mergedDeletedAt,
			"~latest": greatestEventstamp,
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
		eventstamp > doc["~data"]["~latest"]
			? eventstamp
			: doc["~data"]["~latest"];

	return {
		"~id": doc["~id"],
		"~data": doc["~data"],
		"~deletedAt": eventstamp,
		"~latest": latest,
	};
}

/**
 * Transform all values in a document using a provided function.
 *
 * Useful for custom serialization in plugin hooks (encryption, compression, etc.)
 *
 * @param doc - Document to transform
 * @param process - Function to apply to each leaf value (receives value and eventstamp, returns transformed value and eventstamp)
 * @returns New document with transformed values
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
	const processedData = processRecord(doc["~data"], process);

	// Calculate latest from processed data and deletedAt
	const latest =
		doc["~deletedAt"] && doc["~deletedAt"] > processedData["~latest"]
			? doc["~deletedAt"]
			: processedData["~latest"];

	return {
		"~id": doc["~id"],
		"~data": processedData,
		"~deletedAt": doc["~deletedAt"],
		"~latest": latest,
	};
}
