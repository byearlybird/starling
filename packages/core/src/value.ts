export type EncodedValue<T> = {
	"~value": T;
	"~eventstamp": string;
};

export const encodeValue = <T>(
	value: T,
	eventstamp: string,
): EncodedValue<T> => ({
	"~value": value,
	"~eventstamp": eventstamp,
});

export const decodeValue = <T>(value: EncodedValue<T>): T => value["~value"];

export const mergeValues = <T>(
	into: EncodedValue<T>,
	from: EncodedValue<T>,
): [EncodedValue<T>, string] =>
	into["~eventstamp"] > from["~eventstamp"]
		? [into, into["~eventstamp"]]
		: [from, from["~eventstamp"]];

export const isEncodedValue = (value: unknown): boolean =>
	!!(
		typeof value === "object" &&
		value !== null &&
		"~value" in value &&
		"~eventstamp" in value
	);
