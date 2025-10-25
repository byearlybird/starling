import type { EncodedObject } from "@byearlybird/crdt";

export type DeepPartial<T> = T extends object
	? { [P in keyof T]?: DeepPartial<T[P]> }
	: T;

export type StoreEvents<TValue> = {
	put: Map<string, TValue>;
	update: Map<string, TValue>;
	delete: { key: string }[];
	change: undefined;
};
