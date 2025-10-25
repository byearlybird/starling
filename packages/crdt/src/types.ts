export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	__deleted?: EncodedValue<boolean>;
	[key: string]: EncodedValue | EncodedObject;
};

export type EventstampFn = () => string;
