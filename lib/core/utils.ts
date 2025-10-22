/**
 * Convert a Map to an array of key-value pairs
 */
export function mapToArray<TValue>(
	map: Map<string, TValue>,
): { key: string; value: TValue }[] {
	return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

/**
 * Convert an array of key-value pairs to a Map
 */
export function arrayToMap<TValue>(
	array: { key: string; value: TValue }[],
): Map<string, TValue> {
	return new Map(array.map(({ key, value }) => [key, value]));
}
