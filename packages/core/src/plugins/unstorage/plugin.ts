import type { Storage } from "unstorage";
import type { Document } from "../../document";
import type { Plugin, StoreCore } from "../../store/store";

type MaybePromise<T> = T | Promise<T>;

type UnstorageOnBeforeSet = (data: Document) => MaybePromise<Document>;

type UnstorageOnAfterGet = (data: Document) => MaybePromise<Document>;

/**
 * Configuration options for the unstorage persistence plugin.
 */
type UnstorageConfig = {
	/** Delay in ms to collapse rapid mutations into a single write. Default: 0 (immediate) */
	debounceMs?: number;
	/** Interval in ms to poll storage for external changes. When set, enables automatic sync. */
	pollIntervalMs?: number;
	/** Hook invoked before persisting to storage. Use for encryption, compression, etc. */
	onBeforeSet?: UnstorageOnBeforeSet;
	/** Hook invoked after loading from storage. Use for decryption, validation, etc. */
	onAfterGet?: UnstorageOnAfterGet;
	/** Function that returns true to skip persistence operations. Use for conditional sync. */
	skip?: () => boolean;
};

/**
 * Persistence plugin for Starling using unstorage backends.
 *
 * Automatically persists store snapshots and optionally polls for external changes.
 *
 * @param key - Storage key for this dataset
 * @param storage - Unstorage instance (localStorage, HTTP, filesystem, etc.)
 * @param config - Optional configuration for debouncing, polling, hooks, and conditional sync
 * @returns Plugin instance for store.use()
 *
 * @example
 * ```ts
 * import { unstoragePlugin } from "@byearlybird/starling/plugin-unstorage";
 * import { createStorage } from "unstorage";
 * import localStorageDriver from "unstorage/drivers/localstorage";
 *
 * const store = await new Store<Todo>()
 *   .use(unstoragePlugin('todos', createStorage({
 *     driver: localStorageDriver({ base: 'app:' })
 *   }), {
 *     debounceMs: 300,
 *     pollIntervalMs: 5000,
 *     skip: () => !navigator.onLine
 *   }))
 *   .init();
 * ```
 *
 * @see {@link ../../../../docs/plugins/unstorage.md} for detailed configuration guide
 */
function unstoragePlugin<T>(
	key: string,
	storage: Storage<Document>,
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
	let store: StoreCore<T> | null = null;
	let persistPromise: Promise<void> | null = null;

	const persistSnapshot = async () => {
		if (!store) return;
		const data = store.collection();
		const persisted =
			onBeforeSet !== undefined ? await onBeforeSet(data) : data;
		await storage.set(key, persisted);
	};

	const runPersist = async () => {
		debounceTimer = null;
		persistPromise = persistSnapshot();
		await persistPromise;
		persistPromise = null;
	};

	const schedulePersist = () => {
		if (skip?.()) return;

		if (debounceMs === 0) {
			persistPromise = persistSnapshot().finally(() => {
				persistPromise = null;
			});
			return;
		}

		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
		}

		debounceTimer = setTimeout(() => {
			runPersist();
		}, debounceMs);
	};

	const pollStorage = async () => {
		if (!store) return;
		if (skip?.()) return;

		const persisted = await storage.get<Document>(key);

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
			onDispose: async () => {
				// Flush any pending debounced write
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
					// Run the pending persist operation
					await runPersist();
				}
				if (pollInterval !== null) {
					clearInterval(pollInterval);
					pollInterval = null;
				}
				// Wait for any remaining in-flight persistence to complete
				if (persistPromise !== null) {
					await persistPromise;
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
