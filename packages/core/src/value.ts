export type EncodedValue<T> = {
	"~value": T;
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
