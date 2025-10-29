import type { EncodedDocument, Plugin, Store } from "@byearlybird/starling";
import type { Storage } from "unstorage";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (
	docs: EncodedDocument[],
) => MaybePromise<EncodedDocument[]>;

type UnstorageOnAfterGet = (
	docs: EncodedDocument[],
) => MaybePromise<EncodedDocument[]>;

type UnstorageConfig = {
	debounceMs?: number;
	pollIntervalMs?: number;
	onBeforeSet?: UnstorageOnBeforeSet;
	onAfterGet?: UnstorageOnAfterGet;
};

const unstoragePlugin = <T>(
	key: string,
	storage: Storage<EncodedDocument[]>,
	config: UnstorageConfig = {},
): Plugin<T> => {
	const { debounceMs = 0, pollIntervalMs, onBeforeSet, onAfterGet } = config;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let store: Store<T> | null = null;

	const persistSnapshot = async () => {
		if (!store) return;
		const snapshot = store.snapshot();
		const docs =
			onBeforeSet !== undefined ? await onBeforeSet(snapshot) : snapshot;
		await storage.set(key, docs);
	};

	const schedulePersist = () => {
		const runPersist = () => {
			debounceTimer = null;
			void persistSnapshot();
		};

		if (debounceMs === 0) {
			runPersist();
			return;
		}

		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = setTimeout(runPersist, debounceMs);
	};

	const pollStorage = async () => {
		if (!store) return;
		const persisted = await storage.get<EncodedDocument[]>(key);

		if (!persisted) return;

		const docs =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		if (!docs || docs.length === 0) return;

		store.begin(
			(tx) => {
				for (const doc of docs) {
					tx.merge(doc);
				}
			},
			{ silent: true },
		);
	};

	return {
		hooks: {
			onInit: async (s) => {
				store = s;

				// Initial load from storage
				await pollStorage();

				// Start polling if configured
				if (pollIntervalMs !== undefined && pollIntervalMs > 0) {
					pollInterval = setInterval(() => {
						pollStorage();
					}, pollIntervalMs);
				}
			},
			onDispose: () => {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
				}
				if (pollInterval !== null) {
					clearInterval(pollInterval);
					pollInterval = null;
				}
				store = null;
			},
			onAdd: () => {
				schedulePersist();
			},
			onUpdate: () => {
				schedulePersist();
			},
			onDelete: () => {
				schedulePersist();
			},
		},
	};
};

export { unstoragePlugin };
export type { UnstorageConfig };
