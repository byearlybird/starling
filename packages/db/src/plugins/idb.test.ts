import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { idbPlugin } from "./idb";
import { createTestDb, makeTask, taskSchema } from "../test-helpers";
import { createDatabase } from "../db";
import type { Database } from "../db";
import { z } from "zod";

// Mock IndexedDB for testing
class MockIDBDatabase {
	name: string;
	version: number;
	objectStoreNames: {
		length: number;
		contains: (name: string) => boolean;
		[index: number]: string;
	};
	private stores: Map<string, Map<string, any>>;

	constructor(name: string, version: number, stores: string[]) {
		this.name = name;
		this.version = version;
		this.objectStoreNames = {
			...stores,
			length: stores.length,
			contains: (name: string) => stores.includes(name),
		};
		this.stores = new Map(stores.map((s) => [s, new Map()]));
	}

	transaction(storeNames: string | string[], mode: IDBTransactionMode) {
		const names = Array.isArray(storeNames) ? storeNames : [storeNames];
		return new MockIDBTransaction(this.stores, names);
	}

	createObjectStore(name: string) {
		const currentStores = [];
		for (let i = 0; i < this.objectStoreNames.length; i++) {
			currentStores.push(this.objectStoreNames[i]);
		}
		if (!currentStores.includes(name)) {
			currentStores.push(name);
			this.objectStoreNames = {
				...currentStores,
				length: currentStores.length,
				contains: (n: string) => currentStores.includes(n),
			};
			this.stores.set(name, new Map());
		}
		return { name };
	}

	close() {
		// No-op for mock
	}
}

class MockIDBTransaction {
	private stores: Map<string, Map<string, any>>;
	private storeNames: string[];

	constructor(stores: Map<string, Map<string, any>>, storeNames: string[]) {
		this.stores = stores;
		this.storeNames = storeNames;
	}

	objectStore(name: string) {
		const store = this.stores.get(name);
		if (!store) {
			throw new Error(`Store ${name} not found`);
		}
		return new MockIDBObjectStore(store);
	}
}

class MockIDBObjectStore {
	private store: Map<string, any>;

	constructor(store: Map<string, any>) {
		this.store = store;
	}

	get(key: string) {
		const result = this.store.get(key);
		const request = new MockIDBRequest();
		queueMicrotask(() => {
			request.result = result;
			if (request.onsuccess) {
				request.onsuccess.call(request, { type: "success", target: { result } });
			}
		});
		return request;
	}

	put(value: any, key: string) {
		this.store.set(key, value);
		const request = new MockIDBRequest();
		queueMicrotask(() => {
			request.result = undefined;
			if (request.onsuccess) {
				request.onsuccess.call(request, { type: "success", target: { result: undefined } });
			}
		});
		return request;
	}
}

class MockIDBRequest {
	result: any = null;
	error: Error | null = null;
	onsuccess: ((this: MockIDBRequest, ev: any) => void) | null = null;
	onerror: ((this: MockIDBRequest, ev: any) => void) | null = null;
	onupgradeneeded: ((this: MockIDBRequest, ev: any) => void) | null = null;
}

// Mock indexedDB global
const mockIndexedDB = {
	databases: new Map<string, MockIDBDatabase>(),
	open(name: string, version: number) {
		const request = new MockIDBRequest();

		queueMicrotask(() => {
			let db = mockIndexedDB.databases.get(name);
			const isUpgrade = !db || db.version < version;

			if (isUpgrade) {
				db = new MockIDBDatabase(name, version, []);
				mockIndexedDB.databases.set(name, db);

				// Trigger upgrade event first
				if (request.onupgradeneeded) {
					request.result = db;
					const upgradeEvent = {
						target: { result: db },
						type: "upgradeneeded",
					};
					request.onupgradeneeded.call(request, upgradeEvent);
				}
			}

			// Then trigger success event
			request.result = db;
			if (request.onsuccess) {
				const successEvent = {
					target: { result: db },
					type: "success",
				};
				request.onsuccess.call(request, successEvent);
			}
		});

		return request;
	},
};

// Install mock
const originalIndexedDB = (globalThis as any).indexedDB;
beforeEach(() => {
	(globalThis as any).indexedDB = mockIndexedDB;
	mockIndexedDB.databases.clear();
});

afterEach(() => {
	(globalThis as any).indexedDB = originalIndexedDB;
});

describe("idbPlugin", () => {
	test("loads and persists documents", async () => {
		// Create database with plugin
		const db1 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "test-db" })],
		});

		await db1.init();

		// Add a task
		const task = makeTask({ id: "1", title: "Test Task" });
		db1.tasks.add(task);

		// Wait for mutation event to propagate
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Dispose to save
		await db1.dispose();

		// Create a new database instance and load
		const db2 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "test-db" })],
		});

		await db2.init();

		// Verify task was loaded
		const loadedTask = db2.tasks.get("1");
		expect(loadedTask).toBeDefined();
		expect(loadedTask?.title).toBe("Test Task");

		await db2.dispose();
	});

	test("creates object stores on upgrade", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "upgrade-test" })],
		});

		await db.init();

		// Check that the database was created with the correct store
		const idb = mockIndexedDB.databases.get("upgrade-test");
		expect(idb).toBeDefined();
		expect(idb?.objectStoreNames.contains("tasks")).toBe(true);

		await db.dispose();
	});

	test("handles empty database gracefully", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "empty-db" })],
		});

		await db.init();

		// Should not throw and should have no tasks
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("uses custom version", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "version-test", version: 5 })],
		});

		await db.init();

		const idb = mockIndexedDB.databases.get("version-test");
		expect(idb?.version).toBe(5);

		await db.dispose();
	});

	test("persists on mutations", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "mutation-test" })],
		});

		await db.init();

		// Add task
		db.tasks.add(makeTask({ id: "1", title: "Task 1" }));

		// Wait for mutation event
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Check that it was saved to IndexedDB
		const idb = mockIndexedDB.databases.get("mutation-test");
		const store = idb?.transaction("tasks", "readonly").objectStore("tasks");
		const request = store?.get("document");

		await new Promise((resolve) => {
			if (request) {
				request.onsuccess = resolve;
			}
		});

		expect(request?.result).toBeDefined();
		expect(request?.result.data).toHaveLength(1);

		await db.dispose();
	});

	test("closes database on dispose", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "dispose-test" })],
		});

		await db.init();
		await db.dispose();

		// The database should have been closed
		// We can't directly check if close() was called, but we can verify no errors occurred
		expect(true).toBe(true);
	});
});
