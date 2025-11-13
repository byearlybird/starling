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
 * Top-level document structure following JSON:API resource object specification.
 * Documents are the primary unit of storage and synchronization in Starling.
 *
 * This format is used consistently across disk storage, sync messages, network
 * transport, and export/import operations.
 *
 * @see https://jsonapi.org/format/#document-resource-objects
 */
export type EncodedDocument = {
	/** Resource type identifier (collection name) */
	type: string;
	/** Unique identifier for this document */
	id: string;
	/** The document's CRDT data with eventstamps */
	attributes: EncodedValue<unknown> | EncodedRecord;
	/** System metadata and internal fields */
	meta: {
		/** Eventstamp when this document was soft-deleted, or null if not deleted */
		deletedAt: string | null;
	};
};

export function encodeDoc<T>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
	type = "resource",
): EncodedDocument {
	return {
		type,
		id,
		attributes: isObject(obj)
			? encodeRecord(obj as Record<string, unknown>, eventstamp)
			: encodeValue(obj, eventstamp),
		meta: {
			deletedAt,
		},
	};
}

export function decodeDoc<T>(doc: EncodedDocument): {
	type: string;
	id: string;
	data: T;
	meta: {
		deletedAt: string | null;
	};
} {
	return {
		type: doc.type,
		id: doc.id,
		data: (isEncodedValue(doc.attributes)
			? decodeValue(doc.attributes as EncodedValue<T>)
			: decodeRecord(doc.attributes as EncodedRecord)) as T,
		meta: {
			deletedAt: doc.meta.deletedAt,
		},
	};
}

export function mergeDocs(
	into: EncodedDocument,
	from: EncodedDocument,
): [EncodedDocument, string] {
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
		into.meta.deletedAt && from.meta.deletedAt
			? into.meta.deletedAt > from.meta.deletedAt
				? into.meta.deletedAt
				: from.meta.deletedAt
			: into.meta.deletedAt || from.meta.deletedAt || null;

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
	return {
		type: doc.type,
		id: doc.id,
		attributes: doc.attributes,
		meta: {
			deletedAt: eventstamp,
		},
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
	const processedData = isEncodedValue(doc.attributes)
		? process(doc.attributes as EncodedValue<unknown>)
		: processRecord(doc.attributes as EncodedRecord, process);

	return {
		type: doc.type,
		id: doc.id,
		attributes: processedData,
		meta: {
			deletedAt: doc.meta.deletedAt,
		},
	};
}
