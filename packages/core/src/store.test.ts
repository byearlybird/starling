import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Store } from "./store";

type TestUser = {
	name: string;
	email?: string;
	age?: number;
	profile?: {
		bio?: string;
		avatar?: string;
	};
};

describe("Store - Convenience Methods", () => {
	test("add should persist values and return provided id", () => {
		const store = new Store<TestUser>();

		const id = store.add({ name: "Alice" }, { withId: "user-add-1" });

		expect(id).toBe("user-add-1");
		expect(store.get("user-add-1")).toEqual({ name: "Alice" });
	});

	test("update should apply partial changes via convenience method", () => {
		const store = new Store<TestUser>();

		const id = store.add(
			{ name: "Bob", email: "bob@example.com" },
			{ withId: "user-update-1" },
		);
		store.update(id, { email: "newbob@example.com" });

		expect(store.get("user-update-1")).toEqual({
			name: "Bob",
			email: "newbob@example.com",
		});
	});

	test("del should remove records when using convenience method", () => {
		const store = new Store<TestUser>();

		const id = store.add({ name: "Charlie" }, { withId: "user-del-1" });
		store.del(id);

		expect(store.get("user-del-1")).toBeNull();
	});
});

describe("Store - Put Operations", () => {
	test("should insert item with auto-generated ID", () => {
		const store = new Store<TestUser>();

		const insertedId = store.begin((tx) => tx.add({ name: "Alice" }));

		expect(insertedId).toBeDefined();
		expect(typeof insertedId).toBe("string");
		expect(store.get(insertedId)).toEqual({ name: "Alice" });
	});

	test("should insert item with custom ID using withId option", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Bob" }, { withId: "user-1" });
		});

		expect(store.get("user-1")).toEqual({ name: "Bob" });
	});

	test("should return the ID after putting an item", () => {
		const store = new Store<TestUser>();

		const [autoId, customId] = store.begin((tx) => [
			tx.add({ name: "Charlie" }),
			tx.add({ name: "Bob" }, { withId: "user-2" }),
		]);

		expect(autoId).toBeDefined();
		expect(customId).toBe("user-2");
	});

	test("should apply LWW merge when adding with same ID (newer eventstamp wins)", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add(
				{ name: "Original", email: "old@example.com" },
				{ withId: "user-1" },
			);
		});

		store.begin((tx) => {
			tx.add(
				{ name: "Updated", email: "new@example.com" },
				{ withId: "user-1" },
			);
		});

		const user = store.get("user-1");
		expect(user).toEqual({ name: "Updated", email: "new@example.com" });
	});
});

