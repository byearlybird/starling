import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as Store from "./store";

type TestUser = {
	name: string;
	email?: string;
	age?: number;
	profile?: {
		bio?: string;
		avatar?: string;
	};
};

describe("Store - Put Operations", () => {
	test("should insert item with auto-generated ID", () => {
		const store = Store.create<TestUser>();

		const insertedId = store.set((tx) => tx.put({ name: "Alice" }));

		expect(insertedId).toBeDefined();
		expect(typeof insertedId).toBe("string");
		expect(store.get(insertedId)).toEqual({ name: "Alice" });
	});

	test("should insert item with custom ID using withId option", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Bob" }, { withId: "user-1" });
		});

		expect(store.get("user-1")).toEqual({ name: "Bob" });
	});

	test("should return the ID after putting an item", () => {
		const store = Store.create<TestUser>();

		const [autoId, customId] = store.set((tx) => [
			tx.put({ name: "Charlie" }),
			tx.put({ name: "Bob" }, { withId: "user-2" }),
		]);

		expect(autoId).toBeDefined();
		expect(customId).toBe("user-2");
	});

	test("should overwrite item when putting with same ID", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put(
				{ name: "Original", email: "old@example.com" },
				{ withId: "user-1" },
			);
		});

		store.set((tx) => {
			tx.put(
				{ name: "Updated", email: "new@example.com" },
				{ withId: "user-1" },
			);
		});

		const user = store.get("user-1");
		expect(user).toEqual({ name: "Updated", email: "new@example.com" });
	});
});

describe("Store - Get/Has Operations", () => {
	let store: Store.StarlingStore<TestUser>;

	beforeEach(() => {
		store = Store.create<TestUser>();
		store.set((tx) => {
			tx.put(
				{ name: "Alice", email: "alice@example.com" },
				{ withId: "user-1" },
			);
			tx.put({ name: "Bob" }, { withId: "user-2" });
		});
	});

	test("should retrieve item by ID", () => {
		expect(store.get("user-1")).toEqual({
			name: "Alice",
			email: "alice@example.com",
		});
		expect(store.get("user-2")).toEqual({ name: "Bob" });
	});

	test("should return null for non-existent ID", () => {
		expect(store.get("non-existent")).toBeNull();
	});

	test("should return null/false for deleted items", () => {
		store.set((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBeNull();
	});
});

describe("Store - Patch Operations", () => {
	let store: Store.StarlingStore<TestUser>;

	beforeEach(() => {
		store = Store.create<TestUser>();
		store.set((tx) => {
			tx.put(
				{
					name: "Alice",
					email: "alice@example.com",
					age: 30,
					profile: { bio: "Software developer", avatar: "avatar1.png" },
				},
				{ withId: "user-1" },
			);
		});
	});

	test("should update item with partial data", () => {
		store.set((tx) => {
			tx.put(
				{
					name: "Alice",
					email: "alice@example.com",
					profile: { bio: "Software developer", avatar: "avatar1.png" },
				},
				{ withId: "user-1" },
			);
		});

		store.set((tx) => {
			tx.patch("user-1", { age: 31 });
		});

		const user = store.get("user-1");
		expect(user?.age).toBe(31);
		expect(user?.name).toBe("Alice");
	});

	test("should merge nested objects correctly", () => {
		store.set((tx) => {
			tx.patch("user-1", { profile: { bio: "Senior developer" } });
		});

		const user = store.get("user-1");
		expect(user?.profile?.bio).toBe("Senior developer");
		expect(user?.profile?.avatar).toBe("avatar1.png");
	});

	test("should preserve unchanged fields when patching", () => {
		store.set((tx) => {
			tx.patch("user-1", { email: "newemail@example.com" });
		});

		const user = store.get("user-1");
		expect(user).toEqual({
			name: "Alice",
			email: "newemail@example.com",
			age: 30,
			profile: { bio: "Software developer", avatar: "avatar1.png" },
		});
	});
});

describe("Store - Delete Operations", () => {
	let store: Store.StarlingStore<TestUser>;

	beforeEach(() => {
		store = Store.create<TestUser>();
		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
		});
	});

	test("should soft-delete an item", () => {
		store.set((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBe(null);
	});

	test("should not return deleted items via get()", () => {
		store.set((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBeNull();
	});
});

describe("Store - Iteration & State", () => {
	let store: Store.StarlingStore<TestUser>;

	beforeEach(() => {
		store = Store.create<TestUser>();
		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
			tx.put({ name: "Charlie" }, { withId: "user-3" });
		});
	});

	test("should iterate over all active entries with keys", () => {
		const entries = Array.from(store.entries());
		expect(entries.length).toBe(3);

		const entriesMap = new Map(entries);
		expect(entriesMap.get("user-1")).toEqual({ name: "Alice" });
		expect(entriesMap.get("user-2")).toEqual({ name: "Bob" });
		expect(entriesMap.get("user-3")).toEqual({ name: "Charlie" });
	});

	test("should include deleted items in snapshot()", () => {
		store.set((tx) => {
			tx.del("user-1");
		});

		const snapshot = store.snapshot();
		expect(snapshot.length).toBe(3);

		const deletedDoc = snapshot.find((doc) => doc["~id"] === "user-1");
		expect(deletedDoc).toBeDefined();
		expect(deletedDoc?.["~deletedAt"]).toBeDefined();
	});
});

describe("Store - Transaction Behavior - Commit/Rollback", () => {
	test("should auto-commit transaction when callback completes", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
		});

		expect(store.get("user-1")).toEqual({ name: "Alice" });
	});

	test("should apply multiple operations atomically", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
			tx.patch("user-1", { email: "alice@example.com" });
		});

		expect(store.get("user-1")).toEqual({
			name: "Alice",
			email: "alice@example.com",
		});
		expect(store.get("user-2")).toEqual({ name: "Bob" });
	});

	test("should rollback all changes when tx.rollback() is called", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
		});

		store.set((tx) => {
			tx.put({ name: "Bob" }, { withId: "user-2" });
			tx.del("user-1");
			tx.rollback();
		});

		expect(store.get("user-1")).not.toBe(null);
		expect(store.get("user-2")).toBe(null);
	});

	test("should rollback on error and re-throw", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
		});

		expect(() => {
			store.set((tx) => {
				tx.put({ name: "Bob" }, { withId: "user-2" });
				tx.del("user-1");
				throw new Error("Transaction failed");
			});
		}).toThrow("Transaction failed");

		expect(store.get("user-1")).not.toBe(null);
		expect(store.get("user-2")).toBe(null);
	});

	test("should not commit after rollback", () => {
		const store = Store.create<TestUser>();

		const result = store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.rollback();
			return "completed";
		});

		expect(result).toBe("completed");
		expect(store.get("user-1")).toBe(null);
	});
});

