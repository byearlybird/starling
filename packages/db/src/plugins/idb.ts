import type { JsonDocument } from "@byearlybird/starling";
import type { Database, DatabasePlugin } from "../db";
import type { StandardSchemaV1 } from "../standard-schema";

type AnyObjectSchema<
	T extends Record<string, unknown> = Record<string, unknown>,
> = StandardSchemaV1<T>;

export type IdbPluginConfig = {
	/**
	 * Name of the IndexedDB database
	 */
	dbName: string;
	/**
	 * Version of the IndexedDB database
	 * @default 1
	 */
	version?: number;
	/**
	 * Use BroadcastChannel API for instant cross-tab sync
	 * @default true
	 */
	useBroadcastChannel?: boolean;
};

/**
 * Create an IndexedDB persistence plugin for Starling databases.
 *
 * The plugin:
 * - Loads existing documents from IndexedDB on init
 * - Persists all documents to IndexedDB on every mutation
 * - Enables instant cross-tab sync via BroadcastChannel API
 * - Gracefully closes the database connection on dispose
 *
 * Cross-tab sync uses the BroadcastChannel API to notify other tabs
 * of changes in real-time. When a mutation occurs in one tab, other tabs
 * are instantly notified and reload the data from IndexedDB.
 *
 * @param config - IndexedDB configuration
 * @returns A DatabasePlugin instance
 *
 * @example
 * ```typescript
 * const db = createDatabase({
 *   schema: {
 *     tasks: { schema: taskSchema, getId: (task) => task.id },
 *   },
 *   plugins: [idbPlugin({ dbName: 'my-app' })],
 * });
 *
 * await db.init();
 * ```
 *
 * @example Disable BroadcastChannel
 * ```typescript
 * plugins: [idbPlugin({
 *   dbName: 'my-app',
 *   useBroadcastChannel: false, // Disable cross-tab sync
 * })],
 * ```
 */
export function idbPlugin<Schemas extends Record<string, AnyObjectSchema>>(
	config: IdbPluginConfig,
): DatabasePlugin<Schemas> {
	const { dbName, version = 1, useBroadcastChannel = true } = config;
	let dbInstance: IDBDatabase | null = null;
	let unsubscribe: (() => void) | null = null;
	let broadcastChannel: BroadcastChannel | null = null;
	const instanceId = crypto.randomUUID();

	return {
		handlers: {
			async init(db: Database<Schemas>) {
				// Open IndexedDB connection
				dbInstance = await openDatabase(
					dbName,
					version,
					Object.keys(db) as (keyof Schemas)[],
				);

				// Load existing documents from IndexedDB
				const savedDocs = await loadDocuments<Schemas>(
					dbInstance,
					Object.keys(db) as (keyof Schemas)[],
				);

				// Merge loaded documents into each collection
				for (const collectionName of Object.keys(
					savedDocs,
				) as (keyof Schemas)[]) {
					const doc = savedDocs[collectionName];
					if (doc) {
						db[collectionName].merge(doc);
					}
				}

				// Subscribe to mutations and persist on change
				unsubscribe = db.on("mutation", async () => {
					if (dbInstance) {
						const docs = db.toDocuments();
						await saveDocuments(dbInstance, docs);

						// Broadcast changes to other tabs via BroadcastChannel
						if (broadcastChannel) {
							broadcastChannel.postMessage({
								type: "mutation",
								instanceId,
								timestamp: Date.now(),
							});
						}
					}
				});

				// Set up BroadcastChannel for instant cross-tab sync
				if (useBroadcastChannel && typeof BroadcastChannel !== "undefined") {
					broadcastChannel = new BroadcastChannel(`starling:${dbName}`);

					// Listen for changes from other tabs
					broadcastChannel.onmessage = async (event) => {
						// Ignore our own broadcasts
						if (event.data.instanceId === instanceId) {
							return;
						}

						if (event.data.type === "mutation" && dbInstance) {
							// Another tab made changes - reload and merge
							const savedDocs = await loadDocuments<Schemas>(
								dbInstance,
								Object.keys(db) as (keyof Schemas)[],
							);

							for (const collectionName of Object.keys(
								savedDocs,
							) as (keyof Schemas)[]) {
								const doc = savedDocs[collectionName];
								if (doc) {
									db[collectionName].merge(doc);
								}
							}
						}
					};
				}
			},

			async dispose(db: Database<Schemas>) {
				// Close BroadcastChannel
				if (broadcastChannel) {
					broadcastChannel.close();
					broadcastChannel = null;
				}

				// Unsubscribe from mutation events
				if (unsubscribe) {
					unsubscribe();
					unsubscribe = null;
				}

				// Save final state
				if (dbInstance) {
					const docs = db.toDocuments();
					await saveDocuments(dbInstance, docs);

					// Close the database connection
					dbInstance.close();
					dbInstance = null;
				}
			},
		},
	};
}

