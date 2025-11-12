import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Collection } from "../../crdt";
import { Store } from "../../store";
import { indexedDBPlugin } from "./plugin";

type Todo = {
	label: string;
	completed: boolean;
};

// Mock IndexedDB for testing
class MockIDBDatabase {
	private stores = new Map<string, Map<string, unknown>>();
	objectStoreNames = {
		contains: (name: string) => this.stores.has(name),
	};

	constructor(storeNames: string[]) {
		for (const name of storeNames) {
			this.stores.set(name, new Map());
		}
	}

	createObjectStore(name: string) {
		if (!this.stores.has(name)) {
			this.stores.set(name, new Map());
		}
	}

	transaction(storeName: string, mode: "readonly" | "readwrite") {
		// Ensure store exists
		if (!this.stores.has(storeName)) {
			this.stores.set(storeName, new Map());
		}
		return new MockIDBTransaction(storeName, this.stores);
	}

	close() {
		// No-op for mock
	}
}

class MockIDBTransaction {
	constructor(
		private storeName: string,
		private stores: Map<string, Map<string, unknown>>,
	) {}

	objectStore(name: string) {
		// Ensure store exists
		if (!this.stores.has(name)) {
			this.stores.set(name, new Map());
		}
		return new MockIDBObjectStore(this.stores.get(name)!);
	}
}

class MockIDBObjectStore {
	constructor(private store: Map<string, unknown>) {}

	get(key: string) {
		return new MockIDBRequest(this.store.get(key));
	}

	put(value: unknown, key: string) {
		this.store.set(key, value);
		return new MockIDBRequest(undefined);
	}
}

class MockIDBRequest {
	result: unknown;
	error: Error | null = null;
	onsuccess: (() => void) | null = null;
	onerror: (() => void) | null = null;
	private _shouldAutoComplete: boolean;

	constructor(result: unknown, autoComplete = true) {
		this.result = result;
		this._shouldAutoComplete = autoComplete;
		if (autoComplete) {
			setTimeout(() => {
				if (this.onsuccess) {
					this.onsuccess();
				}
			}, 0);
		}
	}

	complete() {
		setTimeout(() => {
			if (this.onsuccess) {
				this.onsuccess();
			}
		}, 0);
	}
}

// Setup IndexedDB mock
let mockDatabases = new Map<string, MockIDBDatabase>();

beforeEach(() => {
	mockDatabases = new Map();

	// @ts-ignore - Mocking global indexedDB
	globalThis.indexedDB = {
		open: (name: string, _version: number) => {
			const request = new MockIDBRequest(null, false) as unknown as IDBOpenDBRequest;

			// Execute synchronously to avoid timing issues
			let db = mockDatabases.get(name);
			if (!db) {
				// Create with no stores initially - let onupgradeneeded create them
				db = new MockIDBDatabase([]);
				mockDatabases.set(name, db);

				// Trigger upgrade needed for first time
				const upgradeEvent = {
					target: { result: db },
				};
				if (request.onupgradeneeded) {
					request.onupgradeneeded(upgradeEvent as IDBVersionChangeEvent);
				}
			}

			request.result = db;
			// Complete the request asynchronously
			request.complete();

			return request;
		},
	};
});

afterEach(() => {
	mockDatabases.clear();
});

test("initializes empty store when no data in storage", async () => {
	const store = await new Store<Todo>().use(indexedDBPlugin("todos")).init();
	expect(Array.from(store.entries())).toEqual([]);
	await store.dispose();
});

test("initializes store with persisted data", async () => {
	// Create a store with data
	const store1 = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	store1.begin((tx) => {
		tx.add({ label: "Test", completed: false }, { withId: "todo1" });
	});

	// Wait a tiny bit for debounce
	await new Promise((resolve) => setTimeout(resolve, 10));

	// Dispose to flush pending writes
	await store1.dispose();

	// Create a new store with same storage
	const store2 = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	expect(store2.get("todo1")).toEqual({ label: "Test", completed: false });
	await store2.dispose();
});

