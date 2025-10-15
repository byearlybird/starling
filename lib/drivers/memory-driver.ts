import type { Driver, EncodedRecord } from "../types";

export function createMemoryDriver(
	map = new Map<string, string>(),
	{
		serialize = JSON.stringify,
		deserialize = JSON.parse,
	}: {
		serialize?: (data: EncodedRecord) => string;
		deserialize?: (data: string) => EncodedRecord;
	} = {},
): Driver {
	return {
		get(key: string) {
			const current = map.get(key);
			if (current) {
				try {
					return Promise.resolve(deserialize(current));
				} catch (error) {
					return Promise.resolve(null);
				}
			} else {
				return Promise.resolve(null);
			}
		},
		set(key: string, values: EncodedRecord) {
			const serialized = serialize(values);
			map.set(key, serialized);
			return Promise.resolve();
		},
	};
}
