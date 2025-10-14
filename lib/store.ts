import { monotonicFactory } from "ulid";
import { decode, encode, merge } from "./operations";
import type { EncodedObject } from "./types";

export function createStore<TValue extends object>() {
	const state_ = new Map<string, EncodedObject>();
	const eventstamp_ = monotonicFactory();

	return {
		insert(key: string, value: TValue) {
			if (state_.has(key)) throw new Error(`Duplicate key: ${key}`);
			const encoded = encode(value, eventstamp_());
			state_.set(key, encoded);
		},
		update(key: string, value: Partial<TValue>) {
			const current = state_.get(key);
			if (!current) throw new Error(`Key not found: ${key}`);
			const encoded = encode(value, eventstamp_());
			const merged = merge(current, encoded);
			state_.set(key, merged);
		},
		values(): Record<string, TValue> {
			const record: Record<string, TValue> = {};
			for (const [key, data] of state_.entries()) {
				record[key] = decode(data);
			}
			return record;
		},
	};
}
