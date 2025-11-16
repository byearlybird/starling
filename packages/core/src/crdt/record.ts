import { MIN_EVENTSTAMP } from "./eventstamp";
import { isObject } from "./utils";

/**
 * Encoded record structure containing data with mirrored eventstamp metadata.
 *
 * The eventstamps structure mirrors the data structure exactly, with eventstamp
 * strings at leaf positions corresponding to data values.
 *
 * This enables field-level Last-Write-Wins merging while keeping data and
 * metadata cleanly separated.
 *
 * @example
 * ```ts
 * // For data: { user: { name: "Alice", age: 30 } }
 * // Returns: [data, meta]
 * // data: { user: { name: "Alice", age: 30 } }
 * // meta: {
 * //   eventstamps: { user: { name: "2025-...|0001|a1b2", age: "2025-...|0001|a1b2" } },
 * //   latest: "2025-...|0001|a1b2"
 * // }
 * ```
 */
export type EncodedRecord = {
	/** The actual data structure */
	data: Record<string, unknown>;
	/** Metadata containing eventstamps and latest timestamp */
	meta: {
		/** Mirrored structure containing eventstamps for each field */
		eventstamps: Record<string, unknown>;
		/** The greatest eventstamp in this record (cached for efficient merging) */
		latest: string;
	};
};

export function processRecord(
	source: EncodedRecord,
	process: (value: unknown, eventstamp: string) => { value: unknown; eventstamp: string },
): EncodedRecord {
	const resultData: Record<string, unknown> = {};
	const resultEventstamps: Record<string, unknown> = {};
	let latestEventstamp = MIN_EVENTSTAMP;

	const step = (
		dataInput: Record<string, unknown>,
		eventstampInput: Record<string, unknown>,
		dataOutput: Record<string, unknown>,
		eventstampOutput: Record<string, unknown>,
	) => {
		for (const key in dataInput) {
			if (!Object.hasOwn(dataInput, key)) continue;

			const value = dataInput[key];
			const eventstamp = eventstampInput[key];

			if (isObject(value) && isObject(eventstamp)) {
				// Nested object - recurse
				dataOutput[key] = {};
				eventstampOutput[key] = {};
				step(
					value as Record<string, unknown>,
					eventstamp as Record<string, unknown>,
					dataOutput[key] as Record<string, unknown>,
					eventstampOutput[key] as Record<string, unknown>,
				);
			} else if (typeof eventstamp === "string") {
				// Leaf value - process it
				const processed = process(value, eventstamp);
				dataOutput[key] = processed.value;
				eventstampOutput[key] = processed.eventstamp;

				// Track the greatest eventstamp
				if (processed.eventstamp > latestEventstamp) {
					latestEventstamp = processed.eventstamp;
				}
			}
		}
	};

	step(
		source.data,
		source.meta.eventstamps,
		resultData,
		resultEventstamps,
	);

	return {
		data: resultData,
		meta: {
			eventstamps: resultEventstamps,
			latest: latestEventstamp,
		},
	};
}

export function encodeRecord<T extends Record<string, unknown>>(
	obj: T,
	eventstamp: string,
): EncodedRecord {
	const data: Record<string, unknown> = {};
	const eventstamps: Record<string, unknown> = {};

	const step = (
		input: Record<string, unknown>,
		dataOutput: Record<string, unknown>,
		eventstampOutput: Record<string, unknown>,
	) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isObject(value)) {
				// Nested object - recurse and create mirrored structure
				dataOutput[key] = {};
				eventstampOutput[key] = {};
				step(
					value as Record<string, unknown>,
					dataOutput[key] as Record<string, unknown>,
					eventstampOutput[key] as Record<string, unknown>,
				);
			} else {
				// Leaf value - store data and eventstamp separately
				dataOutput[key] = value;
				eventstampOutput[key] = eventstamp;
			}
		}
	};

	step(obj, data, eventstamps);
	return {
		data,
		meta: {
			eventstamps,
			latest: eventstamp,
		},
	};
}

