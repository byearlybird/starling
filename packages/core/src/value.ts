type EncodedValue<T> = {
	"~value": T;
	"~eventstamp": string;
};

const encode = <T>(value: T, eventstamp: string): EncodedValue<T> => ({
	"~value": value,
	"~eventstamp": eventstamp,
});

const decode = <T>(value: EncodedValue<T>): T => value["~value"];

const merge = <T>(
	into: EncodedValue<T>,
	from: EncodedValue<T>,
): EncodedValue<T> =>
	into["~eventstamp"] > from["~eventstamp"] ? into : from;

const isEncoded = (value: unknown): boolean =>
	!!(
		typeof value === "object" &&
		value !== null &&
		"~value" in value &&
		"~eventstamp" in value
	);

export type { EncodedValue };
export { encode, decode, isEncoded, merge };
