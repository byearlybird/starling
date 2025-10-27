import { expect, mock, test } from "bun:test";
import { create, type Plugin, type StoreHooks, type StorePutOptions } from "./store.ts";

// Helper to create a plugin with hooks for testing
const createTestPlugin = <T>(hooks: StoreHooks<T>): Plugin<T> => {
        return () => ({
                init: () => {},
                dispose: () => {},
                hooks,
        });
};

const createIdGenerator = (ids: string[]) => {
        let index = 0;
        return () => {
                const next = ids[index];
                if (!next) {
                        throw new Error("No more ids in generator");
                }
                index++;
                return next;
        };
};

const putWithId = <T>(
        target: { put: (value: T, options?: StorePutOptions) => string },
        id: string,
        value: T,
) => target.put(value, { withId: id });

test("put/get expose only plain data", () => {
        const store = create<{ name: string }>();

        const generatedId = store.put({ name: "Alice" });

        expect(typeof generatedId).toBe("string");
        expect(store.get(generatedId)).toEqual({ name: "Alice" });
        expect(store.get(generatedId)).not.toHaveProperty("~id");
        expect(store.has(generatedId)).toBe(true);
        expect(Array.from(store.values())).toEqual([{ name: "Alice" }]);
        expect(Array.from(store.entries())).toEqual([[generatedId, { name: "Alice" }]]);
});

test("put respects explicit id overrides without persisting it", () => {
        const store = create<{ name: string }>();

        const id = putWithId(store, "user-1", { name: "Alice" });

        expect(id).toBe("user-1");
        expect(store.get("user-1")).toEqual({ name: "Alice" });
        expect(store.get("user-1")).not.toHaveProperty("~id");
        expect(Array.from(store.entries())).toEqual([["user-1", { name: "Alice" }]]);
});

test("custom getId is used when provided", () => {
        const getId = mock(() => "custom-id");
        const store = create<{ name: string }>({ getId });

        const id = store.put({ name: "Alice" });

        expect(id).toBe("custom-id");
        expect(getId).toHaveBeenCalledTimes(1);
        expect(store.get(id)).toEqual({ name: "Alice" });
        expect(store.get(id)).not.toHaveProperty("~id");
});

test("explicit withId bypasses custom getId", () => {
        const getId = mock(() => "should-not-run");
        const store = create<{ name: string }>({ getId });

        const id = store.put({ name: "Alice" }, { withId: "custom-id" });

        expect(id).toBe("custom-id");
        expect(getId).not.toHaveBeenCalled();
        expect(store.get(id)).toEqual({ name: "Alice" });
});

test("del hides records from reads and counts", () => {
        const store = create<{ name: string }>();

        putWithId(store, "user-1", { name: "Alice" });
        putWithId(store, "user-2", { name: "Bob" });

	store.del("user-1");

	expect(store.get("user-1")).toBeNull();
	expect(store.has("user-1")).toBe(false);
	expect(store.size).toBe(1);
	expect(Array.from(store.entries())).toEqual([["user-2", { name: "Bob" }]]);
});

test("transactions apply staged mutations on commit", () => {
	const store = create<{ status: string }>();

        putWithId(store, "doc-1", { status: "active" });
        const tx = store.begin();

        tx.patch("doc-1", { status: "pending" });
        putWithId(tx, "doc-2", { status: "draft" });
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
        putWithId(tx, "doc-1", { status: "draft" });

	tx.rollback();

	expect(store.get("doc-1")).toBeNull();
	expect(store.size).toBe(0);
});

test("direct put calls onPut hook once with array payload", async () => {
        const onPut = mock();
        const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
        await store.init();

        putWithId(store, "user-1", { name: "Alice" });

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

        putWithId(store, "user-1", { name: "Alice" });
	store.patch("user-1", { title: "admin" });

	expect(onPatch).toHaveBeenCalledTimes(1);
	const [entries] = onPatch.mock.calls[0] ?? [];
	expect(entries).toEqual([["user-1", { name: "Alice", title: "admin" }]]);
});