describe("Store - Transaction Behavior - Transaction Isolation", () => {
	test("should stage changes visible within transaction", () => {
		const store = Store.create<TestUser>();

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			expect(tx.get("user-1")).not.toBe(null);
		});
	});

	test("should not apply changes until commit", () => {
		const store = Store.create<TestUser>();
		let hasUserDuringTx = false;

		try {
			store.set((tx) => {
				tx.put({ name: "Alice" }, { withId: "user-1" });
				hasUserDuringTx = store.get("user-1") !== null; // Check from outside tx
				throw new Error("Cancel transaction");
			});
		} catch {
			// Expected error
		}

		expect(hasUserDuringTx).toBe(false);
		expect(store.get("user-1")).toBe(null);
	});
});

describe("Store - Plugin System - Hook Registration", () => {
	test("should call onPut hooks with batched entries", () => {
		const store = Store.create<TestUser>();
		const onPutMock = mock(
			(entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			init: () => {},
			dispose: () => {},
			hooks: { onPut: onPutMock },
		});

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
		});

		expect(onPutMock).toHaveBeenCalledTimes(1);
		const calls = onPutMock.mock.calls[0];
		const entries = calls?.[0];
		expect(entries?.length).toBe(2);

		const entriesMap = new Map(entries);
		expect(entriesMap.get("user-1")).toEqual({ name: "Alice" });
		expect(entriesMap.get("user-2")).toEqual({ name: "Bob" });
	});

	test("should call onPatch hooks with merged values", () => {
		const store = Store.create<TestUser>();
		const onPatchMock = mock(
			(entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			init: () => {},
			dispose: () => {},
			hooks: { onPatch: onPatchMock },
		});

		store.set((tx) => {
			tx.put(
				{ name: "Alice", email: "alice@example.com" },
				{ withId: "user-1" },
			);
		});

		store.set((tx) => {
			tx.patch("user-1", { age: 30 });
		});

		expect(onPatchMock).toHaveBeenCalledTimes(1);
		const entries = onPatchMock.mock.calls[0]?.[0];
		expect(entries?.length).toBe(1);
		expect(entries?.[0]?.[0]).toBe("user-1");
		expect(entries?.[0]?.[1]).toEqual({
			name: "Alice",
			email: "alice@example.com",
			age: 30,
		});
	});

	test("should call onDelete hooks with deleted keys", () => {
		const store = Store.create<TestUser>();
		const onDeleteMock = mock((keys: ReadonlyArray<string>) => {});

		store.use({
			init: () => {},
			dispose: () => {},
			hooks: { onDelete: onDeleteMock },
		});

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
		});

		store.set((tx) => {
			tx.del("user-1");
			tx.del("user-2");
		});

		expect(onDeleteMock).toHaveBeenCalledTimes(1);
		const keys = onDeleteMock.mock.calls[0]?.[0];
		expect(keys?.length).toBe(2);
		expect(keys).toContain("user-1");
		expect(keys).toContain("user-2");
	});

	test("should batch multiple operations in single hook call", () => {
		const store = Store.create<TestUser>();
		const onPutMock = mock(
			(entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);
		const onPatchMock = mock(
			(entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);
		const onDeleteMock = mock((keys: ReadonlyArray<string>) => {});

		store.use({
			init: () => {},
			dispose: () => {},
			hooks: {
				onPut: onPutMock,
				onPatch: onPatchMock,
				onDelete: onDeleteMock,
			},
		});

		store.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
			tx.put({ name: "Charlie" }, { withId: "user-3" });
		});

		expect(onPutMock).toHaveBeenCalledTimes(1);
		expect(onPutMock.mock.calls[0]?.[0].length).toBe(3);
	});

	test("should not fire hooks when silent: true", () => {
		const store = Store.create<TestUser>();
		const onPutMock = mock(
			(entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			init: () => {},
			dispose: () => {},
			hooks: { onPut: onPutMock },
		});

		store.set(
			(tx) => {
				tx.put({ name: "Alice" }, { withId: "user-1" });
			},
			{ silent: true },
		);

		expect(onPutMock).not.toHaveBeenCalled();
	});
});

