import { flatten, unflatten } from "flat";
import type { EncodedObject, EventstampFn } from "./types";

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

	// Collect all property keys from both objects
	const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

	for (const key of allKeys) {
		const value1 = obj1[key];
		const value2 = obj2[key];

		if (value1 && !value2) {
			result[key] = value1;
		} else if (!value1 && value2) {
			result[key] = value2;
			changed = true; // New property added
		} else if (value1 && value2) {
			result[key] =
				value1.__eventstamp >= value2.__eventstamp ? value1 : value2;
			// Mark as changed if obj2's value won (had newer eventstamp)
			if (result[key] === value2) {
				changed = true;
			}
		}
	}

	return [result, changed];
}

export function mergeArray(
	current: { key: string; value: EncodedObject }[],
	updates: { key: string; value: EncodedObject }[],
): [{ key: string; value: EncodedObject }[], boolean] {
	const currentMap = new Map(current.map((item) => [item.key, item.value]));
	const updatesMap = new Map(updates.map((item) => [item.key, item.value]));
	const result: { key: string; value: EncodedObject }[] = [];
	let changed = false;

	// Collect all keys from both arrays
	const allKeys = new Set([...currentMap.keys(), ...updatesMap.keys()]);

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
	data: { key: string; value: TValue }[],
	eventstampFn: EventstampFn,
): { key: string; value: EncodedObject }[] =>
	data.map(({ key, value }) => ({ key, value: encode(value, eventstampFn()) }));

export const decodeMany = <TValue extends object>(
	data: { key: string; value: EncodedObject }[],
): { key: string; value: TValue }[] =>
	data.map(({ key, value }) => ({ key, value: decode<TValue>(value) }));
