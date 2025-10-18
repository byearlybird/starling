export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	[path: string]: EncodedValue;
};

export type EncodedRecord = Record<string, EncodedObject>;
