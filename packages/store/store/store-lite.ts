import { create as createClock } from "../../crdt/src/clock";
import type { EncodedDocument } from "../../crdt/src/document";
import { decode, encode } from "../../crdt/src/document";
import * as $map from "../../crdt/src/map";
import type { DeepPartial } from "../types";

/**
 * Hook callbacks that receive batches of decoded entries.
 * Hooks fire on commit only, never during staged operations.
 * Arrays are readonly to prevent external mutation.
 */
type StoreLiteHooks<T extends Record<string, unknown>> = {
	/**
	 * Called once per commit with all put operations accumulated as decoded entries.
	 * Only fires if at least one put occurred.
	 */
	onPut?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/**
	 * Called once per commit with all patch operations accumulated as decoded entries.
	 * Only fires if at least one patch occurred.
	 */
	onPatch?: (entries: ReadonlyArray<readonly [string, T]>) => void;
	/**
	 * Called once per commit with all deleted keys (IDs).
	 * Only fires if at least one delete occurred.
	 */
	onDelete?: (keys: ReadonlyArray<string>) => void;
};

/**
 * Configuration for StoreLite instance.
 * Hooks receive batches of decoded entries on commit.
 */
type StoreLiteOptions<T extends Record<string, unknown>> = {
	hooks?: StoreLiteHooks<T>;
};

type StoreLiteTransaction<T extends Record<string, unknown>> = {
	put: (key: string, value: T) => void;
	patch: (key: string, value: DeepPartial<T>) => void;
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
	patch: (key: string, value: DeepPartial<T>) => void;
	del: (key: string) => void;
	begin: () => StoreLiteTransaction<T>;
};

const create = <T extends Record<string, unknown>>({
	hooks,
}: StoreLiteOptions<T> = {}): StoreLite<T> => {
	const clock = createClock();
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());

	const kv = $map.create();

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc.__deletedAt) return null;
		return decode<T>(doc).__data;
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
			const tx = this.begin();
			tx.put(key, value);
			tx.commit();
		},
		patch(key: string, value: DeepPartial<T>) {
			const tx = this.begin();
			tx.patch(key, value);
			tx.commit();
		},
		del(key: string) {
			const tx = this.begin();
			tx.del(key);
			tx.commit();
		},
		begin() {
			const tx = kv.begin();
			// For puts, we have the value directly
			const putKeyValues: Array<readonly [string, T]> = [];
			// For patches, capture the merged value at patch time
			const patchKeyValues: Array<readonly [string, T]> = [];
			// For deletes, track the keys
			const deleteKeys: Array<string> = [];
			// Track the current state through the transaction (put or patched values)
			const txState = new Map<string, T>();

			return {
				put(key: string, value: T) {
					tx.put(key, encodeValue(key, value));
					txState.set(key, value);
					putKeyValues.push([key, value] as const);
				},
				patch(key: string, value: DeepPartial<T>) {
					tx.patch(key, encode(key, value as T, clock.now()));
					// Get the base value: either from txState (if put/patched in this tx) or from kv
					let baseValue: T | null;
					if (txState.has(key)) {
						baseValue = txState.get(key) ?? null;
					} else {
						baseValue = decodeActive(kv.get(key));
					}

					if (baseValue) {
						// Merge the partial update into the base value
						const merged = { ...baseValue, ...value };
						txState.set(key, merged);
						patchKeyValues.push([key, merged as T] as const);
					}
				},
				del(key: string) {
					const current = txState.get(key) ?? kv.get(key);
					if (!current) return;

					tx.del(key, clock.now());
					deleteKeys.push(key);
				},
				commit() {
					tx.commit();

					// Emit hooks in order with accumulated batches
					if (putKeyValues.length > 0 && hooks?.onPut) {
						hooks.onPut(Object.freeze([...putKeyValues]));
					}
					if (patchKeyValues.length > 0 && hooks?.onPatch) {
						hooks.onPatch(Object.freeze([...patchKeyValues]));
					}
					if (deleteKeys.length > 0 && hooks?.onDelete) {
						hooks.onDelete(Object.freeze([...deleteKeys]));
					}
				},
				rollback() {
					tx.rollback();
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
