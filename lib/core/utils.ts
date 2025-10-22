import { merge } from "./operations";
import type { EncodedObject } from "./types";

export function mapToArray<TValue>(
	map: Map<string, TValue>,
): { key: string; value: TValue }[] {
	return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

export function arrayToMap<TValue>(
	array: { key: string; value: TValue }[],
): Map<string, TValue> {
	return new Map(array.map(({ key, value }) => [key, value]));
}

export const mergeItems = (
	map: Map<string, EncodedObject>,
	items: { key: string; value: EncodedObject }[],
) => {
	const merged: { key: string; value: EncodedObject }[] = [];

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
