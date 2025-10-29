import type { Plugin, Store, StoreSnapshot } from "@byearlybird/starling";
import type { Storage } from "unstorage";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (
	data: StoreSnapshot,
) => MaybePromise<StoreSnapshot>;

type UnstorageOnAfterGet = (data: StoreSnapshot) => MaybePromise<StoreSnapshot>;

type UnstorageConfig = {
	debounceMs?: number;
	pollIntervalMs?: number;
	onBeforeSet?: UnstorageOnBeforeSet;
	onAfterGet?: UnstorageOnAfterGet;
};

const unstoragePlugin = <T>(
	key: string,
	storage: Storage<StoreSnapshot>,
	config: UnstorageConfig = {},
): Plugin<T> => {
	const { debounceMs = 0, pollIntervalMs, onBeforeSet, onAfterGet } = config;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let store: Store<T> | null = null;

	const persistSnapshot = async () => {
		if (!store) return;
		const data = store.snapshot();
		const persisted =
			onBeforeSet !== undefined ? await onBeforeSet(data) : data;
		await storage.set(key, persisted);
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
		const persisted = await storage.get<StoreSnapshot>(key);

		if (!persisted) return;

		const data =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		if (!data || !data.docs || data.docs.length === 0) return;

		// Forward the clock to the persisted timestamp before merging
		// This ensures new writes get higher timestamps than remote data
		store.forwardClock(data.latestEventstamp);

		store.begin(
			(tx) => {
				for (const doc of data.docs) {
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
