import { isObject } from "./utils";
import {
	decodeValue,
	type EncodedValue,
	encodeValue,
	isEncodedValue,
	mergeValues,
} from "./value";

export type EncodedRecord = {
	[key: string]: EncodedValue<unknown> | EncodedRecord;
};

export const processRecord = (
	source: EncodedRecord,
	process: (value: EncodedValue<unknown>) => EncodedValue<unknown>,
): EncodedRecord => {
	const result: EncodedRecord = {};

	const step = (input: EncodedRecord, output: EncodedRecord) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isEncodedValue(value)) {
				output[key] = process(value as EncodedValue<unknown>);
			} else if (isObject(value)) {
				output[key] = {};
				step(value as EncodedRecord, output[key] as EncodedRecord);
			}
		}
	};

	step(source, result);
	return result;
};

export const encodeRecord = <T extends Record<string, unknown>>(
	obj: T,
	eventstamp: string,
): EncodedRecord => {
	const result: EncodedRecord = {};

	const step = (input: Record<string, unknown>, output: EncodedRecord) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isObject(value)) {
				output[key] = {};
				step(value as Record<string, unknown>, output[key] as EncodedRecord);
			} else {
				output[key] = encodeValue(value, eventstamp);
			}
		}
	};

	step(obj, result);
	return result;
};

export const decodeRecord = <T extends Record<string, unknown>>(
	obj: EncodedRecord,
): T => {
	const result: Record<string, unknown> = {};

	const step = (input: EncodedRecord, output: Record<string, unknown>) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isEncodedValue(value)) {
				output[key] = decodeValue(value as EncodedValue<unknown>);
			} else if (isObject(value)) {
				output[key] = {};
				step(value as EncodedRecord, output[key] as Record<string, unknown>);
			}
		}
	};

	step(obj, result);
	return result as T;
};

export const mergeRecords = (
	into: EncodedRecord,
	from: EncodedRecord,
): EncodedRecord => {
	const result: EncodedRecord = {};

	const step = (v1: EncodedRecord, v2: EncodedRecord, output: EncodedRecord) => {
		// Process all keys from v1
		for (const key in v1) {
			if (!Object.hasOwn(v1, key)) continue;
			const value1 = v1[key];
			const value2 = v2[key];

			if (isEncodedValue(value1) && isEncodedValue(value2)) {
				// Both are EncodedValues - merge using value merge
				output[key] = mergeValues(
					value1 as EncodedValue<unknown>,
					value2 as EncodedValue<unknown>,
				);
			} else if (isEncodedValue(value1)) {
				// Only v1 is encoded
				output[key] = value1 as EncodedValue<unknown>;
			} else if (isObject(value1) && isObject(value2)) {
				// Both are nested objects - recurse
				output[key] = {};
				step(value1 as EncodedRecord, value2 as EncodedRecord, output[key] as EncodedRecord);
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
