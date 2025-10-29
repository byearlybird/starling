import { expect, test } from "bun:test";
import { decodeDoc, encodeDoc } from "./document";
import { createKV } from "./kv";

const eventstamp = (counter: number) =>
	`2025-01-01T00:00:00.000Z|${counter.toString(16).padStart(4, "0")}`;

const buildDoc = (id: string, data: Record<string, unknown>, counter: number) =>
	encodeDoc(id, data, eventstamp(counter));

test("stores fresh values that can be read back", () => {
	const kv = createKV();
	const doc = buildDoc("doc-1", { name: "Alpha" }, 1);

	kv.begin((tx) => {
		tx.set("doc-1", doc, { replace: true });
	});

	expect(kv.size).toBe(1);
	expect(kv.get("doc-1")).toEqual(doc);
	expect(kv.get("missing")).toBeNull();
});

test("merges with existing document state", () => {
	const kv = createKV();
	const current = buildDoc("doc-1", { name: "Alice", age: 30 }, 1);
	const incoming = buildDoc(
		"doc-2",
		{ name: "Alice Updated", email: "alice@example.com" },
		2,
	);

	kv.begin((seedTx) => {
		seedTx.set("user-1", current, { replace: true });
	});

	kv.begin((patchTx) => {
		patchTx.set("user-1", incoming);
	});

	const merged = kv.get("user-1");
	expect(merged).not.toBeNull();

	// biome-ignore lint/style/noNonNullAssertion: <guard above>
	const decoded = decodeDoc(merged!);
	expect(decoded["~id"]).toBe("doc-1");
	expect(decoded["~data"]).toEqual({
		name: "Alice Updated",
		age: 30,
		email: "alice@example.com",
	});
});

test("del marks stored documents as deleted", () => {
	const kv = createKV();
	const doc = buildDoc("doc-1", { name: "Alpha" }, 1);
	const deleteStamp = "2025-01-02T00:00:00.000Z|0003";

	kv.begin((tx) => {
		tx.set("doc-1", doc, { replace: true });
		tx.del("doc-1", deleteStamp);
	});

	const deleted = kv.get("doc-1");
	expect(deleted?.["~deletedAt"]).toBe(deleteStamp);
});

test("transactions isolate staged writes until commit applies them", () => {
	const kv = createKV();
	const existing = buildDoc("doc-1", { status: "active" }, 1);
	const staged = buildDoc("doc-2", { status: "pending" }, 2);
	const deleteStamp = "2025-01-02T00:00:00.000Z|0004";

	kv.begin((seedTx) => {
		seedTx.set("doc-1", existing, { replace: true });
	});

	kv.begin((tx) => {
		tx.set("doc-2", staged, { replace: true });
		tx.del("doc-1", deleteStamp);

		expect(kv.get("doc-2")).toBeNull();
		expect(kv.get("doc-1")?.["~deletedAt"]).toBeNull();
	});

	expect(kv.get("doc-2")).toEqual(staged);
	expect(kv.get("doc-1")?.["~deletedAt"]).toBe(deleteStamp);
});
