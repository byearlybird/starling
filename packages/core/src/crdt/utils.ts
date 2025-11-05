export function isObject(value: unknown): boolean {
	return !!(
		value != null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

export function isEncodedValue(value: unknown): boolean {
	return !!(
		typeof value === "object" &&
		value !== null &&
		"~value" in value &&
		"~eventstamp" in value
	);
}
