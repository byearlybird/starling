import { expect, mock, test } from "bun:test";
import { create, type Plugin, type StoreHooks } from "./store.ts";

// Helper to create a plugin with hooks for testing
const createTestPlugin = <T>(hooks: StoreHooks<T>): Plugin<T> => {
	return () => ({
		init: () => {},
		dispose: () => {},
		hooks,
	});
};

test("put/get expose only plain data", () => {
	const store = create<{ name: string }>();

	store.put("user-1", { name: "Alice" });

	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.has("user-1")).toBe(true);
	expect(Array.from(store.values())).toEqual([{ name: "Alice" }]);
	expect(Array.from(store.entries())).toEqual([["user-1", { name: "Alice" }]]);
});

test("del hides records from reads and counts", () => {
	const store = create<{ name: string }>();

	store.put("user-1", { name: "Alice" });
	store.put("user-2", { name: "Bob" });

	store.del("user-1");

	expect(store.get("user-1")).toBeNull();
	expect(store.has("user-1")).toBe(false);
	expect(store.size).toBe(1);
	expect(Array.from(store.entries())).toEqual([["user-2", { name: "Bob" }]]);
});

test("transactions apply staged mutations on commit", () => {
	const store = create<{ status: string }>();

	store.put("doc-1", { status: "active" });
	const tx = store.begin();

	tx.patch("doc-1", { status: "pending" });
	tx.put("doc-2", { status: "draft" });
	tx.del("doc-1");

	expect(store.get("doc-1")).toEqual({ status: "active" });
	expect(store.get("doc-2")).toBeNull();

	tx.commit();

	expect(store.get("doc-1")).toBeNull();
	expect(store.get("doc-2")).toEqual({ status: "draft" });
});

test("transactions rollback without mutating store", () => {
	const store = create<{ status: string }>();

	const tx = store.begin();
	tx.put("doc-1", { status: "draft" });

	tx.rollback();

	expect(store.get("doc-1")).toBeNull();
	expect(store.size).toBe(0);
});

test("direct put calls onPut hook once with array payload", async () => {
	const onPut = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
	await store.init();

	store.put("user-1", { name: "Alice" });

	expect(onPut).toHaveBeenCalledTimes(1);
	const [entries] = onPut.mock.calls[0] ?? [];
	expect(entries).toEqual([["user-1", { name: "Alice" }]]);
});

test("direct patch calls onPatch hook once with array payload", async () => {
	const onPatch = mock();
	const store = create<{ name: string; title?: string }>().use(
		createTestPlugin({ onPatch }),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });
	store.patch("user-1", { title: "admin" });

	expect(onPatch).toHaveBeenCalledTimes(1);
	const [entries] = onPatch.mock.calls[0] ?? [];
	expect(entries).toEqual([["user-1", { name: "Alice", title: "admin" }]]);
});

test("direct del calls onDelete hook once with array of keys", async () => {
	const onDelete = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onDelete }));
	await store.init();
	store.put("user-1", { name: "Alice" });

	store.del("user-1");

	expect(onDelete).toHaveBeenCalledTimes(1);
	const [keys] = onDelete.mock.calls[0] ?? [];
	expect(keys).toEqual(["user-1"]);
});

test("transaction batches multiple puts into single onPut call", async () => {
	const onPut = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
	await store.init();

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.put("user-2", { name: "Bob" });

	tx.commit();

	expect(onPut).toHaveBeenCalledTimes(1);
	const [entries] = onPut.mock.calls[0] ?? [];
	expect(entries).toEqual([
		["user-1", { name: "Alice" }],
		["user-2", { name: "Bob" }],
	]);
});

test("transaction batches mixed operations into separate hook calls", async () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onPut, onPatch, onDelete }),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });

	const tx = store.begin();
	tx.put("user-2", { name: "Bob" });
	tx.patch("user-1", { name: "Alicia" });
	tx.del("user-1");

	expect(onPut).toHaveBeenCalledTimes(1);
	expect(onPatch).toHaveBeenCalledTimes(0);
	expect(onDelete).toHaveBeenCalledTimes(0);

	tx.commit();

	expect(onPut).toHaveBeenCalledTimes(2);
	expect(onPatch).toHaveBeenCalledTimes(1);
	expect(onDelete).toHaveBeenCalledTimes(1);

	// First onPut from direct put before transaction
	const [firstPutEntries] = onPut.mock.calls[0] ?? [];
	expect(firstPutEntries).toEqual([["user-1", { name: "Alice" }]]);

	// Second onPut from transaction
	const [secondPutEntries] = onPut.mock.calls[1] ?? [];
	expect(secondPutEntries).toEqual([["user-2", { name: "Bob" }]]);

	// onPatch from transaction
	const [patchEntries] = onPatch.mock.calls[0] ?? [];
	expect(patchEntries).toEqual([["user-1", { name: "Alicia" }]]);

	// onDelete from transaction
	const [deleteKeys] = onDelete.mock.calls[0] ?? [];
	expect(deleteKeys).toEqual(["user-1"]);
});

