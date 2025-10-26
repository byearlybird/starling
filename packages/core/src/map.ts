import type { EncodedDocument } from "./document";
import * as $document from "./document";

const create = (
	iterable?: Iterable<readonly [string, EncodedDocument]> | null,
) => {
	let readMap = new Map<string, EncodedDocument>(iterable); // published state

	function cloneMap(src: Map<string, EncodedDocument>) {
		return new Map(src);
	}

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

		// Non-transactional write (direct)
		put(key: string, value: EncodedDocument) {
			const next = cloneMap(readMap);
			next.set(key, value);
			readMap = next;
		},

		patch(key: string, value: EncodedDocument) {
			const next = cloneMap(readMap);
			const prev = next.get(key);
			next.set(key, prev ? $document.merge(prev, value) : value);
			readMap = next;
		},

		del(key: string, eventstamp: string) {
			const next = cloneMap(readMap);
			const prev = next.get(key);
			if (prev) next.set(key, $document.del(prev, eventstamp));
			readMap = next;
		},

		// Begin an atomic batch
		begin() {
			const staging = cloneMap(readMap);
			let committed = false;

			const tx = {
				put(key: string, value: EncodedDocument) {
					staging.set(key, value);
				},
				patch(key: string, value: EncodedDocument) {
					const prev = staging.get(key);
					staging.set(key, prev ? $document.merge(prev, value) : value);
				},
				del(key: string, eventstamp: string) {
					const prev = staging.get(key);
					if (prev) staging.set(key, $document.del(prev, eventstamp));
				},
				has(key: string) {
					const doc = staging.get(key);
					return doc !== undefined && !doc.__deletedAt;
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
