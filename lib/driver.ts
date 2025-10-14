import type { get as idbGet, set as idbSet } from "idb-keyval";
import type { Driver } from "./types";

export function createMemoryDriver(): Driver {
	const map_ = new Map<string, string>();
	return {
		get(key: string) {
			return Promise.resolve(map_.get(key) || null);
		},
		set(key: string, values: string) {
			map_.set(key, values);
			return Promise.resolve();
		},
	};
}

export function createIdbKeyvalDriver(db: {
	get: typeof idbGet;
	set: typeof idbSet;
}): Driver {
	return {
		async get(key: string) {
			const result = await db.get(key);
			return result || null;
		},
		set(key: string, value: string) {
			return db.set(key, value);
		},
	};
}
