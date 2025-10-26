import { expect, test } from "bun:test";
import { decode, del, encode, merge } from "./document";

test("encode creates EncodedDocument with null ~deletedAt", () => {
	const result = encode(
		"user-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);

	expect(result["~id"]).toBe("user-1");
	expect(result["~deletedAt"]).toBe(null);
	expect(result["~data"]).toBeDefined();
});

test("encode with id", () => {
	const result = encode(
		"user-2",
		{ name: "Bob", email: "bob@example.com" },
		"2025-01-01T00:00:00.000Z|0",
	);

	expect(result["~id"]).toBe("user-2");
	expect(result["~deletedAt"]).toBe(null);
	expect(result["~data"]).toBeDefined();
});

test("decode returns original data structure", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0";
	const original = { name: "Charlie", score: 100 };
	const encoded = encode("user-3", original, eventstamp);
	const decoded = decode(encoded);

	expect(decoded["~id"]).toBe("user-3");
	expect(decoded["~deletedAt"]).toBe(null);
	expect(decoded["~data"]).toEqual(original);
});

test("merge both deleted - keeps greater timestamp", () => {
	const eventstamp1 = "2025-01-01T00:00:00.000Z|0";
	const eventstamp2 = "2025-01-02T00:00:00.000Z|0";

	const doc1 = encode("doc-1", { name: "Alice" }, eventstamp1);
	doc1["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const doc2 = encode("doc-2", { name: "Bob" }, eventstamp2);
	doc2["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const merged = merge(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("merge both deleted - keeps greater timestamp (reverse order)", () => {
	const doc1 = encode("doc-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");
	doc1["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const doc2 = encode("doc-2", { name: "Bob" }, "2025-01-02T00:00:00.000Z|0");
	doc2["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const merged = merge(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("merge one deleted - keeps the deleted one", () => {
	const doc1 = encode("doc-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");
	doc1["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const doc2 = encode("doc-2", { name: "Bob" }, "2025-01-02T00:00:00.000Z|0");
	doc2["~deletedAt"] = null;

	const merged = merge(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-01T12:00:00.000Z|1");
});

test("merge one deleted (from) - keeps the deleted one", () => {
	const doc1 = encode("doc-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");
	doc1["~deletedAt"] = null;

	const doc2 = encode("doc-2", { name: "Bob" }, "2025-01-02T00:00:00.000Z|0");
	doc2["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const merged = merge(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("merge neither deleted - returns null", () => {
	const doc1 = encode("doc-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");
	const doc2 = encode("doc-2", { name: "Bob" }, "2025-01-02T00:00:00.000Z|0");

	const merged = merge(doc1, doc2);

	expect(merged["~deletedAt"]).toBe(null);
});

test("merge preserves ~id from into document", () => {
	const doc1 = encode("doc-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");

	const doc2 = encode("doc-2", { name: "Bob" }, "2025-01-02T00:00:00.000Z|0");

	const merged = merge(doc1, doc2);

	expect(merged["~id"]).toBe("doc-1");
});

test("merge merges ~data using object merge", () => {
	const doc1 = encode(
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);
	const doc2 = encode(
		"doc-1",
		{ name: "Alice Updated", email: "alice@example.com" },
		"2025-01-02T00:00:00.000Z|0",
	);

	const merged = merge(doc1, doc2);
	const decoded = decode(merged);

	expect(decoded["~data"]).toBeDefined();
	expect(merged["~data"]).toBeDefined();
});

test("del marks document as deleted with eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0";
	const doc = encode("user-1", { name: "Alice", age: 30 }, eventstamp);
	const deleteEventstamp = "2025-01-02T00:00:00.000Z|1";

	const deleted = del(doc, deleteEventstamp);

	expect(deleted["~deletedAt"]).toBe(deleteEventstamp);
	expect(deleted["~id"]).toBe("user-1");
	expect(deleted["~data"]).toEqual(doc["~data"]);
});

test("del preserves original document id and data", () => {
	const doc = encode(
		"doc-123",
		{ status: "active" },
		"2025-01-01T00:00:00.000Z|0",
	);

	const deleted = del(doc, "2025-01-02T00:00:00.000Z|1");

	expect(deleted["~id"]).toBe("doc-123");
	expect(deleted["~data"]).toBe(doc["~data"]);
});

test("del can be called on already deleted document", () => {
	const doc = encode("user-1", { name: "Bob" }, "2025-01-01T00:00:00.000Z|0");
	doc["~deletedAt"] = "2025-01-02T00:00:00.000Z|1";

	const redeleted = del(doc, "2025-01-03T00:00:00.000Z|2");

	expect(redeleted["~deletedAt"]).toBe("2025-01-03T00:00:00.000Z|2");
});

test("del with decode shows document is deleted", () => {
	const doc = encode("user-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0");
	const deleted = del(doc, "2025-01-02T00:00:00.000Z|1");
	const decoded = decode(deleted);

	expect(decoded["~deletedAt"]).toBe("2025-01-02T00:00:00.000Z|1");
	expect(decoded["~data"]).toEqual({ name: "Alice" });
});
