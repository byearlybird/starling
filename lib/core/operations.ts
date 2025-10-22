import { flatten, unflatten } from "flat";
import type { ArrayKV, EncodedObject, EventstampFn } from "./types";

export function encode<T extends object>(
	obj: T,
	eventstamp: string,
): EncodedObject {
	const result: EncodedObject = {};
	const flattened = flatten<object, object>(obj, { safe: true });

	for (const [key, value] of Object.entries(flattened)) {
		result[key] = {
			__value: value,
			__eventstamp: eventstamp,
		};
	}

	return result;
}

export function decode<T extends object>(obj: EncodedObject): T {
	const flattened: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(obj)) {
		flattened[key] = value.__value;
	}

	return unflatten(flattened);
}

export function merge(
	obj1: EncodedObject,
	obj2: EncodedObject,
): [EncodedObject, boolean] {
	const result: EncodedObject = {};
	let changed = false;

	// Pass 1: Process all keys from obj1
	for (const key in obj1) {
		if (Object.hasOwn(obj1, key)) {
			const value1 = obj1[key];
			const value2 = obj2[key];
			if (value1 && value2) {
				// Both objects have this key, compare eventstamps
				if (value1.__eventstamp >= value2.__eventstamp) {
					result[key] = value1;
				} else {
					result[key] = value2;
					changed = true;
				}
			} else if (value1) {
				// Only in obj1
				result[key] = value1;
			}
		}
	}

	// Pass 2: Process keys only in obj2
	for (const key in obj2) {
		if (Object.hasOwn(obj2, key) && !(key in result)) {
			result[key] = obj2[key]!;
			changed = true;
		}
	}

	return [result, changed];
}

export function mergeArray(
	current: ArrayKV<EncodedObject>,
	updates: ArrayKV<EncodedObject>,
): [ArrayKV<EncodedObject>, boolean] {
	const currentMap = new Map(current.map((item) => [item.key, item.value]));
	const updatesMap = new Map(updates.map((item) => [item.key, item.value]));
	const result: ArrayKV<EncodedObject> = [];
	let changed = false;

	// Collect all keys from both arrays
	const allKeys = new Set(currentMap.keys());
	for (const key of updatesMap.keys()) {
		allKeys.add(key);
	}

	for (const key of allKeys) {
		const obj1 = currentMap.get(key);
		const obj2 = updatesMap.get(key);

		if (obj1 && !obj2) {
			result.push({ key, value: obj1 });
		} else if (!obj1 && obj2) {
			result.push({ key, value: obj2 });
			changed = true; // New object added
		} else if (obj1 && obj2) {
			const [merged, objChanged] = merge(obj1, obj2);
			result.push({ key, value: merged });
			if (objChanged) {
				changed = true; // Object was changed during merge
			}
		}
	}

	return [result, changed];
}

export const encodeMany = <TValue extends object>(
	data: ArrayKV<TValue>,
	eventstampFn: EventstampFn,
): ArrayKV<EncodedObject> =>
	data.map(({ key, value }) => ({ key, value: encode(value, eventstampFn()) }));

export const decodeMany = <TValue extends object>(
	data: ArrayKV<EncodedObject>,
): ArrayKV<TValue> =>
	data.map(({ key, value }) => ({ key, value: decode<TValue>(value) }));
