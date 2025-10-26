import type { $document, $store } from "@byearlybird/starling";
import type { Storage } from "unstorage";

type UnstorageConfig = {
	debounceMs?: number;
};

const unstoragePlugin = <T extends Record<string, unknown>>(
	key: string,
	storage: Storage<$document.EncodedDocument[]>,
	config: UnstorageConfig = {},
): $store.Plugin<T> => {
	const plugin: $store.Plugin<T> = (store) => {
		const { debounceMs = 0 } = config;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const persistSnapshot = () => {
			storage.set(key, store.snapshot());
		};

		const schedulePersist = () => {
			if (debounceMs === 0) {
				persistSnapshot();
			} else {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
				}
				debounceTimer = setTimeout(() => {
					persistSnapshot();
					debounceTimer = null;
				}, debounceMs);
			}
		};

		return {
			init: async () => {
				const persisted = await storage.get<$document.EncodedDocument[]>(key);

				if (persisted) {
					const tx = store.begin();
					for (const doc of persisted) {
						tx.merge(doc);
					}
					tx.commit({ silent: true });
				}
			},
			dispose: () => {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
				}
			},
			hooks: {
				onPut: () => {
					schedulePersist();
				},
				onPatch: () => {
					schedulePersist();
				},
				onDelete: () => {
					schedulePersist();
				},
			},
		};
	};

	return plugin;
};

export { unstoragePlugin };
