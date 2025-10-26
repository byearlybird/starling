import { $document, type $store } from "@byearlybird/starling";
import type { Storage } from "unstorage";

const unstoragePlugin = <T extends Record<string, unknown>>(
	key: string,
	storage: Storage<$document.EncodedDocument[]>,
): $store.Plugin<T> => {
	const plugin: $store.Plugin<T> = (store) => ({
		init: async () => {
			const persisted = await storage.get<$document.EncodedDocument[]>(key);

			if (persisted) {
				const tx = store.begin();
				for (const doc of persisted) {
					tx.put(doc.__id, $document.decode(doc).__data as T);
				}
				tx.commit({ silent: true });
			}
		},
		dispose: () => {},
		hooks: {
			onPut: () => {
				storage.set(key, store.snapshot());
			},
			onPatch: () => {
				storage.set(key, store.snapshot());
			},
			onDelete: () => {
				storage.set(key, store.snapshot());
			},
		},
	});

	return plugin;
};

export { unstoragePlugin };
