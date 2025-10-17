export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	[path: string]: EncodedValue;
};

export type EncodedRecord = Record<string, EncodedObject>;

export type Driver<T = unknown> = {
	get: <TReturn = T>(key: string) => Promise<TReturn | null>;
	set: <TSet = T>(key: string, values: TSet) => Promise<void>;
};
