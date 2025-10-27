import { expect, test } from "bun:test";
import { decode, encode } from "./document";
import { create } from "./kv";

const eventstamp = (counter: number) =>
	`2025-01-01T00:00:00.000Z|${counter.toString(16).padStart(4, "0")}`;

const buildDoc = (id: string, data: Record<string, unknown>, counter: number) =>
	encode(id, data, eventstamp(counter));

test("put stores values that can be read back", () => {
	const kv = create();
	const doc = buildDoc("doc-1", { name: "Alpha" }, 1);

	const tx = kv.begin();
	tx.put("doc-1", doc);
	tx.commit();

	expect(kv.size).toBe(1);
	expect(kv.has("doc-1")).toBe(true);
	expect(kv.get("doc-1")).toEqual(doc);
	expect(kv.get("missing")).toBeNull();
});

test("patch combines document state when a key already exists", () => {
	const kv = create();
	const current = buildDoc("doc-1", { name: "Alice", age: 30 }, 1);
	const incoming = buildDoc(
		"doc-2",
		{ name: "Alice Updated", email: "alice@example.com" },
		2,
	);

	const seedTx = kv.begin();
	seedTx.put("user-1", current);
	seedTx.commit();

	const patchTx = kv.begin();
	patchTx.patch("user-1", incoming);
	patchTx.commit();

	const merged = kv.get("user-1");
	expect(merged).not.toBeNull();

	const decoded = decode(merged!);
	expect(decoded["~id"]).toBe("doc-1");
	expect(decoded["~data"]).toEqual({
		name: "Alice Updated",
		age: 30,
		email: "alice@example.com",
	});
});

test("del marks stored documents as deleted", () => {
	const kv = create();
	const doc = buildDoc("doc-1", { name: "Alpha" }, 1);
	const deleteStamp = "2025-01-02T00:00:00.000Z|0003";

	const tx = kv.begin();
	tx.put("doc-1", doc);
	tx.del("doc-1", deleteStamp);
	tx.commit();

	const deleted = kv.get("doc-1");
	expect(deleted?.["~deletedAt"]).toBe(deleteStamp);
});

test("transactions isolate staged writes until commit applies them", () => {
	const kv = create();
	const existing = buildDoc("doc-1", { status: "active" }, 1);
	const staged = buildDoc("doc-2", { status: "pending" }, 2);
	const deleteStamp = "2025-01-02T00:00:00.000Z|0004";

	const seedTx = kv.begin();
	seedTx.put("doc-1", existing);
	seedTx.commit();

	const tx = kv.begin();
	tx.put("doc-2", staged);
	tx.del("doc-1", deleteStamp);

	expect(kv.get("doc-2")).toBeNull();
	expect(kv.get("doc-1")?.["~deletedAt"]).toBeNull();

	tx.commit();

	expect(kv.get("doc-2")).toEqual(staged);
	expect(kv.get("doc-1")?.["~deletedAt"]).toBe(deleteStamp);
});
