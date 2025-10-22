import { prefixStorage, type Storage } from "unstorage";
import type { ArrayKV, EncodedObject, Store } from "../core";

const makePersisted = <TValue extends object>(
	store: Store<TValue>,
	{
		storage: baseStorage,
	}: {
		storage: Storage;
	},
) => {
	const storage = prefixStorage(baseStorage, store.collectionKey);

	const unwatch = store.on("change", () => {
		storage.set<{ key: string; value: EncodedObject }[]>(
			store.collectionKey,
			store.snapshot(),
		);
	});

	return {
		async load() {
			const persisted = await storage.get<ArrayKV<EncodedObject>>(
				store.collectionKey,
			);

			if (persisted) {
				store.merge(persisted);
			}
		},
		dispose() {
			unwatch();
		},
	};
};

export { makePersisted };
