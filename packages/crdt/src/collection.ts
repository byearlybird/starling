import { type EncodedDocument, encode, merge } from "./document";

type Collection = Map<string, EncodedDocument>;

const insert = (collection: Collection, doc: EncodedDocument): Collection => {
	if (collection.has(doc.__id)) {
		throw new Error(`Key already exists: ${doc.__id}`);
	}

	return new Map(collection).set(doc.__id, doc);
};

const update = (collection: Collection, doc: EncodedDocument): Collection => {
	const current = collection.get(doc.__id);

	if (!current) {
		throw new Error(`Key not found: ${doc.__id}`);
	}

	const merged = merge(current, doc);

	return new Map(collection).set(merged.__id, merged);
};

const del = (collection: Collection, id: string): Collection => {
	if (!collection.has(id)) {
		throw new Error(`Key not found: ${id}`);
	}

	const final = new Map(collection);

	final.delete(id);

	return final;
};

const from = (docs: EncodedDocument[]): Collection => {
	const final = new Map<string, EncodedDocument>();

	for (const doc of docs) {
		if (final.has(doc.__id)) {
			throw new Error(`Duplicate key found: ${doc.__id}`);
		}

		final.set(doc.__id, doc);
	}

	return final;
};

const insertFrom = <T extends Record<string, unknown>>(
	collection: Collection,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
) => {
	const doc = encode(id, obj, eventstamp, deletedAt);
	return insert(collection, doc);
};

const updateFrom = <T extends Record<string, unknown>>(
	collection: Collection,
	id: string,
	obj: T,
	eventstamp: string,
	deletedAt: string | null = null,
) => {
	const doc = encode(id, obj, eventstamp, deletedAt);
	return update(collection, doc);
};

export type { Collection };
export { insert, update, del, from, insertFrom, updateFrom };
