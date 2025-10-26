import { create as createClock } from "../../crdt/src/clock";
import type { EncodedDocument } from "../../crdt/src/document";
import { decode, encode } from "../../crdt/src/document";
import * as $map from "../../crdt/src/map";
import type { DeepPartial } from "../types";

type StoreLiteHooks = {
	onPut?: (key: string, doc: EncodedDocument) => void;
	onMerge?: (key: string, doc: EncodedDocument) => void;
	onDelete?: (key: string, doc: EncodedDocument) => void;
};

type StoreLiteOptions = {
	hooks?: StoreLiteHooks;
};

type StoreLiteTransaction<T extends Record<string, unknown>> = {
	put: (key: string, value: T) => void;
	merge: (key: string, value: DeepPartial<T>) => void;
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
	merge: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	begin: () => StoreLiteTransaction<T>;
};

const create = <T extends Record<string, unknown>>({
	hooks,
}: StoreLiteOptions = {}): StoreLite<T> => {
	const clock = createClock();
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());

	const kv = $map.create();

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc.__deletedAt) return null;
		return decode<T>(doc).__data;
	};

	const invokeHook = (
		hook: ((key: string, doc: EncodedDocument) => void) | undefined,
		key: string,
	) => {
		if (!hook) return;
		const doc = kv.get(key);
		if (doc) hook(key, doc);
	};

	return {
		get(key: string) {
			return decodeActive(kv.get(key));
		},
		has(key: string) {
			return decodeActive(kv.get(key)) !== null;
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
			invokeHook(hooks?.onPut, key);
		},
		merge(key: string, value: DeepPartial<T>) {
			kv.merge(key, encode(key, value as T, clock.now()));
			invokeHook(hooks?.onMerge, key);
		},
		del(key: string) {
			const current = kv.get(key);
			if (!current) return;
			kv.del(key, clock.now());
			invokeHook(hooks?.onDelete, key);
		},
		begin() {
			const tx = kv.begin();
			const pending: Array<() => void> = [];

			return {
				put(key: string, value: T) {
					tx.put(key, encodeValue(key, value));
					if (hooks?.onPut) {
						pending.push(() => invokeHook(hooks.onPut, key));
					}
				},
				merge(key: string, value: DeepPartial<T>) {
					tx.merge(key, encode(key, value as T, clock.now()));
					if (hooks?.onMerge) {
						pending.push(() => invokeHook(hooks.onMerge, key));
					}
				},
				del(key: string) {
					tx.del(key, clock.now());
					if (hooks?.onDelete) {
						pending.push(() => invokeHook(hooks.onDelete, key));
					}
				},
				commit() {
					tx.commit();
					for (const fn of pending) fn();
					pending.length = 0;
				},
				rollback() {
					tx.rollback();
					pending.length = 0;
				},
			};
		},
	};
};

export type {
	StoreLite,
	StoreLiteHooks,
	StoreLiteOptions,
	StoreLiteTransaction,
};
export { create };
