export const isObject = (value: unknown): boolean =>
	!!(
		value != null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);

export const isEncodedValue = (value: unknown): boolean =>
	!!(
		typeof value === "object" &&
		value !== null &&
		"~value" in value &&
		"~eventstamp" in value
	);
