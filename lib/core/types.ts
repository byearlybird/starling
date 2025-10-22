export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	__deleted?: EncodedValue<boolean>;
	[path: string]: EncodedValue;
};

export type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

export type EventstampFn = () => string;

export type ArrayKV<T> = { key: string; value: T }[];
