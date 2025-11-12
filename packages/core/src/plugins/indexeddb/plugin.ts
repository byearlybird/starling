import type { Collection } from "../../crdt";
import type { Plugin, Store } from "../../store";

type MaybePromise<T> = T | Promise<T>;

type IndexedDBOnBeforeSet = (data: Collection) => MaybePromise<Collection>;

type IndexedDBOnAfterGet = (data: Collection) => MaybePromise<Collection>;

/**
 * Configuration options for the IndexedDB persistence plugin.
 */
type IndexedDBConfig = {
	/** Delay in ms to collapse rapid mutations into a single write. Default: 0 (immediate) */
	debounceMs?: number;
	/** Interval in ms to poll storage for external changes. When set, enables automatic sync. */
	pollIntervalMs?: number;
	/** Hook invoked before persisting to storage. Use for encryption, compression, etc. */
	onBeforeSet?: IndexedDBOnBeforeSet;
	/** Hook invoked after loading from storage. Use for decryption, validation, etc. */
	onAfterGet?: IndexedDBOnAfterGet;
	/** Function that returns true to skip persistence operations. Use for conditional sync. */
	skip?: () => boolean;
	/** IndexedDB database name. Default: "starling" */
	dbName?: string;
	/** IndexedDB database version. Default: 1 */
	dbVersion?: number;
	/** IndexedDB object store name. Default: "collections" */
	storeName?: string;
};

/**
 * Helper class to manage IndexedDB operations for a Starling store.
 */
class IndexedDBStorage {
	private db: IDBDatabase | null = null;
	private readonly dbName: string;
	private readonly dbVersion: number;
	private readonly storeName: string;

	constructor(
		dbName = "starling",
		dbVersion = 1,
		storeName = "collections",
	) {
		this.dbName = dbName;
		this.dbVersion = dbVersion;
		this.storeName = storeName;
	}

	/**
	 * Opens the IndexedDB database and creates the object store if needed.
	 */
	async open(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);

			request.onerror = () => {
				reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
			};

			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName);
				}
			};
		});
	}

	/**
	 * Gets a value from IndexedDB.
	 */
	async get(key: string): Promise<Collection | null> {
		if (!this.db) {
			throw new Error("Database not opened");
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction(this.storeName, "readonly");
			const store = transaction.objectStore(this.storeName);
			const request = store.get(key);

			request.onerror = () => {
				reject(new Error(`Failed to get from IndexedDB: ${request.error?.message}`));
			};

			request.onsuccess = () => {
				resolve(request.result ?? null);
			};
		});
	}

	/**
	 * Sets a value in IndexedDB.
	 */
	async set(key: string, value: Collection): Promise<void> {
		if (!this.db) {
			throw new Error("Database not opened");
		}

		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction(this.storeName, "readwrite");
			const store = transaction.objectStore(this.storeName);
			const request = store.put(value, key);

			request.onerror = () => {
				reject(new Error(`Failed to set in IndexedDB: ${request.error?.message}`));
			};

			request.onsuccess = () => {
				resolve();
			};
		});
	}

	/**
	 * Closes the IndexedDB connection.
	 */
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}

/**
 * Persistence plugin for Starling using IndexedDB.
 *
 * Automatically persists store snapshots and optionally polls for external changes.
 *
 * @param key - Storage key for this dataset
 * @param config - Optional configuration for debouncing, polling, hooks, and conditional sync
 * @returns Plugin instance for store.use()
 *
 * @example
 * ```ts
 * import { indexedDBPlugin } from "@byearlybird/starling/plugin-indexeddb";
 *
 * const store = await new Store<Todo>()
 *   .use(indexedDBPlugin('todos', {
 *     debounceMs: 300,
 *     pollIntervalMs: 5000,
 *     skip: () => !navigator.onLine
 *   }))
 *   .init();
 * ```
 *
 * @see {@link ../../../../docs/plugins/indexeddb.md} for detailed configuration guide
 */
function indexedDBPlugin<T>(
	key: string,
	config: IndexedDBConfig = {},
): Plugin<T> {
	const {
		debounceMs = 0,
		pollIntervalMs,
		onBeforeSet,
		onAfterGet,
		skip,
		dbName = "starling",
		dbVersion = 1,
		storeName = "collections",
	} = config;

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let store: Store<T> | null = null;
	let persistPromise: Promise<void> | null = null;
	const storage = new IndexedDBStorage(dbName, dbVersion, storeName);

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

		const persisted = await storage.get(key);

		if (!persisted) return;

		const data =
			onAfterGet !== undefined ? await onAfterGet(persisted) : persisted;

		store.merge(data);
	};

	return {
		onInit: async (s) => {
			store = s;

			// Open the IndexedDB connection
			await storage.open();

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
			// Close the IndexedDB connection
			storage.close();
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
	};
}

export { indexedDBPlugin };
export type { IndexedDBConfig };
