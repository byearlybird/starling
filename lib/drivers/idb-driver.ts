import type { get as idbGet, set as idbSet } from "idb-keyval";
import type { Driver, EncodedRecord } from "../types";

export function createIdbDriver(db: {
	get: typeof idbGet;
	set: typeof idbSet;
}): Driver {
	return {
		async get(key: string) {
			const result = await db.get(key);
			return result || null;
		},
		set(key: string, value: EncodedRecord) {
			return db.set(key, value);
		},
	};
}