test("direct del calls onDelete hook once with array of keys", async () => {
	const onDelete = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onDelete }));
	await store.init();
        putWithId(store, "user-1", { name: "Alice" });

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
        putWithId(tx, "user-1", { name: "Alice" });
        putWithId(tx, "user-2", { name: "Bob" });

        tx.commit();

        expect(onPut).toHaveBeenCalledTimes(1);
        const [entries] = onPut.mock.calls[0] ?? [];
        expect(entries).toEqual([
                ["user-1", { name: "Alice" }],
                ["user-2", { name: "Bob" }],
        ]);
});

test("transaction put returns ids and strips overrides in hooks", async () => {
        const onPut = mock();
        const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
        await store.init();

        const tx = store.begin();
        const overrideId = putWithId(tx, "user-override", { name: "Alice" });
        const generatedId = tx.put({ name: "Bob" });

        expect(overrideId).toBe("user-override");
        expect(typeof generatedId).toBe("string");
        expect(generatedId).not.toBe(overrideId);

        tx.commit();

        expect(onPut).toHaveBeenCalledTimes(1);
        const [entries] = onPut.mock.calls[0] ?? [];
        expect(entries).toEqual([
                ["user-override", { name: "Alice" }],
                [generatedId, { name: "Bob" }],
        ]);
        expect(entries[0]?.[1]).not.toHaveProperty("~id");
        expect(store.get(overrideId)).not.toHaveProperty("~id");
        expect(store.get(generatedId)).toEqual({ name: "Bob" });
});

test("transaction batches mixed operations into separate hook calls", async () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onPut, onPatch, onDelete }),
	);
	await store.init();

        putWithId(store, "user-1", { name: "Alice" });

	const tx = store.begin();
        putWithId(tx, "user-2", { name: "Bob" });
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
        putWithId(tx, "user-1", { name: "Alice" });
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

        putWithId(store, "user-1", { name: "Alice" });

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
        putWithId(store, "user-1", { name: "Alice" });

	const tx = store.begin();
        putWithId(tx, "user-2", { name: "Bob" });
	tx.commit();

	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.get("user-2")).toEqual({ name: "Bob" });
});

test("multiple sequential transactions maintain hook batching", async () => {
	const onPut = mock();
	const store = create<{ name: string }>().use(createTestPlugin({ onPut }));
	await store.init();

	const tx1 = store.begin();
        putWithId(tx1, "user-1", { name: "Alice" });
	tx1.commit();

	const tx2 = store.begin();
        putWithId(tx2, "user-2", { name: "Bob" });
	tx2.commit();

	expect(onPut).toHaveBeenCalledTimes(2);
});

test("onBeforePut fires before put is applied", async () => {
	const onBeforePut = mock();
	const store = create<{ name: string }>().use(
		createTestPlugin({ onBeforePut }),
	);
	await store.init();

        putWithId(store, "user-1", { name: "Alice" });

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
        putWithId(store, "user-1", { name: "Alice" });
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

        putWithId(store, "user-1", { name: "Alice", email: "alice@example.com" });
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

        putWithId(store, "user-1", { name: "Alice" });
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

        putWithId(store, "user-1", { name: "Alice" });

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
        putWithId(tx, "user-1", { name: "Alice" });
        putWithId(tx, "user-2", { name: "Bob" });

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

        putWithId(store, "user-1", { name: "Alice" });

	const tx = store.begin();
        expect(() => putWithId(tx, "user-2", { name: "Bob" })).toThrow("user-2 is invalid");
	tx.rollback();

	// Only first put should exist, second put should have been rejected
	expect(store.get("user-1")).toEqual({ name: "Alice" });
	expect(store.get("user-2")).toBeNull();
});

// === Primitive Store Tests ===

test("primitive store (string): put/get/del work correctly", () => {
        const store = create<string>({
                getId: createIdGenerator(["key-1", "key-2"]),
        });

        const key1 = store.put("hello");
        const key2 = store.put("world");

        expect(key1).toBe("key-1");
        expect(key2).toBe("key-2");
        expect(store.get(key1)).toBe("hello");
        expect(store.get(key2)).toBe("world");
        expect(store.has(key1)).toBe(true);
        expect(Array.from(store.values())).toEqual(["hello", "world"]);
        expect(Array.from(store.entries())).toEqual([
                ["key-1", "hello"],
                ["key-2", "world"],
        ]);

        store.del(key1);
        expect(store.get(key1)).toBeNull();
        expect(store.has(key1)).toBe(false);
        expect(store.size).toBe(1);
});

