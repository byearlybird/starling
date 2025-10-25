export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	__deleted?: EncodedValue<boolean>;
	[key: string]: EncodedValue | EncodedObject;
};

export type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

export type EventstampFn = () => string;


export type StoreEvents<TValue> = {
	put: Map<string, TValue>;
	update: Map<string, TValue>;
	delete: { key: string }[];
	change: undefined;
};