export function decodeRecord<T extends Record<string, unknown>>(
	obj: EncodedRecord,
): T {
	// Simply return a deep clone of the data portion
	const result: Record<string, unknown> = {};

	const step = (input: Record<string, unknown>, output: Record<string, unknown>) => {
		for (const key in input) {
			if (!Object.hasOwn(input, key)) continue;

			const value = input[key];

			if (isObject(value)) {
				output[key] = {};
				step(value as Record<string, unknown>, output[key] as Record<string, unknown>);
			} else {
				output[key] = value;
			}
		}
	};

	step(obj.data, result);
	return result as T;
}

export function mergeRecords(
	into: EncodedRecord,
	from: EncodedRecord,
): [EncodedRecord, string] {
	const resultData: Record<string, unknown> = {};
	const resultEventstamps: Record<string, unknown> = {};
	let greatestEventstamp: string = MIN_EVENTSTAMP;

	const step = (
		data1: Record<string, unknown>,
		eventstamps1: Record<string, unknown>,
		data2: Record<string, unknown>,
		eventstamps2: Record<string, unknown>,
		dataOutput: Record<string, unknown>,
		eventstampOutput: Record<string, unknown>,
	) => {
		// Collect all keys from both objects
		const allKeys = new Set([
			...Object.keys(data1),
			...Object.keys(data2),
		]);

		for (const key of allKeys) {
			const value1 = data1[key];
			const value2 = data2[key];
			const stamp1 = eventstamps1[key];
			const stamp2 = eventstamps2[key];

			// Both have this key
			if (value1 !== undefined && value2 !== undefined) {
				// Both are objects - need to recurse
				if (isObject(value1) && isObject(value2) && isObject(stamp1) && isObject(stamp2)) {
					dataOutput[key] = {};
					eventstampOutput[key] = {};
					step(
						value1 as Record<string, unknown>,
						stamp1 as Record<string, unknown>,
						value2 as Record<string, unknown>,
						stamp2 as Record<string, unknown>,
						dataOutput[key] as Record<string, unknown>,
						eventstampOutput[key] as Record<string, unknown>,
					);
				} else if (typeof stamp1 === "string" && typeof stamp2 === "string") {
					// Both are leaf values - compare eventstamps
					if (stamp1 > stamp2) {
						dataOutput[key] = value1;
						eventstampOutput[key] = stamp1;
						if (stamp1 > greatestEventstamp) {
							greatestEventstamp = stamp1;
						}
					} else {
						dataOutput[key] = value2;
						eventstampOutput[key] = stamp2;
						if (stamp2 > greatestEventstamp) {
							greatestEventstamp = stamp2;
						}
					}
				}
			} else if (value1 !== undefined) {
				// Only in first record
				dataOutput[key] = isObject(value1)
					? deepClone(value1)
					: value1;
				eventstampOutput[key] = isObject(stamp1)
					? deepClone(stamp1)
					: stamp1;
			} else if (value2 !== undefined) {
				// Only in second record
				dataOutput[key] = isObject(value2)
					? deepClone(value2)
					: value2;
				eventstampOutput[key] = isObject(stamp2)
					? deepClone(stamp2)
					: stamp2;
			}
		}
	};

	step(
		into.data,
		into.meta.eventstamps,
		from.data,
		from.meta.eventstamps,
		resultData,
		resultEventstamps,
	);

	// Use the cached latest values from both records
	const latestEventstamp =
		into.meta.latest > from.meta.latest
			? into.meta.latest
			: from.meta.latest;

	// Also consider any new eventstamps from the merge
	const finalLatest =
		greatestEventstamp > latestEventstamp
			? greatestEventstamp
			: latestEventstamp;

	return [
		{
			data: resultData,
			meta: {
				eventstamps: resultEventstamps,
				latest: finalLatest,
			},
		},
		finalLatest,
	];
}

/**
 * Deep clone a value (object or primitive).
 */
function deepClone<T>(value: T): T {
	if (!isObject(value)) {
		return value;
	}

	const result: Record<string, unknown> = {};
	for (const key in value as Record<string, unknown>) {
		if (Object.hasOwn(value as Record<string, unknown>, key)) {
			result[key] = deepClone((value as Record<string, unknown>)[key]);
		}
	}
	return result as T;
}
