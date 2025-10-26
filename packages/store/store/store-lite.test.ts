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

test("change event includes puts", () => {
	const store = create<{ name: string }>();
	const changeHandler = mock();
	store.on("change", changeHandler);

	store.put("user-1", { name: "Alice" });

	const payload = changeHandler.mock.calls[0]?.[0];
	expect(payload).toEqual({
		puts: [["user-1", { name: "Alice" }]],
		updates: [],
		deletes: [],
	});
	expect(changeHandler).toHaveBeenCalledTimes(1);
});

test("change event includes updates for existing data", () => {
	const store = create<{ name: string; title?: string }>();
	store.put("user-1", { name: "Alice" });

	const changeHandler = mock();
	store.on("change", changeHandler);

	store.merge("user-1", { title: "admin" });

	const payload = changeHandler.mock.calls[0]?.[0];
	expect(payload).toEqual({
		puts: [],
		updates: [["user-1", { name: "Alice", title: "admin" }]],
		deletes: [],
	});
	expect(changeHandler).toHaveBeenCalledTimes(1);
});

test("change event includes deletes", () => {
	const store = create<{ name: string }>();
	store.put("user-1", { name: "Alice" });

	const changeHandler = mock();
	store.on("change", changeHandler);

	store.del("user-1");

	expect(changeHandler).toHaveBeenCalledTimes(1);
	expect(changeHandler.mock.calls[0]?.[0]).toEqual({
		puts: [],
		updates: [],
		deletes: ["user-1"],
	});
});

test("transactions emit change only after commit", () => {
	const store = create<{ status: string }>();
	const changeHandler = mock();
	store.on("change", changeHandler);

	const tx = store.begin();
	tx.put("doc-1", { status: "draft" });

	expect(changeHandler).toHaveBeenCalledTimes(0);

	tx.commit();

	expect(changeHandler).toHaveBeenCalledTimes(1);
	expect(changeHandler.mock.calls[0]?.[0]).toEqual({
		puts: [["doc-1", { status: "draft" }]],
		updates: [],
		deletes: [],
	});
});

test("transactions batch multiple operations into single change payload", () => {
	const store = create<{ name: string }>();
	const changeHandler = mock();
	store.on("change", changeHandler);

	const tx = store.begin();
	tx.put("user-1", { name: "Alice" });
	tx.put("user-2", { name: "Bob" });
	tx.commit();

	expect(changeHandler).toHaveBeenCalledTimes(1);
	expect(changeHandler.mock.calls[0]?.[0]).toEqual({
		puts: [
			["user-1", { name: "Alice" }],
			["user-2", { name: "Bob" }],
		],
		updates: [],
		deletes: [],
	});

	changeHandler.mockReset();

	const tx2 = store.begin();
	tx2.del("user-1");
	tx2.del("user-2");
	tx2.commit();

	expect(changeHandler).toHaveBeenCalledTimes(1);
	expect(changeHandler.mock.calls[0]?.[0]).toEqual({
		puts: [],
		updates: [],
		deletes: ["user-1", "user-2"],
	});
});
