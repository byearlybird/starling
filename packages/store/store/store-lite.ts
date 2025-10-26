import mitt, { type Handler } from "mitt";
import { create as createClock } from "../../crdt/src/clock";
import type { EncodedDocument } from "../../crdt/src/document";
import { decode, encode } from "../../crdt/src/document";
import * as $map from "../../crdt/src/map";
import type { DeepPartial } from "../types";

type StoreLiteTransaction<T extends Record<string, unknown>> = {
	put: (key: string, value: T) => void;
	merge: (key: string, value: T) => void;
	del: (key: string) => void;
	commit: () => void;
	rollback: () => void;
};

type StoreLiteChange<T extends Record<string, unknown>> = {
	puts: ReadonlyArray<readonly [string, T]>;
	updates: ReadonlyArray<readonly [string, T]>;
	deletes: ReadonlyArray<string>;
};

type StoreLiteEvents<T extends Record<string, unknown>> = {
	change: StoreLiteChange<T>;
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
	on: <K extends keyof StoreLiteEvents<T>>(
		event: K,
		callback: (data: StoreLiteEvents<T>[K]) => void,
	) => () => void;
};

const create = <T extends Record<string, unknown>>(
	iterable?: Iterable<readonly [string, T]> | null,
): StoreLite<T> => {
	const clock = createClock();
	const encodeValue = (key: string, value: T) =>
		encode(key, value, clock.now());
	const initialEntries = iterable
		? Array.from(
				iterable,
				([key, value]) => [key, encodeValue(key, value)] as const,
			)
		: null;

	const kv = $map.create(initialEntries);
	const emitter = mitt<StoreLiteEvents<T>>();

	const decodeActive = (doc: EncodedDocument | null): T | null => {
		if (!doc || doc.__deletedAt) return null;
		const decoded = decode<T>(doc);
		return decoded.__data;
	};

	const emitChange = (events: {
		puts?: [string, T][];
		updates?: [string, T][];
		deletes?: string[];
	}) => {
		const puts = events.puts ?? [];
		const updates = events.updates ?? [];
		const deletes = events.deletes ?? [];

		if (puts.length === 0 && updates.length === 0 && deletes.length === 0) {
			return;
		}

		emitter.emit("change", { puts, updates, deletes });
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
			const current = decodeActive(kv.get(key));
			if (current) emitChange({ puts: [[key, current]] });
		},
		merge(key: string, value: DeepPartial<T>) {
			const existed = decodeActive(kv.get(key)) !== null;
			kv.merge(key, encodeValue(key, value as T));
			const merged = decodeActive(kv.get(key));
			if (!merged) return;
			if (existed) emitChange({ updates: [[key, merged]] });
			else emitChange({ puts: [[key, merged]] });
		},
		del(key: string) {
			const existed = decodeActive(kv.get(key)) !== null;
			if (!existed) return;
			kv.del(key, clock.now());
			emitChange({ deletes: [key] });
		},
		begin() {
			const tx = kv.begin();
			type PendingAccumulator = {
				puts: [string, T][];
				updates: [string, T][];
				deletes: string[];
			};
			const pending: Array<(acc: PendingAccumulator) => void> = [];

			return {
				put(key: string, value: T) {
					tx.put(key, encodeValue(key, value));
					pending.push((acc) => {
						const current = decodeActive(kv.get(key));
						if (current) acc.puts.push([key, current]);
					});
				},
				merge(key: string, value: T) {
					const existed = decodeActive(kv.get(key)) !== null;
					tx.merge(key, encodeValue(key, value));
					pending.push((acc) => {
						const merged = decodeActive(kv.get(key));
						if (!merged) return;
						if (existed) acc.updates.push([key, merged]);
						else acc.puts.push([key, merged]);
					});
				},
				del(key: string) {
					const existed = decodeActive(kv.get(key)) !== null;
					tx.del(key, clock.now());
					if (!existed) return;
					pending.push((acc) => {
						const doc = kv.get(key);
						if (doc?.__deletedAt) acc.deletes.push(key);
					});
				},
				commit() {
					tx.commit();
					const acc: PendingAccumulator = {
						puts: [],
						updates: [],
						deletes: [],
					};
					for (const fn of pending) {
						fn(acc);
					}
					pending.length = 0;
					emitChange(acc);
				},
				rollback() {
					tx.rollback();
					pending.length = 0;
				},
			};
		},
		on<K extends keyof StoreLiteEvents<T>>(
			event: K,
			callback: (data: StoreLiteEvents<T>[K]) => void,
		) {
			const handler: Handler<StoreLiteEvents<T>[K]> = (payload) => {
				callback(payload as StoreLiteEvents<T>[K]);
			};
			emitter.on(event, handler);
			return () => {
				emitter.off(event, handler);
			};
		},
	};
};

export type {
	StoreLite,
	StoreLiteChange,
	StoreLiteEvents,
	StoreLiteTransaction,
};
export { create };