/**
 * Open an IndexedDB database and create object stores for each collection
 */
function openDatabase<Schemas extends Record<string, AnyObjectSchema>>(
	dbName: string,
	version: number,
	collectionNames: (keyof Schemas)[],
): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(dbName, version);

		request.onerror = () => {
			reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onupgradeneeded = (event) => {
			const db = (event.target as IDBOpenDBRequest).result;

			// Create object stores for each collection if they don't exist
			for (const collectionName of collectionNames) {
				const storeName = String(collectionName);
				if (!db.objectStoreNames.contains(storeName)) {
					db.createObjectStore(storeName);
				}
			}
		};
	});
}

/**
 * Load documents from IndexedDB for all collections
 */
async function loadDocuments<Schemas extends Record<string, AnyObjectSchema>>(
	db: IDBDatabase,
	collectionNames: (keyof Schemas)[],
): Promise<{
	[K in keyof Schemas]?: JsonDocument<StandardSchemaV1.InferOutput<Schemas[K]>>;
}> {
	const documents = {} as {
		[K in keyof Schemas]?: JsonDocument<
			StandardSchemaV1.InferOutput<Schemas[K]>
		>;
	};

	for (const collectionName of collectionNames) {
		const storeName = String(collectionName);
		if (db.objectStoreNames.contains(storeName)) {
			const doc = await getFromStore<
				JsonDocument<
					StandardSchemaV1.InferOutput<Schemas[typeof collectionName]>
				>
			>(db, storeName, "document");
			if (doc) {
				documents[collectionName] = doc;
			}
		}
	}

	return documents;
}

/**
 * Save documents to IndexedDB for all collections
 */
async function saveDocuments<Schemas extends Record<string, AnyObjectSchema>>(
	db: IDBDatabase,
	documents: {
		[K in keyof Schemas]: JsonDocument<
			StandardSchemaV1.InferOutput<Schemas[K]>
		>;
	},
): Promise<void> {
	const promises: Promise<void>[] = [];

	for (const collectionName of Object.keys(documents) as (keyof Schemas)[]) {
		const storeName = String(collectionName);
		if (db.objectStoreNames.contains(storeName)) {
			promises.push(
				putToStore(db, storeName, "document", documents[collectionName]),
			);
		}
	}

	await Promise.all(promises);
}

/**
 * Get a value from an IndexedDB object store
 */
function getFromStore<T>(
	db: IDBDatabase,
	storeName: string,
	key: string,
): Promise<T | null> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, "readonly");
		const store = transaction.objectStore(storeName);
		const request = store.get(key);

		request.onerror = () => {
			reject(
				new Error(
					`Failed to get from store ${storeName}: ${request.error?.message}`,
				),
			);
		};

		request.onsuccess = () => {
			resolve(request.result ?? null);
		};
	});
}

/**
 * Put a value into an IndexedDB object store
 */
function putToStore<T>(
	db: IDBDatabase,
	storeName: string,
	key: string,
	value: T,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(storeName, "readwrite");
		const store = transaction.objectStore(storeName);
		const request = store.put(value, key);

		request.onerror = () => {
			reject(
				new Error(
					`Failed to put to store ${storeName}: ${request.error?.message}`,
				),
			);
		};

		request.onsuccess = () => {
			resolve();
		};
	});
}