test("transaction rollback does not fire hooks", async () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onPut, onPatch, onDelete }),
	);
	await store.init();

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.patch("user-1", { name: "Alicia" });
	tx.del("user-1");

	tx.rollback();

	expect(onPut).not.toHaveBeenCalled();
	expect(onPatch).not.toHaveBeenCalled();
	expect(onDelete).not.toHaveBeenCalled();
});

test("hooks receive readonly frozen arrays", async () => {
	const onPut = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
	await store.init();

	store.put("user-1", { name: "Alice" });

	const [entries] = onPut.mock.calls[0] ?? [];
	expect(Object.isFrozen(entries)).toBe(true);
});

test("empty transaction does not fire hooks", async () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onPut, onPatch, onDelete }),
	);
	await store.init();

	const tx = store.begin();
	tx.commit();

	expect(onPut).not.toHaveBeenCalled();
	expect(onPatch).not.toHaveBeenCalled();
	expect(onDelete).not.toHaveBeenCalled();
});

test("hooks not called when no hooks configured", () => {
	const store = create<{ name: string }>();

	// Should not throw
	store.put("user-1", { name: "Alice" });

	const tx = store.begin();
	tx.put("user-2", { name: "Bob" });
	tx.commit();

	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.get("user-2")).toEqual({ name: "Bob" });
});

test("multiple sequential transactions maintain hook batching", async () => {
	const onPut = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
	await store.init();

	const tx1 = store.begin();
	tx1.put("user-1", { name: "Alice" });
	tx1.commit();

	const tx2 = store.begin();
	tx2.put("user-2", { name: "Bob" });
	tx2.commit();

	expect(onPut).toHaveBeenCalledTimes(2);
});

test("onBeforePut fires before put is applied", async () => {
	const onBeforePut = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforePut }),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });

	expect(onBeforePut).toHaveBeenCalledTimes(1);
	expect(onBeforePut).toHaveBeenCalledWith("user-1", { name: "Alice" });
});

test("onBeforePut rejecting throws and prevents put", async () => {
	const onBeforePut = () => {
		throw new Error("Validation failed");
	};
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforePut }),
	);
	await store.init();

	expect(() => {
		store.put("user-1", { name: "Alice" });
	}).toThrow("Validation failed");

	// Store should still be empty after failed validation
	expect(store.get("user-1")).toBeNull();
});

test("onBeforePatch fires before patch is applied", async () => {
	const onBeforePatch = mock();
	const store = create<{ name: string; email: string }>().use(
		createTestPlugin({ onBeforePatch }),
	);
	await store.init();

	store.put("user-1", { name: "Alice", email: "alice@example.com" });
	onBeforePatch.mockClear();

	store.patch("user-1", { email: "alice@newdomain.com" });

	expect(onBeforePatch).toHaveBeenCalledTimes(1);
	expect(onBeforePatch).toHaveBeenCalledWith("user-1", {
		email: "alice@newdomain.com",
	});
});

test("onBeforeDelete fires before delete is applied", async () => {
	const onBeforeDelete = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforeDelete }),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });
	onBeforeDelete.mockClear();

	store.del("user-1");

	expect(onBeforeDelete).toHaveBeenCalledTimes(1);
	expect(onBeforeDelete).toHaveBeenCalledWith("user-1");
});

test("multiple before hooks compose", async () => {
	const beforePut1 = mock();
	const beforePut2 = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({
			onBeforePut: (key, value) => {
				beforePut1(key, value);
				beforePut2(key, value);
			},
		}),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });

	expect(beforePut1).toHaveBeenCalledTimes(1);
	expect(beforePut2).toHaveBeenCalledTimes(1);
});

test("before hooks fire in transactions", async () => {
	const onBeforePut = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforePut }),
	);
	await store.init();

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.put("user-2", { name: "Bob" });

	expect(onBeforePut).toHaveBeenCalledTimes(2);

	tx.commit();

	// onPut should not have been called yet (fires on commit)
	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.get("user-2")).toEqual({ name: "Bob" });
});

