export function isObject(value: unknown): boolean {
	return !!(
		value != null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

/**
 * Check if a value is an EncodedValue (primitive with eventstamp).
 * Note: EncodedValue is no longer used in records but kept for backward compatibility.
 */
export function isEncodedValue(value: unknown): boolean {
	return !!(
		typeof value === "object" &&
		value !== null &&
		"~value" in value &&
		"~eventstamp" in value
	);
}

export function isEncodedRecord(value: unknown): boolean {
	return !!(
		typeof value === "object" &&
		value !== null &&
		"~data" in value &&
		"~eventstamps" in value &&
		Object.keys(value).length === 2
	);
}
