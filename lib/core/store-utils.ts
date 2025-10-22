import { merge } from "./operations";
import type { EncodedObject } from "./types";

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
