import type { Driver } from "../types";

export function createMemoryDriver(map = new Map<string, string>()): Driver {
	return {
		get(key: string) {
			return Promise.resolve(map.get(key) || null);
		},
		set(key: string, values: string) {
			map.set(key, values);
			return Promise.resolve();
		},
	};
}
