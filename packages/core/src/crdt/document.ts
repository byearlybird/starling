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
 * Top-level document structure with system metadata for tracking identity,
 * data, and deletion state. Documents are the primary unit of storage and
 * synchronization in Starling.
 *
 * The tilde prefix (~) distinguishes system metadata from user-defined data.
 */
export type EncodedDocument = {
	/** Unique identifier for this document */
	"~id": string;
	/** The document's data, either a primitive value or nested object structure */
	"~data": EncodedValue<unknown> | EncodedRecord;
	/** Eventstamp when this document was soft-deleted, or null if not deleted */
	"~deletedAt": string | null;
};

export function encodeDoc<T>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument {
	return {
		"~id": id,
		"~data": isObject(obj)
			? encodeRecord(obj as Record<string, unknown>, eventstamp)
			: encodeValue(obj, eventstamp),
		"~deletedAt": deletedAt,
	};
}

export function decodeDoc<T>(doc: EncodedDocument): {
	"~id": string;
	"~data": T;
	"~deletedAt": string | null;
} {
	return {
		"~id": doc["~id"],
		"~data": (isEncodedValue(doc["~data"])
			? decodeValue(doc["~data"] as EncodedValue<T>)
			: decodeRecord(doc["~data"] as EncodedRecord)) as T,
		"~deletedAt": doc["~deletedAt"],
	};
}

export function mergeDocs(
	into: EncodedDocument,
	from: EncodedDocument,
): [EncodedDocument, string] {
	const intoIsValue = isEncodedValue(into["~data"]);
	const fromIsValue = isEncodedValue(from["~data"]);

	// Type mismatch: cannot merge primitive with object
	if (intoIsValue !== fromIsValue) {
		throw new Error("Merge error: Incompatible types");
	}

	const [mergedData, dataEventstamp] =
		intoIsValue && fromIsValue
			? mergeValues(
					into["~data"] as EncodedValue<unknown>,
					from["~data"] as EncodedValue<unknown>,
				)
			: mergeRecords(
					into["~data"] as EncodedRecord,
					from["~data"] as EncodedRecord,
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
 * @param process - Function to apply to each leaf value
 * @returns New document with transformed values
 *
 * @example
 * ```ts
 * // Encrypt all values before persisting
 * const encrypted = processDocument(doc, (value) => ({
 *   ...value,
 *   "~value": encrypt(value["~value"])
 * }));
 * ```
 */
export function processDocument(
	doc: EncodedDocument,
	process: (value: EncodedValue<unknown>) => EncodedValue<unknown>,
): EncodedDocument {
	const processedData = isEncodedValue(doc["~data"])
		? process(doc["~data"] as EncodedValue<unknown>)
		: processRecord(doc["~data"] as EncodedRecord, process);

	return {
		"~id": doc["~id"],
		"~data": processedData,
		"~deletedAt": doc["~deletedAt"],
	};
}