describe("Store - Get/Has Operations", () => {
	let store: Store<TestUser>;

	beforeEach(() => {
		store = new Store<TestUser>();
		store.begin((tx) => {
			tx.add(
				{ name: "Alice", email: "alice@example.com" },
				{ withId: "user-1" },
			);
			tx.add({ name: "Bob" }, { withId: "user-2" });
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
		store.begin((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBeNull();
	});
});

describe("Store - Patch Operations", () => {
	let store: Store<TestUser>;

	beforeEach(() => {
		store = new Store<TestUser>();
		store.begin((tx) => {
			tx.add(
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
		store.begin((tx) => {
			tx.add(
				{
					name: "Alice",
					email: "alice@example.com",
					profile: { bio: "Software developer", avatar: "avatar1.png" },
				},
				{ withId: "user-1" },
			);
		});

		store.begin((tx) => {
			tx.update("user-1", { age: 31 });
		});

		const user = store.get("user-1");
		expect(user?.age).toBe(31);
		expect(user?.name).toBe("Alice");
	});

	test("should merge nested objects correctly", () => {
		store.begin((tx) => {
			tx.update("user-1", { profile: { bio: "Senior developer" } });
		});

		const user = store.get("user-1");
		expect(user?.profile?.bio).toBe("Senior developer");
		expect(user?.profile?.avatar).toBe("avatar1.png");
	});

	test("should preserve unchanged fields when patching", () => {
		store.begin((tx) => {
			tx.update("user-1", { email: "newemail@example.com" });
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
	let store: Store<TestUser>;

	beforeEach(() => {
		store = new Store<TestUser>();
		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
		});
	});

	test("should soft-delete an item", () => {
		store.begin((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBe(null);
	});

	test("should not return deleted items via get()", () => {
		store.begin((tx) => {
			tx.del("user-1");
		});

		expect(store.get("user-1")).toBeNull();
	});
});

describe("Store - Iteration & State", () => {
	let store: Store<TestUser>;

	beforeEach(() => {
		store = new Store<TestUser>();
		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
			tx.add({ name: "Charlie" }, { withId: "user-3" });
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
		store.begin((tx) => {
			tx.del("user-1");
		});

		const collection = store.collection();
		expect(collection["~docs"].length).toBe(3);

		const deletedDoc = collection["~docs"].find(
			(doc) => doc["~id"] === "user-1",
		);
		expect(deletedDoc).toBeDefined();
		expect(deletedDoc?.["~deletedAt"]).toBeDefined();
	});
});

describe("Store - Transaction Behavior - Commit/Rollback", () => {
	test("should auto-commit transaction when callback completes", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
		});

		expect(store.get("user-1")).toEqual({ name: "Alice" });
	});

	test("should apply multiple operations atomically", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
			tx.update("user-1", { email: "alice@example.com" });
		});

		expect(store.get("user-1")).toEqual({
			name: "Alice",
			email: "alice@example.com",
		});
		expect(store.get("user-2")).toEqual({ name: "Bob" });
	});

	test("should rollback all changes when tx.rollback() is called", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
		});

		store.begin((tx) => {
			tx.add({ name: "Bob" }, { withId: "user-2" });
			tx.del("user-1");
			tx.rollback();
		});

		expect(store.get("user-1")).not.toBe(null);
		expect(store.get("user-2")).toBe(null);
	});

	test("should rollback on error and re-throw", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
		});

		expect(() => {
			store.begin((tx) => {
				tx.add({ name: "Bob" }, { withId: "user-2" });
				tx.del("user-1");
				throw new Error("Transaction failed");
			});
		}).toThrow("Transaction failed");

		expect(store.get("user-1")).not.toBe(null);
		expect(store.get("user-2")).toBe(null);
	});

	test("should not commit after rollback", () => {
		const store = new Store<TestUser>();

		const result = store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.rollback();
			return "completed";
		});

		expect(result).toBe("completed");
		expect(store.get("user-1")).toBe(null);
	});
});

