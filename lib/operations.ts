import { flatten, unflatten } from "flat";
import type { EncodedObject } from "./types";

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

export function merge(obj1: EncodedObject, obj2: EncodedObject): EncodedObject {
	const result: EncodedObject = {};

	// Collect all property keys from both objects
	const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

	for (const key of allKeys) {
		const value1 = obj1[key];
		const value2 = obj2[key];

		if (value1 && !value2) {
			result[key] = value1;
		} else if (!value1 && value2) {
			result[key] = value2;
		} else if (value1 && value2) {
			result[key] =
				value1.__eventstamp >= value2.__eventstamp ? value1 : value2;
		}
	}

	return result;
}
