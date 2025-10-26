import { expect, mock, test } from "bun:test";
import { create } from "./store-lite";

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

test("direct put calls onPut hook once with array payload", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

	store.put("user-1", { name: "Alice" });

	expect(onPut).toHaveBeenCalledTimes(1);
	const [entries] = onPut.mock.calls[0] ?? [];
	expect(entries).toEqual([["user-1", { name: "Alice" }]]);
});

test("direct patch calls onPatch hook once with array payload", () => {
	const onPatch = mock();
	const store = create<{ name: string; title?: string }>({
		hooks: { onPatch },
	});

	store.put("user-1", { name: "Alice" });
	store.patch("user-1", { title: "admin" });

	expect(onPatch).toHaveBeenCalledTimes(1);
	const [entries] = onPatch.mock.calls[0] ?? [];
	expect(entries).toEqual([["user-1", { name: "Alice", title: "admin" }]]);
});

test("direct del calls onDelete hook once with array of keys", () => {
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onDelete },
	});
	store.put("user-1", { name: "Alice" });

	store.del("user-1");

	expect(onDelete).toHaveBeenCalledTimes(1);
	const [keys] = onDelete.mock.calls[0] ?? [];
	expect(keys).toEqual(["user-1"]);
});

test("transaction batches multiple puts into single onPut call", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

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

test("transaction batches mixed operations into separate hook calls", () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onPut, onPatch, onDelete },
	});

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

test("transaction rollback does not fire hooks", () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onPut, onPatch, onDelete },
	});

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.patch("user-1", { name: "Alicia" });
	tx.del("user-1");

	tx.rollback();

	expect(onPut).not.toHaveBeenCalled();
	expect(onPatch).not.toHaveBeenCalled();
	expect(onDelete).not.toHaveBeenCalled();
});

test("hooks receive readonly frozen arrays", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

	store.put("user-1", { name: "Alice" });

	const [entries] = onPut.mock.calls[0] ?? [];
	expect(Object.isFrozen(entries)).toBe(true);
});

test("empty transaction does not fire hooks", () => {
	const onPut = mock();
	const onPatch = mock();
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onPut, onPatch, onDelete },
	});

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

test("multiple sequential transactions maintain hook batching", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

	const tx1 = store.begin();
	tx1.put("user-1", { name: "Alice" });
	tx1.commit();

	const tx2 = store.begin();
	tx2.put("user-2", { name: "Bob" });
	tx2.commit();

	expect(onPut).toHaveBeenCalledTimes(2);

	const [entries1] = onPut.mock.calls[0] ?? [];
	expect(entries1).toEqual([["user-1", { name: "Alice" }]]);

	const [entries2] = onPut.mock.calls[1] ?? [];
	expect(entries2).toEqual([["user-2", { name: "Bob" }]]);
});
