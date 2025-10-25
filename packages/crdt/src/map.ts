import { $document } from ".";
import type { EncodedDocument } from "./document";

const create = (
	iterable?: Iterable<readonly [string, EncodedDocument]> | null,
) => {
	const map = new Map<string, EncodedDocument>(iterable);

	const wrapper = {
		set(id: string, doc: EncodedDocument) {
			const current = map.get(id);
			if (current) {
				const merged = $document.merge(current, doc);
				map.set(id, merged);
			} else {
				map.set(id, doc);
			}
			return wrapper;
		},
		del(id: string, eventstamp: string) {
			const current = map.get(id);
			if (current) {
				const deleted = $document.del(current, eventstamp);
				map.set(id, deleted);
				return true;
			} else {
				return false;
			}
		},
		has: map.has.bind(map),
		get: map.get.bind(map),
		values: map.values.bind(map),
		entries: map.entries.bind(map),
		keys: map.keys.bind(map),
		size: map.size,
	};

	return wrapper;
};

export { create };