describe("Store - Transaction Behavior - Transaction Isolation", () => {
	test("should stage changes visible within transaction", () => {
		const store = new Store<TestUser>();

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			expect(tx.get("user-1")).not.toBe(null);
		});
	});

	test("should not apply changes until commit", () => {
		const store = new Store<TestUser>();
		let hasUserDuringTx = false;

		try {
			store.begin((tx) => {
				tx.add({ name: "Alice" }, { withId: "user-1" });
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
	test("should call onAdd hooks with batched entries", () => {
		const store = new Store<TestUser>();
		const onAddMock = mock(
			(_entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			onInit: () => {},
			onDispose: () => {},
			onAdd: onAddMock,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
		});

		expect(onAddMock).toHaveBeenCalledTimes(1);
		const calls = onAddMock.mock.calls[0];
		const entries = calls?.[0];
		expect(entries?.length).toBe(2);

		const entriesMap = new Map(entries);
		expect(entriesMap.get("user-1")).toEqual({ name: "Alice" });
		expect(entriesMap.get("user-2")).toEqual({ name: "Bob" });
	});

	test("should call onUpdate hooks with merged values", () => {
		const store = new Store<TestUser>();
		const onUpdateMock = mock(
			(_entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			onInit: () => {},
			onDispose: () => {},
			onUpdate: onUpdateMock,
		});

		store.begin((tx) => {
			tx.add(
				{ name: "Alice", email: "alice@example.com" },
				{ withId: "user-1" },
			);
		});

		store.begin((tx) => {
			tx.update("user-1", { age: 30 });
		});

		expect(onUpdateMock).toHaveBeenCalledTimes(1);
		const entries = onUpdateMock.mock.calls[0]?.[0];
		expect(entries?.length).toBe(1);
		expect(entries?.[0]?.[0]).toBe("user-1");
		expect(entries?.[0]?.[1]).toEqual({
			name: "Alice",
			email: "alice@example.com",
			age: 30,
		});
	});

	test("should call onDelete hooks with deleted keys", () => {
		const store = new Store<TestUser>();
		const onDeleteMock = mock((_keys: ReadonlyArray<string>) => {});

		store.use({
			onInit: () => {},
			onDispose: () => {},
			onDelete: onDeleteMock,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
		});

		store.begin((tx) => {
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
		const store = new Store<TestUser>();
		const onAddMock = mock(
			(_entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);
		const onUpdateMock = mock(
			(_entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);
		const onDeleteMock = mock((_keys: ReadonlyArray<string>) => {});

		store.use({
			onInit: () => {},
			onDispose: () => {},
			onAdd: onAddMock,
			onUpdate: onUpdateMock,
			onDelete: onDeleteMock,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice" }, { withId: "user-1" });
			tx.add({ name: "Bob" }, { withId: "user-2" });
			tx.add({ name: "Charlie" }, { withId: "user-3" });
		});

		expect(onAddMock).toHaveBeenCalledTimes(1);
		expect(onAddMock.mock.calls[0]?.[0].length).toBe(3);
	});

	test("should not fire hooks when silent: true", () => {
		const store = new Store<TestUser>();
		const onAddMock = mock(
			(_entries: ReadonlyArray<readonly [string, TestUser]>) => {},
		);

		store.use({
			onAdd: onAddMock,
			onInit: () => {},
			onDispose: () => {},
		});

		store.begin(
			(tx) => {
				tx.add({ name: "Alice" }, { withId: "user-1" });
			},
			{ silent: true },
		);

		expect(onAddMock).not.toHaveBeenCalled();
	});
});

describe("Store - Plugin System - Lifecycle", () => {
	test("should call plugin init() during store.init()", async () => {
		const store = new Store<TestUser>();
		const initMock = mock((_s: Store<TestUser>) => {});

		store.use({
			onInit: initMock,
			onDispose: () => {},
		});

		await store.init();

		expect(initMock).toHaveBeenCalledTimes(1);
		expect(initMock.mock.calls[0]?.[0]).toBe(store);
	});

	test("should call multiple plugin inits in registration order", async () => {
		const store = new Store<TestUser>();
		const callOrder: number[] = [];

		store.use({
			onInit: () => {
				callOrder.push(1);
			},
			onDispose: () => {},
		});

		store.use({
			onInit: () => {
				callOrder.push(2);
			},
			onDispose: () => {},
		});

		store.use({
			onInit: () => {
				callOrder.push(3);
			},
			onDispose: () => {},
		});

		await store.init();

		expect(callOrder).toEqual([1, 2, 3]);
	});

	test("should call plugin dispose() during store.dispose()", async () => {
		const store = new Store<TestUser>();
		const disposeMock = mock(() => {});

		store.use({
			onInit: () => {},
			onDispose: disposeMock,
		});

		await store.init();
		await store.dispose();

		expect(disposeMock).toHaveBeenCalledTimes(1);
	});

	test("should call multiple plugin disposes in reverse order", async () => {
		const store = new Store<TestUser>();
		const callOrder: number[] = [];

		store.use({
			onInit: () => {},
			onDispose: () => {
				callOrder.push(1);
			},
		});

		store.use({
			onInit: () => {},
			onDispose: () => {
				callOrder.push(2);
			},
		});

		store.use({
			onInit: () => {},
			onDispose: () => {
				callOrder.push(3);
			},
		});

		await store.init();
		await store.dispose();

		expect(callOrder).toEqual([3, 2, 1]);
	});
});
