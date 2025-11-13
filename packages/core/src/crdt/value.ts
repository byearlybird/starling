/**
 * A primitive value wrapped with its eventstamp for Last-Write-Wins conflict resolution.
 * Used as the leaf nodes in the versioned data structure.
 *
 * @template T - The type of the wrapped value (primitive or complex type)
 */
export type EncodedValue<T> = {
	/** The actual value being stored */
	"~value": T;
	/** The eventstamp indicating when this value was last written (ISO|counter|nonce) */
	"~eventstamp": string;
};

export function encodeValue<T>(value: T, eventstamp: string): EncodedValue<T> {
	return {
		"~value": value,
		"~eventstamp": eventstamp,
	};
}

export function decodeValue<T>(value: EncodedValue<T>): T {
	return value["~value"];
}

export function mergeValues<T>(
	into: EncodedValue<T>,
	from: EncodedValue<T>,
): [EncodedValue<T>, string] {
	return into["~eventstamp"] > from["~eventstamp"]
		? [into, into["~eventstamp"]]
		: [from, from["~eventstamp"]];
}
