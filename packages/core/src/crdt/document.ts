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
};

export function encodeDoc<T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument {
	return {
		"~id": id,
		"~data": encodeRecord(obj, eventstamp),
		"~deletedAt": deletedAt,
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

	// Bubble up the greatest eventstamp from both data and deletion timestamp
	let greatestEventstamp: string = dataEventstamp;
	if (mergedDeletedAt && mergedDeletedAt > greatestEventstamp) {
		greatestEventstamp = mergedDeletedAt;
	}

	return [
		{
			"~id": into["~id"],
			"~data": mergedData,
			"~deletedAt": mergedDeletedAt,
		},
		greatestEventstamp,
	];
}

export function deleteDoc(
	doc: EncodedDocument,
	eventstamp: string,
): EncodedDocument {
	return {
		"~id": doc["~id"],
		"~data": doc["~data"],
		"~deletedAt": eventstamp,
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

	return {
		"~id": doc["~id"],
		"~data": processedData,
		"~deletedAt": doc["~deletedAt"],
	};
}
