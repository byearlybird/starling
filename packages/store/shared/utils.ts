import { merge } from "@byearlybird/crdt";
import type { EncodedObject } from "@byearlybird/crdt";

export function mapToArray<TValue>(map: Map<string, TValue>): [string, TValue][] {
	return Array.from(map.entries());
}

export function arrayToMap<TValue>(
	array: [string, TValue][],
): Map<string, TValue> {
	return new Map(array);
}

export const mergeItems = (
	map: Map<string, EncodedObject>,
	items: [string, EncodedObject][],
): [string, EncodedObject][] => {
	const merged: [string, EncodedObject][] = [];

	for (const [key, value] of items) {
		const current = map.get(key);
		if (!current) continue;

		const [mergedValue, changed] = merge(current, value);
		if (changed) {
			merged.push([key, mergedValue]);
		}
	}

	return merged;
};
