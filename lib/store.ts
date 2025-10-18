import mitt from "mitt";
import { monotonicFactory } from "ulid";
import type { Storage } from "unstorage";
import { decode, encode, merge } from "./operations";
import type { EncodedObject, EncodedRecord } from "./types";

type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;

type Events<TValue> = {
	insert: { key: string; value: TValue }[];
	update: { key: string; value: TValue }[];
};

export type Store<TValue extends object> = ReturnType<
	typeof createStore<TValue>
>;

export function createStore<TValue extends object>(
	storage: Storage,
	collectionKey: string,
	eventStampFn = monotonicFactory(),
) {
	const emitter_ = mitt<Events<TValue>>();
	const eventstamp_ = eventStampFn;

	return {
		collectionKey,
		async insert(key: string, value: TValue) {
			if (await storage.has(key)) throw new Error(`Duplicate key: ${key}`);
			const encoded = encode(value, eventstamp_());
			await storage.set(key, encoded);
			emitter_.emit("insert", [{ key, value }]);
		},
		async update(key: string, value: DeepPartial<TValue>) {
			const current = await storage.get<EncodedObject>(key);
			if (!current) throw new Error(`Key not found: ${key}`);
			const encoded = encode(value, eventstamp_());
			const [merged] = merge(current, encoded);

			const decoded = decode<TValue>(merged);
			await storage.set(key, merged);
			emitter_.emit("update", [{ key, value: decoded }]);
		},
		async values(): Promise<Record<string, TValue>> {
			const keys = await storage.getKeys();
			const items = await storage.getItems<EncodedObject>(keys);
			const record: Record<string, TValue> = {};
			for (const item of items) {
				record[item.key] = decode(item.value);
			}
			return record;
		},
		async state(): Promise<EncodedRecord> {
			const keys = await storage.getKeys();
			const items = await storage.getItems<EncodedObject>(keys);
			const record: EncodedRecord = {};
			for (const item of items) {
				record[item.key] = item.value;
			}
			return record;
		},
		async getState(key: string): Promise<EncodedObject | null> {
			const item = await storage.get<EncodedObject>(key);
			return item ?? null;
		},
		async mergeState(data: EncodedRecord) {
			const inserted: { key: string; value: TValue }[] = [];
			const updated: { key: string; value: TValue }[] = [];
			const writes: Promise<void>[] = [];

			// Batch fetch all local values at once
			const keys = Object.keys(data);
			const localItems = await storage.getItems<EncodedObject>(keys);
			const localMap = new Map(
				localItems.map((item) => [item.key, item.value]),
			);

			for (const [key, remoteValue] of Object.entries(data)) {
				const localValue = localMap.get(key);
				if (localValue) {
					const [merged, changed] = merge(localValue, remoteValue);
					if (changed) {
						writes.push(storage.set(key, merged));
						updated.push({ key, value: decode<TValue>(merged) });
					}
				} else {
					writes.push(storage.set(key, remoteValue));
					inserted.push({ key, value: decode<TValue>(remoteValue) });
				}
			}

			// Wait for all writes to complete
			await Promise.all(writes);

			if (inserted.length > 0) {
				emitter_.emit("insert", inserted);
			}
			if (updated.length > 0) {
				emitter_.emit("update", updated);
			}
		},
		onInsert(callback: (data: { key: string; value: TValue }[]) => void) {
			emitter_.on("insert", callback);
			return () => emitter_.off("insert", callback);
		},
		onUpdate(callback: (data: { key: string; value: TValue }[]) => void) {
			emitter_.on("update", callback);
			return () => emitter_.off("update", callback);
		},
	};
}
