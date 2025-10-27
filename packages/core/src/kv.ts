import type { EncodedDocument } from "./document";
import * as Document from "./document";

const create = (
	iterable?: Iterable<readonly [string, EncodedDocument]> | null,
) => {
	let readMap = new Map<string, EncodedDocument>(iterable); // published state

	const kv = {
		get(key: string) {
			return readMap.get(key) ?? null;
		},
		has(key: string) {
			return readMap.has(key);
		},
		values() {
			return readMap.values();
		},
		entries() {
			return readMap.entries();
		},
		get size() {
			return readMap.size;
		},

		// Begin an atomic batch
		begin() {
			const staging = new Map(readMap);
			let committed = false;

			const tx = {
				get(key: string) {
					return staging.get(key) ?? null;
				},
				put(key: string, value: EncodedDocument) {
					staging.set(key, value);
				},
				patch(key: string, value: EncodedDocument) {
					const prev = staging.get(key);
					staging.set(key, prev ? Document.merge(prev, value) : value);
				},
				del(key: string, eventstamp: string) {
					const prev = staging.get(key);
					if (prev) staging.set(key, Document.del(prev, eventstamp));
				},
				has(key: string) {
					const doc = staging.get(key);
					return doc !== undefined;
				},
				// Atomically publish everything
				commit() {
					if (committed) return;
					committed = true;
					readMap = staging; // single atomic swap
				},
				rollback() {
					committed = true; /* drop staging */
				},
			};
			return tx;
		},
	};

	return kv;
};
export { create };
