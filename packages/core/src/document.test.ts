import { expect, test } from "bun:test";
import { decodeDoc, deleteDoc, encodeDoc, mergeDocs } from "./document";

test("encodeDoc creates EncodedDocument with null ~deletedAt", () => {
	const result = encodeDoc(
		"user-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);

	expect(result["~id"]).toBe("user-1");
	expect(result["~deletedAt"]).toBe(null);
	expect(result["~data"]).toBeDefined();
});

test("encodeDoc with id", () => {
	const result = encodeDoc(
		"user-2",
		{ name: "Bob", email: "bob@example.com" },
		"2025-01-01T00:00:00.000Z|0",
	);

	expect(result["~id"]).toBe("user-2");
	expect(result["~deletedAt"]).toBe(null);
	expect(result["~data"]).toBeDefined();
});

test("decodeDoc returns original data structure", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0";
	const original = { name: "Charlie", score: 100 };
	const encoded = encodeDoc("user-3", original, eventstamp);
	const decoded = decodeDoc(encoded);

	expect(decoded["~id"]).toBe("user-3");
	expect(decoded["~deletedAt"]).toBe(null);
	expect(decoded["~data"]).toEqual(original);
});

test("mergeDocs both deleted - keeps greater timestamp", () => {
	const eventstamp1 = "2025-01-01T00:00:00.000Z|0";
	const eventstamp2 = "2025-01-02T00:00:00.000Z|0";

	const doc1 = encodeDoc("doc-1", { name: "Alice" }, eventstamp1);
	doc1["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const doc2 = encodeDoc("doc-2", { name: "Bob" }, eventstamp2);
	doc2["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("mergeDocs both deleted - keeps greater timestamp (reverse order)", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	doc1["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const doc2 = encodeDoc(
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0",
	);
	doc2["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("mergeDocs one deleted - keeps the deleted one", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	doc1["~deletedAt"] = "2025-01-01T12:00:00.000Z|1";

	const doc2 = encodeDoc(
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0",
	);
	doc2["~deletedAt"] = null;

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-01T12:00:00.000Z|1");
});

test("mergeDocs one deleted (from) - keeps the deleted one", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	doc1["~deletedAt"] = null;

	const doc2 = encodeDoc(
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0",
	);
	doc2["~deletedAt"] = "2025-01-02T12:00:00.000Z|2";

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~deletedAt"]).toBe("2025-01-02T12:00:00.000Z|2");
});

test("mergeDocs neither deleted - returns null", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	const doc2 = encodeDoc(
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0",
	);

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~deletedAt"]).toBe(null);
});

test("mergeDocs preserves ~id from into document", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);

	const doc2 = encodeDoc(
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0",
	);

	const merged = mergeDocs(doc1, doc2);

	expect(merged["~id"]).toBe("doc-1");
});

test("mergeDocs merges ~data using object mergeDocs", () => {
	const doc1 = encodeDoc(
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);
	const doc2 = encodeDoc(
		"doc-1",
		{ name: "Alice Updated", email: "alice@example.com" },
		"2025-01-02T00:00:00.000Z|0",
	);

	const merged = mergeDocs(doc1, doc2);
	const decoded = decodeDoc(merged);

	expect(decoded["~data"]).toBeDefined();
	expect(merged["~data"]).toBeDefined();
});

test("deleteDoc marks document as deleted with eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0";
	const doc = encodeDoc("user-1", { name: "Alice", age: 30 }, eventstamp);
	const deleteEventstamp = "2025-01-02T00:00:00.000Z|1";

	const deleted = deleteDoc(doc, deleteEventstamp);

	expect(deleted["~deletedAt"]).toBe(deleteEventstamp);
	expect(deleted["~id"]).toBe("user-1");
	expect(deleted["~data"]).toEqual(doc["~data"]);
});

test("deleteDoc preserves original document id and data", () => {
	const doc = encodeDoc(
		"doc-123",
		{ status: "active" },
		"2025-01-01T00:00:00.000Z|0",
	);

	const deleted = deleteDoc(doc, "2025-01-02T00:00:00.000Z|1");

	expect(deleted["~id"]).toBe("doc-123");
	expect(deleted["~data"]).toBe(doc["~data"]);
});

test("deleteDoc can be called on already deleted document", () => {
	const doc = encodeDoc(
		"user-1",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0",
	);
	doc["~deletedAt"] = "2025-01-02T00:00:00.000Z|1";

	const redeleted = deleteDoc(doc, "2025-01-03T00:00:00.000Z|2");

	expect(redeleted["~deletedAt"]).toBe("2025-01-03T00:00:00.000Z|2");
});

