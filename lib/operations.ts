import type { DecodedObject, EncodedObject } from "./types";

export function encode<T extends DecodedObject>(
	obj: T,
	eventstampFn: () => string,
): EncodedObject {
	const result: EncodedObject = {};

	for (const [key, value] of Object.entries(obj)) {
		result[key] = {
			__value: value,
			__eventstamp: eventstampFn(),
		};
	}

	return result;
}

export function decode<T extends DecodedObject>(obj: EncodedObject): T {
	const result = {} as T;

	for (const [key, value] of Object.entries(obj)) {
		(result as Record<string, unknown>)[key] = value.__value;
	}

	return result;
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
