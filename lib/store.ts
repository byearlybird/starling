import type { Emitter as BaseEmitter } from "mitt";
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

type Emitter<TValue> = BaseEmitter<Events<TValue>>;

type InsertFn<TValue extends object> = (
	key: string,
	value: TValue,
) => Promise<void>;

type UpdateFn<TValue extends object> = (
	key: string,
	value: DeepPartial<TValue>,
) => Promise<void>;

type MergeStateFn = (data: EncodedRecord) => Promise<void>;

export type Store<TValue extends object> = {
	collectionKey: string;
	insert: InsertFn<TValue>;
	update: UpdateFn<TValue>;
	mergeState: MergeStateFn;
	values(): Promise<Record<string, TValue>>;
	state(): Promise<EncodedRecord>;
	getState(key: string): Promise<EncodedObject | null>;
	on<K extends keyof Events<TValue>>(
		event: K,
		callback: (data: Events<TValue>[K]) => void,
	): () => void;
	dispose(): void;
};

export function createStore<TValue extends object>(
	storage: Storage,
	collectionKey: string,
	eventstampFn = monotonicFactory(),
): Store<TValue> {
	const emitter = mitt<Events<TValue>>();
	const insert = createInsert(storage, eventstampFn, emitter);
	const update = createUpdate(storage, eventstampFn, emitter);
	const mergeState = createMergeState(storage, emitter);

	async function getAllItems() {
		const keys = await storage.getKeys();
		return storage.getItems<EncodedObject>(keys);
	}

	async function values(): Promise<Record<string, TValue>> {
		const items = await getAllItems();
		const record: Record<string, TValue> = {};
		for (const item of items) {
			record[item.key] = decode(item.value);
		}
		return record;
	}

	async function state(): Promise<EncodedRecord> {
		const items = await getAllItems();
		const record: EncodedRecord = {};
		for (const item of items) {
			record[item.key] = item.value;
		}
		return record;
	}

	async function getState(key: string): Promise<EncodedObject | null> {
		const item = await storage.get<EncodedObject>(key);
		return item ?? null;
	}

	function on<K extends keyof Events<TValue>>(
		event: K,
		callback: (data: Events<TValue>[K]) => void,
	) {
		emitter.on(event, callback);
		return () => emitter.off(event, callback);
	}

	function dispose() {
		emitter.off("insert");
		emitter.off("update");
	}

	return {
		collectionKey,
		insert,
		update,
		values,
		state,
		getState,
		mergeState,
		on,
		dispose,
	};
}

function createInsert<TValue extends object>(
	storage: Storage,
	eventstampFn: () => string,
	emitter: Emitter<TValue>,
): InsertFn<TValue> {
	return async (key: string, value: TValue) => {
		if (await storage.has(key)) throw new Error(`Duplicate key: ${key}`);
		const encoded = encode(value, eventstampFn());
		await storage.set(key, encoded);
		emitter.emit("insert", [{ key, value }]);
	};
}

function createUpdate<TValue extends object>(
	storage: Storage,
	eventstampFn: () => string,
	emitter: Emitter<TValue>,
): UpdateFn<TValue> {
	return async (key: string, value: DeepPartial<TValue>) => {
		const current = await storage.get<EncodedObject>(key);
		if (!current) throw new Error(`Key not found: ${key}`);
		const encoded = encode(value, eventstampFn());
		const [merged] = merge(current, encoded);

		const decoded = decode<TValue>(merged);
		await storage.set(key, merged);
		emitter.emit("update", [{ key, value: decoded }]);
	};
}

function createMergeState<TValue extends object>(
	storage: Storage,
	emitter: Emitter<TValue>,
): MergeStateFn {
	return async (data: EncodedRecord) => {
		const inserted: { key: string; value: TValue }[] = [];
		const updated: { key: string; value: TValue }[] = [];
		const writes: Promise<void>[] = [];

		// Batch fetch all local values at once
		const keys = Object.keys(data);
		const localItems = await storage.getItems<EncodedObject>(keys);
		const localMap = new Map(localItems.map((item) => [item.key, item.value]));

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
			emitter.emit("insert", inserted);
		}
		if (updated.length > 0) {
			emitter.emit("update", updated);
		}
	};
}
