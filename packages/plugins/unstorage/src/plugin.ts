import type { Document, Store } from "@byearlybird/starling";
import type { Storage } from "unstorage";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (
	docs: Document.EncodedDocument[],
) => MaybePromise<Document.EncodedDocument[]>;

type UnstorageOnAfterGet = (
	docs: Document.EncodedDocument[],
) => MaybePromise<Document.EncodedDocument[]>;

type UnstorageConfig = {
	debounceMs?: number;
	pollIntervalMs?: number;
	onBeforeSet?: UnstorageOnBeforeSet;
	onAfterGet?: UnstorageOnAfterGet;
};

const unstoragePlugin = <T>(
	key: string,
	storage: Storage<Document.EncodedDocument[]>,
	config: UnstorageConfig = {},
): Store.Plugin<T> => {
	const { debounceMs = 0, pollIntervalMs, onBeforeSet, onAfterGet } = config;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let store: Store.StarlingStore<T> | null = null;

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
		const persisted = await storage.get<Document.EncodedDocument[]>(key);

		if (!persisted) return;

		const docs =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		if (!docs || docs.length === 0) return;

		store.set(
			(tx) => {
				for (const doc of docs) {
					tx.merge(doc);
				}
			},
			{ silent: true },
		);
	};

	return {
		init: async (s) => {
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
		dispose: () => {
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

export { unstoragePlugin };
export type { UnstorageConfig };
