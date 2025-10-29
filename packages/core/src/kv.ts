import type { EncodedDocument } from "./document";
import { deleteDoc, mergeDocs } from "./document";

export const createKV = (
	iterable?: Iterable<readonly [string, EncodedDocument]> | null,
) => {
	let readMap = new Map<string, EncodedDocument>(iterable); // published state

	const kv = {
		get(key: string) {
			return readMap.get(key) ?? null;
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
		// Begin an atomic batch with callback
		begin(
			callback: (tx: {
				get: (key: string) => EncodedDocument | null;
				set: (
					key: string,
					value: EncodedDocument,
					opts?: { replace: boolean },
				) => void;
				del: (key: string, eventstamp: string) => void;
				rollback: () => void;
			}) => void,
		) {
			const staging = new Map(readMap);
			let rolledBack = false;

			const tx = {
				get(key: string) {
					return staging.get(key) ?? null;
				},
				set(
					key: string,
					value: EncodedDocument,
					opts?: { replace: boolean },
				): string | null {
					if (opts?.replace) {
						staging.set(key, value);
						return null;
					} else {
						const prev = staging.get(key);
						if (prev) {
							const [merged, eventstamp] = mergeDocs(prev, value);
							staging.set(key, merged);
							return eventstamp;
						} else {
							staging.set(key, value);
							return null;
						}
					}
				},
				del(key: string, eventstamp: string) {
					const prev = staging.get(key);
					if (prev) staging.set(key, deleteDoc(prev, eventstamp));
				},
				rollback() {
					rolledBack = true; /* drop staging */
				},
			};

			callback(tx);

			// Auto-commit unless rollback was explicitly called
			if (!rolledBack) {
				readMap = staging; // single atomic swap
			}
			// If callback throws, staging is implicitly discarded (auto-rollback)
		},
	};

	return kv;
};