describe("Store - Plugin System - Plugin Methods", () => {
	test("should inject plugin methods into store", () => {
		const store = Store.create<TestUser>();

		type CustomMethods = {
			customMethod: () => string;
		};

		const extendedStore = store.use<CustomMethods>({
			init: () => {},
			dispose: () => {},
			methods: {
				customMethod: () => "custom result",
			},
		});

		expect(extendedStore.customMethod()).toBe("custom result");
	});

	test("should make plugin methods accessible via store", () => {
		const store = Store.create<TestUser>();

		type CountMethods = {
			getActiveCount: () => number;
		};

		const extendedStore = store.use<CountMethods>({
			init: () => {},
			dispose: () => {},
			methods: {
				getActiveCount: function (this: Store.StarlingStore<TestUser>) {
					return Array.from(this.entries()).length;
				},
			},
		});

		extendedStore.set((tx) => {
			tx.put({ name: "Alice" }, { withId: "user-1" });
			tx.put({ name: "Bob" }, { withId: "user-2" });
		});

		expect(extendedStore.getActiveCount()).toBe(2);
	});
});

describe("Store - Plugin System - Lifecycle", () => {
	test("should call plugin init() during store.init()", async () => {
		const store = Store.create<TestUser>();
		const initMock = mock((s: Store.StarlingStore<TestUser>) => {});

		store.use({
			init: initMock,
			dispose: () => {},
		});

		await store.init();

		expect(initMock).toHaveBeenCalledTimes(1);
		expect(initMock.mock.calls[0]?.[0]).toBe(store);
	});

	test("should call multiple plugin inits in registration order", async () => {
		const store = Store.create<TestUser>();
		const callOrder: number[] = [];

		store.use({
			init: () => {
				callOrder.push(1);
			},
			dispose: () => {},
		});

		store.use({
			init: () => {
				callOrder.push(2);
			},
			dispose: () => {},
		});

		store.use({
			init: () => {
				callOrder.push(3);
			},
			dispose: () => {},
		});

		await store.init();

		expect(callOrder).toEqual([1, 2, 3]);
	});

	test("should call plugin dispose() during store.dispose()", async () => {
		const store = Store.create<TestUser>();
		const disposeMock = mock(() => {});

		store.use({
			init: () => {},
			dispose: disposeMock,
		});

		await store.init();
		await store.dispose();

		expect(disposeMock).toHaveBeenCalledTimes(1);
	});

	test("should call multiple plugin disposes in reverse order", async () => {
		const store = Store.create<TestUser>();
		const callOrder: number[] = [];

		store.use({
			init: () => {},
			dispose: () => {
				callOrder.push(1);
			},
		});

		store.use({
			init: () => {},
			dispose: () => {
				callOrder.push(2);
			},
		});

		store.use({
			init: () => {},
			dispose: () => {
				callOrder.push(3);
			},
		});

		await store.init();
		await store.dispose();

		expect(callOrder).toEqual([3, 2, 1]);
	});
});
