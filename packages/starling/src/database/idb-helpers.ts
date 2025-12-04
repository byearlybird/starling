/**
 * Helper utilities for IndexedDB operations
 */

/**
 * Open an IndexedDB database and create object stores for collections.
 * Each collection gets its own object store with 'id' as the keyPath.
 */
export async function openIndexedDB(
	dbName: string,
	version: number,
	collectionNames: string[],
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(dbName, version);

		request.onerror = () => {
			reject(
				new Error(`Failed to open IndexedDB: ${request.error?.message}`),
			);
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object store for each collection
			for (const collectionName of collectionNames) {
				if (!db.objectStoreNames.contains(collectionName)) {
					db.createObjectStore(collectionName, { keyPath: "id" });
				}
			}

			// Create meta store for clock state
			if (!db.objectStoreNames.contains("_meta")) {
				db.createObjectStore("_meta");
			}
		};
	});
}

/**
 * Load clock state from IndexedDB meta store
 */
export async function loadClock(idb: IDBDatabase): Promise<string | null> {
	return new Promise((resolve, reject) => {
		if (!idb.objectStoreNames.contains("_meta")) {
			resolve(null);
			return;
		}

		const txn = idb.transaction(["_meta"], "readonly");
		const store = txn.objectStore("_meta");
		const request = store.get("clock");

		request.onsuccess = () => {
			const result = request.result;
			resolve(result?.latest ?? null);
		};

		request.onerror = () => {
			reject(new Error(`Failed to load clock: ${request.error?.message}`));
		};
	});
}

/**
 * Save clock state to IndexedDB meta store
 */
export async function saveClock(
	idb: IDBDatabase,
	eventstamp: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const txn = idb.transaction(["_meta"], "readwrite");
		const store = txn.objectStore("_meta");
		const request = store.put({ latest: eventstamp }, "clock");

		request.onsuccess = () => resolve();
		request.onerror = () => {
			reject(new Error(`Failed to save clock: ${request.error?.message}`));
		};
	});
}
