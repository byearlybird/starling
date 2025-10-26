import { create as createClock } from "../../crdt/src/clock";
import type { EncodedDocument } from "../../crdt/src/document";
import { decode, encode } from "../../crdt/src/document";
import * as $map from "../../crdt/src/map";

type StoreLiteTransaction<T extends Record<string, unknown>> = {
	put: (key: string, value: T) => void;
	merge: (key: string, value: T) => void;
	del: (key: string) => void;
	commit: () => void;
	rollback: () => void;
};

type StoreLite<T extends Record<string, unknown>> = {
	get: (key: string) => T | null;
	has: (key: string) => boolean;
	readonly size: number;
	values: () => IterableIterator<T>;
	entries: () => IterableIterator<readonly [string, T]>;
	put: (key: string, value: T) => void;
	merge: (key: string, value: T) => void;
	del: (key: string) => void;
	begin: () => StoreLiteTransaction<T>;
};

const create = <T extends Record<string, unknown>>(): StoreLite<T> => {
	const kv = $map.create();
	const clock = createClock();
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc.__deletedAt) return null;
		const decoded = decode<T>(doc);
		return decoded.__data;
	};

	return {
		get(key: string) {
			return decodeActive(kv.get(key));
		},
		has(key: string) {
			const doc = kv.get(key);
			return !!doc && !doc.__deletedAt;
		},
		values() {
			function* iterator() {
				for (const doc of kv.values()) {
					const data = decodeActive(doc);
					if (data) yield data;
				}
			}

			return iterator();
		},
		entries() {
			function* iterator() {
				for (const [key, doc] of kv.entries()) {
					const data = decodeActive(doc);
					if (data) yield [key, data] as const;
				}
			}

			return iterator();
		},
		get size() {
			let count = 0;
			for (const doc of kv.values()) {
				if (doc && !doc.__deletedAt) count++;
			}
			return count;
		},
		put(key: string, value: T) {
			kv.put(key, encodeValue(key, value));
		},
		merge(key: string, value: T) {
			kv.merge(key, encodeValue(key, value));
		},
		del(key: string) {
			kv.del(key, clock.now());
		},
		begin() {
			const tx = kv.begin();
			return {
				put(key: string, value: T) {
					tx.put(key, encodeValue(key, value));
				},
				merge(key: string, value: T) {
					tx.merge(key, encodeValue(key, value));
				},
				del(key: string) {
					tx.del(key, clock.now());
				},
				commit() {
					tx.commit();
				},
				rollback() {
					tx.rollback();
				},
			};
		},
	};
};

export type { StoreLite, StoreLiteTransaction };
export { create };