test("deleteDoc with decodeDoc shows document is deleted", () => {
	const doc = encodeDoc(
		"user-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	const deleted = deleteDoc(doc, "2025-01-02T00:00:00.000Z|1");
	const decoded = decodeDoc(deleted);

	expect(decoded["~deletedAt"]).toBe("2025-01-02T00:00:00.000Z|1");
	expect(decoded["~data"]).toEqual({ name: "Alice" });
});

// === Primitive Document Tests ===

test("encodeDoc primitive (string) creates valid EncodedDocument", () => {
	const result = encodeDoc("msg-1", "hello", "2025-01-01T00:00:00.000Z|0");

	expect(result["~id"]).toBe("msg-1");
	expect(result["~deletedAt"]).toBe(null);
	expect(result["~data"]).toBeDefined();
});

test("encodeDoc/decodeDoc primitive (string) round-trip", () => {
	const original = "hello world";
	const encoded = encodeDoc("key-1", original, "2025-01-01T00:00:00.000Z|0");
	const decoded = decodeDoc<string>(encoded);

	expect(decoded["~id"]).toBe("key-1");
	expect(decoded["~data"]).toBe(original);
	expect(decoded["~deletedAt"]).toBe(null);
});

test("encodeDoc/decodeDoc primitive (number) round-trip", () => {
	const original = 42;
	const encoded = encodeDoc("count-1", original, "2025-01-01T00:00:00.000Z|0");
	const decoded = decodeDoc<number>(encoded);

	expect(decoded["~id"]).toBe("count-1");
	expect(decoded["~data"]).toBe(original);
});

test("encodeDoc/decodeDoc primitive (boolean) round-trip", () => {
	const original = true;
	const encoded = encodeDoc("flag-1", original, "2025-01-01T00:00:00.000Z|0");
	const decoded = decodeDoc<boolean>(encoded);

	expect(decoded["~id"]).toBe("flag-1");
	expect(decoded["~data"]).toBe(original);
});

test("mergeDocs primitives - newer eventstamp wins", () => {
	const doc1 = encodeDoc(
		"count-1",
		100,
		"2025-01-01T00:00:00.000Z|0", // older
	);
	const doc2 = encodeDoc(
		"count-1",
		200,
		"2025-01-02T00:00:00.000Z|0", // newer
	);

	const merged = mergeDocs(doc1, doc2);
	const decoded = decodeDoc<number>(merged);

	// Newer value (200) should win
	expect(decoded["~data"]).toBe(200);
});

test("mergeDocs primitives - newer eventstamp wins (reverse order)", () => {
	const doc1 = encodeDoc(
		"msg-1",
		"new message",
		"2025-01-02T00:00:00.000Z|0", // newer
	);
	const doc2 = encodeDoc(
		"msg-1",
		"old message",
		"2025-01-01T00:00:00.000Z|0", // older
	);

	const merged = mergeDocs(doc1, doc2);
	const decoded = decodeDoc<string>(merged);

	// Newer value ("new message") should win
	expect(decoded["~data"]).toBe("new message");
});

test("mergeDocs primitives with equal eventstamps uses from value", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0";
	const doc1 = encodeDoc("key-1", "first", eventstamp);
	const doc2 = encodeDoc("key-1", "second", eventstamp);

	const merged = mergeDocs(doc1, doc2);
	const decoded = decodeDoc<string>(merged);

	// With equal timestamps, from value (second parameter) is used
	expect(decoded["~data"]).toBe("second");
});

test("deleteDoc primitive document works correctly", () => {
	const doc = encodeDoc("count-1", 42, "2025-01-01T00:00:00.000Z|0");
	const deleted = deleteDoc(doc, "2025-01-02T00:00:00.000Z|1");

	expect(deleted["~deletedAt"]).toBe("2025-01-02T00:00:00.000Z|1");
	expect(deleted["~id"]).toBe("count-1");

	const decoded = decodeDoc<number>(deleted);
	expect(decoded["~data"]).toBe(42);
	expect(decoded["~deletedAt"]).not.toBeNull();
});

test("mergeDocs throws error when merging primitive with object", () => {
	const primitiveDoc = encodeDoc(
		"key-1",
		"hello",
		"2025-01-01T00:00:00.000Z|0",
	);
	const objectDoc = encodeDoc(
		"key-1",
		{ name: "Alice" },
		"2025-01-02T00:00:00.000Z|0",
	);

	expect(() => mergeDocs(primitiveDoc, objectDoc)).toThrow(
		"Merge error: Incompatible types",
	);
});

test("mergeDocs throws error when merging object with primitive", () => {
	const objectDoc = encodeDoc(
		"key-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	const primitiveDoc = encodeDoc(
		"key-1",
		"hello",
		"2025-01-02T00:00:00.000Z|0",
	);

	expect(() => mergeDocs(objectDoc, primitiveDoc)).toThrow(
		"Merge error: Incompatible types",
	);
});