test("rollback after before hook error leaves store unchanged", async () => {
	const onBeforePut = (key: string) => {
		if (key === "user-2") {
			throw new Error("user-2 is invalid");
		}
	};
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforePut }),
	);
	await store.init();

	store.put("user-1", { name: "Alice" });

	const tx = store.begin();
	expect(() => tx.put("user-2", { name: "Bob" })).toThrow("user-2 is invalid");
	tx.rollback();

	// Only first put should exist, second put should have been rejected
	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.get("user-2")).toBeNull();
});

// === Primitive Store Tests ===

test("primitive store (string): put/get/del work correctly", () => {
	const store = create<string>();

	store.put("key-1", "hello");
	store.put("key-2", "world");

	expect(store.get("key-1")).toBe("hello");
	expect(store.get("key-2")).toBe("world");
	expect(store.has("key-1")).toBe(true);
	expect(Array.from(store.values())).toEqual(["hello", "world"]);
	expect(Array.from(store.entries())).toEqual([
		["key-1", "hello"],
		["key-2", "world"],
	]);

	store.del("key-1");
	expect(store.get("key-1")).toBeNull();
	expect(store.has("key-1")).toBe(false);
	expect(store.size).toBe(1);
});

test("primitive store (number): put/get/del work correctly", () => {
	const store = create<number>();

	store.put("count-1", 42);
	store.put("count-2", 100);

	expect(store.get("count-1")).toBe(42);
	expect(store.get("count-2")).toBe(100);
	expect(store.has("count-1")).toBe(true);
	expect(Array.from(store.values())).toEqual([42, 100]);

	store.del("count-1");
	expect(store.get("count-1")).toBeNull();
	expect(store.size).toBe(1);
});

test("primitive store (boolean): put/get/del work correctly", () => {
	const store = create<boolean>();

	store.put("flag-1", true);
	store.put("flag-2", false);

	expect(store.get("flag-1")).toBe(true);
	expect(store.get("flag-2")).toBe(false);
	expect(Array.from(store.values())).toEqual([true, false]);

	store.del("flag-1");
	expect(store.get("flag-1")).toBeNull();
});

test("primitive store: patch overwrites completely (acts like put)", () => {
	const store = create<string>();

	store.put("msg-1", "hello");
	expect(store.get("msg-1")).toBe("hello");

	// Patch on primitives should completely replace the value
	store.patch("msg-1", "goodbye");
	expect(store.get("msg-1")).toBe("goodbye");
});

test("primitive store: patch fires onPatch hook with new value", async () => {
	const onPatch = mock();
	const store = create<number>().use(createTestPlugin({ onPatch }));
	await store.init();

	store.put("count-1", 10);
	store.patch("count-1", 20);

	expect(onPatch).toHaveBeenCalledTimes(1);
	const [entries] = onPatch.mock.calls[0] ?? [];
	expect(entries).toEqual([["count-1", 20]]);
});

test("primitive store: hooks work correctly", async () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<string>().use(
		createTestPlugin({ onPut, onPatch, onDelete }),
	);
	await store.init();

	store.put("key-1", "value1");
	expect(onPut).toHaveBeenCalledTimes(1);
	const [putEntries] = onPut.mock.calls[0] ?? [];
	expect(putEntries).toEqual([["key-1", "value1"]]);

	store.patch("key-1", "value2");
	expect(onPatch).toHaveBeenCalledTimes(1);
	const [patchEntries] = onPatch.mock.calls[0] ?? [];
	expect(patchEntries).toEqual([["key-1", "value2"]]);

	store.del("key-1");
	expect(onDelete).toHaveBeenCalledTimes(1);
	const [deleteKeys] = onDelete.mock.calls[0] ?? [];
	expect(deleteKeys).toEqual(["key-1"]);
});

test("primitive store: transactions work correctly", () => {
	const store = create<number>();

	const tx = store.begin();
	tx.put("num-1", 10);
	tx.put("num-2", 20);
	tx.patch("num-1", 15);
	tx.del("num-2");

	expect(store.get("num-1")).toBeNull();
	expect(store.get("num-2")).toBeNull();

	tx.commit();

	expect(store.get("num-1")).toBe(15);
	expect(store.get("num-2")).toBeNull();
	expect(store.size).toBe(1);
});

test("primitive store: snapshot includes encoded primitives", () => {
	const store = create<string>();

	store.put("key-1", "hello");
	store.put("key-2", "world");
	store.del("key-1");

	const snapshot = store.snapshot();

	expect(snapshot).toHaveLength(2);
	expect(snapshot[0]?.["~id"]).toBe("key-1");
	expect(snapshot[1]?.["~id"]).toBe("key-2");

	// Verify deleted item has deletedAt timestamp
	expect(snapshot[0]?.["~deletedAt"]).not.toBeNull();
	expect(snapshot[1]?.["~deletedAt"]).toBeNull();
});
