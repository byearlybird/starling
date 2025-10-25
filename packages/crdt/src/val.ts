type EncodedValue<T> = {
	__value: T;
	__eventstamp: string;
};

const encode = <T>(value: T, eventstamp: string): EncodedValue<T> => ({
	__value: value,
	__eventstamp: eventstamp,
});

const decode = <T>(value: EncodedValue<T>): T => value.__value;

const merge = <T>(
	into: EncodedValue<T>,
	from: EncodedValue<T>,
): EncodedValue<T> => ({
	__value: into.__eventstamp > from.__eventstamp ? into.__value : from.__value,
	__eventstamp:
		into.__eventstamp > from.__eventstamp
			? into.__eventstamp
			: from.__eventstamp,
});

const isEncoded = (value: unknown): boolean =>
	!!(
		typeof value === "object" &&
		value !== null &&
		"__value" in value &&
		"__eventstamp" in value
	);

export type { EncodedValue };
export { encode, decode, isEncoded, merge };
