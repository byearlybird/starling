import * as $object from "./obj";

type EncodedDocument = {
	__id: string;
	__data: $object.EncodedObject;
	__deletedAt: string | null;
};

const encode = <T extends Record<string, unknown>>(
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
): EncodedDocument => ({
	__id: id,
	__data: $object.encode(obj, eventstamp),
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
	__data: $object.decode(doc.__data),
	__deletedAt: doc.__deletedAt,
});

const merge = (
	into: EncodedDocument,
	from: EncodedDocument,
): EncodedDocument => ({
	__id: into.__id,
	__data: $object.merge(into.__data, from.__data),
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
