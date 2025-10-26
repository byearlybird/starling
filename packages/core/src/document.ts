import * as Record from "./record";

type EncodedDocument = {
	__id: string;
	__data: Record.EncodedRecord;
	__deletedAt: string | null;
};

const encode = <T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument => ({
	__id: id,
	__data: Record.encode(obj, eventstamp),
	__deletedAt: deletedAt,
});

const decode = <T extends Record<string, unknown>>(
	doc: EncodedDocument,
): {
	__id: string;
	__data: T;
	__deletedAt: string | null;
} => ({
	__id: doc.__id,
	__data: Record.decode(doc.__data),
	__deletedAt: doc.__deletedAt,
});

const merge = (
	into: EncodedDocument,
	from: EncodedDocument,
): EncodedDocument => ({
	__id: into.__id,
	__data: Record.merge(into.__data, from.__data),
	__deletedAt:
		into.__deletedAt && from.__deletedAt
			? into.__deletedAt > from.__deletedAt
				? into.__deletedAt
				: from.__deletedAt
			: into.__deletedAt || from.__deletedAt || null,
});

const del = (doc: EncodedDocument, eventstamp: string): EncodedDocument => ({
	...doc,
	__deletedAt: eventstamp,
});

export type { EncodedDocument };
export { encode, decode, merge, del };
