import mitt from "mitt";
import { monotonicFactory } from "ulid";
import { decode, encode, merge } from "./operations";
import type { EncodedObject } from "./types";

type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;

type Events<TValue> = {
	insert: TValue[];
	update: TValue[];
};

export function createStore<TValue extends object>() {
	const state_ = new Map<string, EncodedObject>();
	const eventstamp_ = monotonicFactory();
	const emitter_ = mitt<Events<TValue>>();

	return {
		insert(key: string, value: TValue) {
			if (state_.has(key)) throw new Error(`Duplicate key: ${key}`);
			const encoded = encode(value, eventstamp_());
			state_.set(key, encoded);
			emitter_.emit("insert", [value]);
		},
		update(key: string, value: DeepPartial<TValue>) {
			const current = state_.get(key);
			if (!current) throw new Error(`Key not found: ${key}`);
			const encoded = encode(value, eventstamp_());
			const merged = merge(current, encoded);
			const decoded = decode<TValue>(merged);
			state_.set(key, merged);
			emitter_.emit("update", [decoded]);
		},
		values(): Record<string, TValue> {
			const record: Record<string, TValue> = {};
			for (const [key, data] of state_.entries()) {
				record[key] = decode(data);
			}
			return record;
		},
		onInsert(callback: (data: TValue[]) => void) {
			emitter_.on("insert", callback);
			return () => emitter_.off("insert", callback);
		},
		onUpdate(callback: (data: TValue[]) => void) {
			emitter_.on("update", callback);
			return () => emitter_.off("update", callback);
		},
	};
}
