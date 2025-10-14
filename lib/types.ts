export type EncodedValue<TValue = unknown> = {
	__value: TValue;
	__eventstamp: string;
};

export type EncodedObject = {
	[path: string]: EncodedValue;
};

export type Driver = {
	get: (key: string) => Promise<string>;
	set: (key: string, values: string) => Promise<void>;
};
