import * as $value from "./val";

export type EncodedObject = {
	[key: string]: $value.EncodedValue<unknown> | EncodedObject;
};

const isObject = (value: unknown): boolean =>
	!!(
		value != null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);

const encode = <T extends Record<string, unknown>>(
	obj: T,
	eventstamp: string,
) => {
	const result: EncodedObject = {};

	const step = (target: T, output: EncodedObject) => {
		for (const key in target) {
			if (!Object.hasOwn(target, key)) continue;

			const value = target[key];

			if (isObject(value)) {
				// Recurse into nested object
				output[key] = {} as EncodedObject;
				step(value as T, output[key] as EncodedObject);
			} else {
				// Leaf value - wrap with eventstamp
				output[key] = $value.encode(value, eventstamp);
			}
		}
	};

	step(obj, result);

	return result;
};

const decode = <T extends Record<string, unknown>>(obj: EncodedObject): T => {
	const result: Record<string, unknown> = {};

	const step = (source: EncodedObject, output: Record<string, unknown>) => {
		for (const key in source) {
			if (!Object.hasOwn(source, key)) continue;
			const value = source[key];

			if ($value.isEncoded(value)) {
				output[key] = $value.decode(value as $value.EncodedValue<unknown>);
			} else if (isObject(value)) {
				// This is a nested EncodedObject - recurse
				output[key] = {};
				step(value as EncodedObject, output[key] as Record<string, unknown>);
			}
		}
	};

	step(obj, result);
	return result as T;
};

const merge = (into: EncodedObject, from: EncodedObject): EncodedObject => {
	const result: EncodedObject = {};

	const step = (
		v1: EncodedObject,
		v2: EncodedObject,
		output: EncodedObject,
	) => {
		// Process all keys from v1
		for (const key in v1) {
			if (!Object.hasOwn(v1, key)) continue;
			const value1 = v1[key];
			const value2 = v2[key];

			if ($value.isEncoded(value1) && $value.isEncoded(value2)) {
				// Both are EncodedValues - merge using value merge
				output[key] = $value.merge(
					value1 as $value.EncodedValue<unknown>,
					value2 as $value.EncodedValue<unknown>,
				);
			} else if ($value.isEncoded(value1)) {
				// Only v1 is encoded
				output[key] = value1 as $value.EncodedValue<unknown>;
			} else if (isObject(value1) && isObject(value2)) {
				// Both are nested objects - recurse
				output[key] = {};
				step(
					value1 as EncodedObject,
					value2 as EncodedObject,
					output[key] as EncodedObject,
				);
			} else if (value1) {
				// Use v1's value
				output[key] = value1;
			}
		}

		// Process keys only in v2
		for (const key in v2) {
			if (!Object.hasOwn(v2, key) || Object.hasOwn(output, key)) continue;
			const value = v2[key];
			if (value !== undefined) {
				output[key] = value;
			}
		}
	};

	step(into, from, result);
	return result;
};

export { encode, decode, merge };
