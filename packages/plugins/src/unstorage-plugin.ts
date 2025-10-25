import type { EncodedObject } from "@byearlybird/starling";
import type { Plugin } from "@byearlybird/starling";
import { prefixStorage, type Storage } from "unstorage";

const unstoragePlugin = <T extends object>(
	baseStorage: Storage<any>,
): Plugin<T> => {
	let unwatch: (() => void) | null = null;
	let storage: Storage | null = null;

	const plugin: Plugin<T> = (store) => ({
		init: async () => {
			storage = prefixStorage(baseStorage, store.collectionKey);
			unwatch = store.on("change", async () => {
				const snapshot = store.snapshot();
				// Convert Map to tuple array for storage
				const arrayData = Array.from(snapshot.entries());
				await storage?.set(store.collectionKey, arrayData);
			});

			const persisted = await storage?.get<[string, EncodedObject][]>(
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
