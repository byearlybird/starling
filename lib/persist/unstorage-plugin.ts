import { prefixStorage, type Storage } from "unstorage";
import type { ArrayKV, EncodedObject } from "../core";
import type { Plugin } from "../core/store";

const unstoragePlugin = <TValue extends object>(
	baseStorage: Storage,
): Plugin<TValue> => {
	let unwatch: (() => void) | null = null;
	let storage: Storage | null = null;

	const plugin: Plugin<TValue> = (store) => ({
		init: async () => {
			storage = prefixStorage(baseStorage, store.collectionKey);
			unwatch = store.on("change", async () => {
				await storage?.set(store.collectionKey, store.snapshot());
			});

			const persisted = await storage.get<ArrayKV<EncodedObject>>(
				store.collectionKey,
			);

			if (persisted) {
				store.merge(persisted, { silent: true });
			}
		},
		dispose: () => {
			unwatch?.();
		},
	});

	return plugin;
};

export { unstoragePlugin };
