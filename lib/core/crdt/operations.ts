import type { EncodedObject, EventstampFn } from "@core/shared/types";

export function encode<T extends object>(
	obj: T,
	eventstamp: string,
): EncodedObject {
	const result: EncodedObject = {};

	function step(target: Record<string, unknown>, output: EncodedObject) {
		for (const key in target) {
			if (!Object.hasOwn(target, key)) continue;

			const value = target[key];

			// Check if this is a nested object (not array, plain object)
			if (
				value != null &&
				typeof value === "object" &&
				!Array.isArray(value) &&
				Object.getPrototypeOf(value) === Object.prototype
			) {
				// Recurse into nested object
				output[key] = {} as EncodedObject;
				step(value as Record<string, unknown>, output[key] as EncodedObject);
			} else {
				// Leaf value - wrap with eventstamp
				(output as Record<string, unknown>)[key] = {
					__value: value,
					__eventstamp: eventstamp,
				};
			}
		}
	}

	step(obj as Record<string, unknown>, result);
	return result;
}

export function decode<T extends object>(obj: EncodedObject): T {
	const result: Record<string, unknown> = {};

	function step(source: EncodedObject, output: Record<string, unknown>) {
		for (const key in source) {
			if (!Object.hasOwn(source, key)) continue;
			if (key === "__deleted") continue;

			const value = source[key];

			// Check if this is an EncodedValue or a nested EncodedObject
			if (value && "__value" in value && "__eventstamp" in value) {
				// This is an EncodedValue - extract the value
				output[key] = (value as { __value: unknown }).__value;
			} else if (
				typeof value === "object" &&
				value !== null &&
				!Array.isArray(value)
			) {
				// This is a nested EncodedObject - recurse
				output[key] = {};
				step(value as EncodedObject, output[key] as Record<string, unknown>);
			}
		}
	}

	step(obj, result);
	return result as T;
}

export function merge(
	obj1: EncodedObject,
	obj2: EncodedObject,
): [EncodedObject, boolean] {
	const result: EncodedObject = {};
	let changed = false;

	function isEncodedValue(
		val: unknown,
	): val is { __value: unknown; __eventstamp: string } {
		return (
			val != null &&
			typeof val === "object" &&
			"__value" in val &&
			"__eventstamp" in val
		);
	}

	function step(v1: EncodedObject, v2: EncodedObject, output: EncodedObject) {
		// Process all keys from v1
		for (const key in v1) {
			if (!Object.hasOwn(v1, key)) continue;

			const value1 = v1[key];
			const value2 = v2[key];

			if (isEncodedValue(value1) && isEncodedValue(value2)) {
				// Both are EncodedValues - compare eventstamps
				if (value1.__eventstamp >= value2.__eventstamp) {
					(output as Record<string, unknown>)[key] = value1;
				} else {
					(output as Record<string, unknown>)[key] = value2;
					changed = true;
				}
			} else if (isEncodedValue(value1)) {
				// Only in v1 or v2 is nested
				(output as Record<string, unknown>)[key] = value1;
			} else if (
				value1 &&
				value2 &&
				typeof value1 === "object" &&
				typeof value2 === "object"
			) {
				// Both are nested objects - recurse
				(output as Record<string, unknown>)[key] = {};
				step(
					value1 as EncodedObject,
					value2 as EncodedObject,
					(output as Record<string, unknown>)[key] as EncodedObject,
				);
			} else if (value1) {
				// Only in v1
				(output as Record<string, unknown>)[key] = value1;
			}
		}

		// Process keys only in v2
		for (const key in v2) {
			if (!Object.hasOwn(v2, key) || Object.hasOwn(result, key)) continue;

			const value = v2[key];
			if (value) {
				(output as Record<string, unknown>)[key] = value;
				changed = true;
			}
		}
	}

	step(obj1, obj2, result);
	return [result, changed];
}

export function mergeArray(
	current: [string, EncodedObject][],
	updates: [string, EncodedObject][],
): [[string, EncodedObject][], boolean] {
	const updatesMap = new Map(updates);
	const result: [string, EncodedObject][] = [];
	let changed = false;
	const seenKeys = new Set<string>();

	// Process all current items
	for (const [key, obj1] of current) {
		seenKeys.add(key);
		const obj2 = updatesMap.get(key);

		if (obj2) {
			// Both objects exist - merge them
			const [merged, objChanged] = merge(obj1, obj2);
			result.push([key, merged]);
			if (objChanged) {
				changed = true;
			}
		} else {
			// Only in current
			result.push([key, obj1]);
		}
	}

	// Process new items from updates (only those not in current)
	for (const [key, obj2] of updates) {
		if (!seenKeys.has(key)) {
			result.push([key, obj2]);
			changed = true; // New object added
		}
	}

	return [result, changed];
}

export const encodeMany = <TValue extends object>(
	data: [string, TValue][],
	eventstampFn: EventstampFn,
): [string, EncodedObject][] =>
	data.map(([key, value]) => [key, encode(value, eventstampFn())]);

export const decodeMany = <TValue extends object>(
	data: [string, EncodedObject][],
): [string, TValue][] =>
	data.map(([key, value]) => [key, decode<TValue>(value)]);