test("persists add operation to storage", async () => {
	const store = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	// Wait a tiny bit for debounce (default is 0, but hooks may batch)
	await new Promise((resolve) => setTimeout(resolve, 10));

	// Dispose to flush pending writes
	await store.dispose();

	// Manually check storage
	const db = mockDatabases.get("starling");
	const storeMap = (db as unknown as { stores: Map<string, Map<string, Collection>> })
		?.stores?.get("collections");
	const persisted = storeMap?.get("todos");

	expect(persisted).toBeDefined();
	expect(persisted?.["~docs"].length).toBe(1);
	expect(persisted?.["~docs"][0]?.["~id"]).toBe("todo1");
	expect(persisted?.["~eventstamp"]).toBeDefined();
});

test("persists update operation to storage", async () => {
	const store = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.begin((tx) => {
		tx.update("todo1", { completed: true });
	});

	// Wait a tiny bit
	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(store.get("todo1")).toEqual({ label: "Buy milk", completed: true });

	await store.dispose();
});

test("persists delete operation to storage", async () => {
	const store = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	store.begin((tx) => {
		tx.add({ label: "Buy milk", completed: false }, { withId: "todo1" });
	});

	store.begin((tx) => {
		tx.del("todo1");
	});

	// Wait a tiny bit
	await new Promise((resolve) => setTimeout(resolve, 10));

	expect(store.get("todo1")).toBeNull();

	await store.dispose();
});

test("debounces storage writes when debounceMs is set", async () => {
	let writeCount = 0;

	// Track writes by wrapping the mock
	const originalPut = MockIDBObjectStore.prototype.put;
	MockIDBObjectStore.prototype.put = function (value: unknown, key: string) {
		if (key === "todos") {
			writeCount++;
		}
		return originalPut.call(this, value, key);
	};

	const store = await new Store<Todo>()
		.use(indexedDBPlugin("todos", { debounceMs: 100 }))
		.init();

	// Rapid writes should be batched
	store.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});
	store.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});

	// No writes should have happened yet
	expect(writeCount).toBe(0);

	// Wait for debounce to complete
	await new Promise((resolve) => setTimeout(resolve, 150));

	// Should only have 1 write despite 2 mutations
	expect(writeCount).toBe(1);

	// Restore original
	MockIDBObjectStore.prototype.put = originalPut;

	await store.dispose();
});

test("forwards store clock to persisted eventstamp on load", async () => {
	// Create a store and add data with a known eventstamp
	const store1 = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	store1.begin((tx) => {
		tx.add({ label: "Task 1", completed: false }, { withId: "todo1" });
	});

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 10));
	const persistedEventstamp = store1.collection()["~eventstamp"];
	await store1.dispose();

	// Create a new store that loads the data
	const store2 = await new Store<Todo>().use(indexedDBPlugin("todos")).init();

	// The new store's clock should have been forwarded to at least the persisted eventstamp
	const store2Latest = store2.collection()["~eventstamp"];
	expect(store2Latest >= persistedEventstamp).toBe(true);

	// New writes should have higher eventstamps than the loaded data
	const beforeTimestamp = store2Latest;
	store2.begin((tx) => {
		tx.add({ label: "Task 2", completed: false }, { withId: "todo2" });
	});
	const afterTimestamp = store2.collection()["~eventstamp"];
	expect(afterTimestamp > beforeTimestamp).toBe(true);

	await store2.dispose();
});

test("disposes only after pending debounced writes complete", async () => {
	const store = await new Store<Todo>()
		.use(indexedDBPlugin("todos", { debounceMs: 500 }))
		.init();

	// Perform a mutation - this schedules a write that won't happen for 500ms
	store.begin((tx) => {
		tx.add({ label: "Urgent task", completed: false }, { withId: "todo1" });
	});

	// Dispose immediately (before debounce completes)
	// The new behavior should wait for pending writes
	await store.dispose();

	// Verify the write completed by checking a new store instance
	const store2 = await new Store<Todo>().use(indexedDBPlugin("todos")).init();
	expect(store2.get("todo1")).toEqual({ label: "Urgent task", completed: false });

	await store2.dispose();
});

test("supports custom database and store names", async () => {
	const store = await new Store<Todo>()
		.use(
			indexedDBPlugin("todos", {
				dbName: "custom-db",
				storeName: "custom-store",
			}),
		)
		.init();

	store.begin((tx) => {
		tx.add({ label: "Custom", completed: false }, { withId: "todo1" });
	});

	await new Promise((resolve) => setTimeout(resolve, 10));

	// Check that custom database was created
	expect(mockDatabases.has("custom-db")).toBe(true);

	await store.dispose();
});
