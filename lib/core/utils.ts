import { merge } from "./operations";
import type { ArrayKV, EncodedObject } from "./types";

export function mapToArray<TValue>(map: Map<string, TValue>): ArrayKV<TValue> {
	return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

export function arrayToMap<TValue>(
	array: ArrayKV<TValue>,
): Map<string, TValue> {
	return new Map(array.map(({ key, value }) => [key, value]));
}

export const mergeItems = (
	map: Map<string, EncodedObject>,
	items: ArrayKV<EncodedObject>,
): ArrayKV<EncodedObject> => {
	const merged: ArrayKV<EncodedObject> = [];

	for (const { key, value } of items) {
		const current = map.get(key);
		if (!current) continue;

		const [mergedValue, changed] = merge(current, value);
		if (changed) {
			merged.push({ key, value: mergedValue });
		}
	}

	return merged;
};
