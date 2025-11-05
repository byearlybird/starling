import type { Storage } from "unstorage";
import type { Collection } from "../../crdt";
import type { Plugin, Store } from "../../store";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (data: Collection) => MaybePromise<Collection>;

type UnstorageOnAfterGet = (data: Collection) => MaybePromise<Collection>;

type UnstorageConfig = {
	debounceMs?: number;
	pollIntervalMs?: number;
	onBeforeSet?: UnstorageOnBeforeSet;
	onAfterGet?: UnstorageOnAfterGet;
	skip?: () => boolean;
};

function unstoragePlugin<T>(
	key: string,
	storage: Storage<Collection>,
	config: UnstorageConfig = {},
): Plugin<T> {
	const {
		debounceMs = 0,
		pollIntervalMs,
		onBeforeSet,
		onAfterGet,
		skip,
	} = config;
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
		if (skip?.()) return;

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
		if (skip?.()) return;

		const persisted = await storage.get<Collection>(key);

		if (!persisted) return;

		const data =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		store.merge(data);
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
}

export { unstoragePlugin };
export type { UnstorageConfig };
