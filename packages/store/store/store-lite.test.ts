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

	tx.merge("doc-1", { status: "pending" });
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

test("onPut hook receives encoded document", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

	store.put("user-1", { name: "Alice" });

	expect(onPut).toHaveBeenCalledTimes(1);
	const [, doc] = onPut.mock.calls[0] ?? [];
	expect(doc?.__id).toBe("user-1");
	expect(doc?.__deletedAt).toBeNull();
	expect(doc?.__data.name).toMatchObject({
		__value: "Alice",
	});
});

test("onMerge hook fires after merge completes", () => {
	const onMerge = mock();
	const store = create<{ name: string; title?: string }>({
		hooks: { onMerge },
	});

	store.put("user-1", { name: "Alice" });
	store.merge("user-1", { title: "admin" });

	expect(onMerge).toHaveBeenCalledTimes(1);
	const [, doc] = onMerge.mock.calls[0] ?? [];
	expect(doc?.__data.name.__value).toBe("Alice");
	expect(doc?.__data.title?.__value).toBe("admin");
});

test("onDelete hook includes tombstone document", () => {
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onDelete },
	});
	store.put("user-1", { name: "Alice" });

	store.del("user-1");

	expect(onDelete).toHaveBeenCalledTimes(1);
	const [, doc] = onDelete.mock.calls[0] ?? [];
	expect(doc?.__deletedAt).not.toBeNull();
});

test("transaction hooks fire only after commit", () => {
	const onPut = mock();
	const onMerge = mock();
	const onDelete = mock();
	const store = create<{ name: string }>({
		hooks: { onPut, onMerge, onDelete },
	});

	const tx = store.begin();
	tx.put("user-1", { name: "Alpha" });
	tx.merge("user-1", { title: "admin" });
	tx.del("user-1");

	expect(onPut).toHaveBeenCalledTimes(0);
	expect(onMerge).toHaveBeenCalledTimes(0);
	expect(onDelete).toHaveBeenCalledTimes(0);

	tx.commit();

	expect(onPut).toHaveBeenCalledTimes(1);
	expect(onMerge).toHaveBeenCalledTimes(1);
	expect(onDelete).toHaveBeenCalledTimes(1);
});

test("transaction rollback does not fire hooks", () => {
	const onPut = mock();
	const store = create<{ name: string }>({
		hooks: { onPut },
	});

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.rollback();

	expect(onPut).not.toHaveBeenCalled();
});
