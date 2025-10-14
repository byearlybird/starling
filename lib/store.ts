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

export type Data = Record<string, EncodedObject>;

export type Store<TValue extends object> = ReturnType<
	typeof createStore<TValue>
>;

export function createStore<TValue extends object>() {
	let state_ = new Map<string, EncodedObject>();
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
			const [merged] = merge(current, encoded);
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
		state(): Data {
			const record: Data = {};
			for (const [key, data] of state_.entries()) {
				record[key] = data;
			}
			return record;
		},
		mergeState(data: Data) {
			const inserted: TValue[] = [];
			const updated: TValue[] = [];

			for (const [key, remoteValue] of Object.entries(data)) {
				const localValue = state_.get(key);
				if (localValue) {
					const [merged, changed] = merge(localValue, remoteValue);
					if (changed) {
						state_.set(key, merged);
						updated.push(decode<TValue>(merged));
					}
				} else {
					state_.set(key, remoteValue);
					inserted.push(decode<TValue>(remoteValue));
				}
			}

			if (inserted.length > 0) {
				emitter_.emit("insert", inserted);
			}
			if (updated.length > 0) {
				emitter_.emit("update", updated);
			}
		},
		onInsert(callback: (data: TValue[]) => void) {
			emitter_.on("insert", callback);
			return () => emitter_.off("insert", callback);
		},
		onUpdate(callback: (data: TValue[]) => void) {
			emitter_.on("update", callback);
			return () => emitter_.off("update", callback);
		},
		__unsafe_replace(data: Data) {
			const replacement = new Map<string, EncodedObject>(Object.entries(data));
			state_ = replacement;
		},
	};
}
