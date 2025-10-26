import { expect, test } from "bun:test";
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