test("primitive store (number): put/get/del work correctly", () => {
        const store = create<number>({
                getId: createIdGenerator(["count-1", "count-2"]),
        });

        const id1 = store.put(42);
        const id2 = store.put(100);

        expect(id1).toBe("count-1");
        expect(id2).toBe("count-2");
        expect(store.get(id1)).toBe(42);
        expect(store.get(id2)).toBe(100);
        expect(store.has(id1)).toBe(true);
        expect(Array.from(store.values())).toEqual([42, 100]);

        store.del(id1);
        expect(store.get(id1)).toBeNull();
        expect(store.size).toBe(1);
});

test("primitive store (boolean): put/get/del work correctly", () => {
        const store = create<boolean>({
                getId: createIdGenerator(["flag-1", "flag-2"]),
        });

        const id1 = store.put(true);
        const id2 = store.put(false);

        expect(id1).toBe("flag-1");
        expect(id2).toBe("flag-2");
        expect(store.get(id1)).toBe(true);
        expect(store.get(id2)).toBe(false);
        expect(Array.from(store.values())).toEqual([true, false]);

        store.del(id1);
        expect(store.get(id1)).toBeNull();
});

test("primitive store: patch overwrites completely (acts like put)", () => {
        const store = create<string>({
                getId: createIdGenerator(["msg-1"]),
        });

        const id = store.put("hello");
        expect(id).toBe("msg-1");
        expect(store.get(id)).toBe("hello");

        // Patch on primitives should completely replace the value
        store.patch(id, "goodbye");
        expect(store.get(id)).toBe("goodbye");
});

test("primitive store: patch fires onPatch hook with new value", async () => {
        const onPatch = mock();
        const store = create<number>({
                getId: createIdGenerator(["count-1"]),
        }).use(createTestPlugin({ onPatch }));
        await store.init();

        const id = store.put(10);
        store.patch(id, 20);

        expect(onPatch).toHaveBeenCalledTimes(1);
        const [entries] = onPatch.mock.calls[0] ?? [];
        expect(entries).toEqual([["count-1", 20]]);
});

test("primitive store: hooks work correctly", async () => {
        const onPut = mock();
        const onPatch = mock();
        const onDelete = mock();
        const store = create<string>({
                getId: createIdGenerator(["key-1"]),
        }).use(createTestPlugin({ onPut, onPatch, onDelete }));
        await store.init();

        const id = store.put("value1");
        expect(onPut).toHaveBeenCalledTimes(1);
        const [putEntries] = onPut.mock.calls[0] ?? [];
        expect(putEntries).toEqual([["key-1", "value1"]]);

        store.patch(id, "value2");
        expect(onPatch).toHaveBeenCalledTimes(1);
        const [patchEntries] = onPatch.mock.calls[0] ?? [];
        expect(patchEntries).toEqual([["key-1", "value2"]]);

        store.del(id);
        expect(onDelete).toHaveBeenCalledTimes(1);
        const [deleteKeys] = onDelete.mock.calls[0] ?? [];
        expect(deleteKeys).toEqual(["key-1"]);
});

test("primitive store: transactions work correctly", () => {
        const store = create<number>({
                getId: createIdGenerator(["num-1", "num-2"]),
        });

        const tx = store.begin();
        const id1 = tx.put(10);
        const id2 = tx.put(20);
        tx.patch(id1, 15);
        tx.del(id2);

        expect(store.get(id1)).toBeNull();
        expect(store.get(id2)).toBeNull();

        tx.commit();

        expect(store.get(id1)).toBe(15);
        expect(store.get(id2)).toBeNull();
        expect(store.size).toBe(1);
});

test("primitive store: snapshot includes encoded primitives", () => {
        const store = create<string>({
                getId: createIdGenerator(["key-1", "key-2"]),
        });

        const id1 = store.put("hello");
        const id2 = store.put("world");
        store.del(id1);

        const snapshot = store.snapshot();

        expect(snapshot).toHaveLength(2);
        expect(snapshot[0]?.["~id"]).toBe(id1);
        expect(snapshot[1]?.["~id"]).toBe(id2);

        // Verify deleted item has deletedAt timestamp
        expect(snapshot[0]?.["~deletedAt"]).not.toBeNull();
        expect(snapshot[1]?.["~deletedAt"]).toBeNull();
});
