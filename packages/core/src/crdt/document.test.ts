import { expect, test } from "bun:test";
import { decodeDoc, deleteDoc, encodeDoc, mergeDocs } from ".";

test("encodeDoc creates EncodedDocument with null deletedAt", () => {
	const result = encodeDoc(
		"users",
		"user-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	expect(result.id).toBe("user-1");
	expect(result.type).toBe("users");
	expect(result.meta.deletedAt).toBe(null);
	expect(result.attributes).toBeDefined();
});

test("encodeDoc with id", () => {
	const result = encodeDoc(
		"users",
		"user-2",
		{ name: "Bob", email: "bob@example.com" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	expect(result.id).toBe("user-2");
	expect(result.type).toBe("users");
	expect(result.meta.deletedAt).toBe(null);
	expect(result.attributes).toBeDefined();
});

test("decodeDoc returns original data structure", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const original = { name: "Charlie", score: 100 };
	const encoded = encodeDoc("users", "user-3", original, eventstamp);
	const decoded = decodeDoc(encoded);

	expect(decoded.id).toBe("user-3");
	expect(decoded.type).toBe("users");
	expect(decoded.deletedAt).toBe(null);
	expect(decoded.data).toEqual(original);
});

test("mergeDocs both deleted - keeps greater timestamp", () => {
	const eventstamp1 = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const eventstamp2 = "2025-01-02T00:00:00.000Z|0000|c3d4";

	const doc1 = encodeDoc("items", "doc-1", { name: "Alice" }, eventstamp1);
	doc1.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const doc2 = encodeDoc("items", "doc-2", { name: "Bob" }, eventstamp2);
	doc2.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const [merged, eventstamp] = mergeDocs(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeDocs both deleted - keeps greater timestamp (reverse order)", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const doc2 = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const [merged, eventstamp] = mergeDocs(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeDocs one deleted - keeps the deleted one", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const doc2 = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = null;

	const [merged, eventstamp] = mergeDocs(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-01T12:00:00.000Z|0001|g7h8");
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("mergeDocs one deleted (from) - keeps the deleted one", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = null;

	const doc2 = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const [merged, eventstamp] = mergeDocs(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeDocs neither deleted - returns null", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged, eventstamp] = mergeDocs(doc1, doc2);

	expect(merged.meta.deletedAt).toBe(null);
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("mergeDocs preserves id from into document", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const doc2 = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged] = mergeDocs(doc1, doc2);

	expect(merged.id).toBe("doc-1");
});

test("mergeDocs merges attributes using object mergeRecords", () => {
	const doc1 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice Updated", email: "alice@example.com" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged, eventstamp] = mergeDocs(doc1, doc2);
	const decoded = decodeDoc(merged);

	expect(decoded.data).toBeDefined();
	expect(merged.attributes).toBeDefined();
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("deleteDoc marks document as deleted with eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const doc = encodeDoc("users", "user-1", { name: "Alice", age: 30 }, eventstamp);
	const deleteEventstamp = "2025-01-02T00:00:00.000Z|1";

	const deleted = deleteDoc(doc, deleteEventstamp);

	expect(deleted.meta.deletedAt).toBe(deleteEventstamp);
	expect(deleted.id).toBe("user-1");
	expect(deleted.attributes).toEqual(doc.attributes);
});

test("deleteDoc preserves original document id and data", () => {
	const doc = encodeDoc(
		"items",
		"doc-123",
		{ status: "active" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const deleted = deleteDoc(doc, "2025-01-02T00:00:00.000Z|1");

	expect(deleted.id).toBe("doc-123");
	expect(deleted.attributes).toBe(doc.attributes);
});

test("deleteDoc can be called on already deleted document", () => {
	const doc = encodeDoc(
		"users",
		"user-1",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc.meta.deletedAt = "2025-01-02T00:00:00.000Z|1";

	const redeleted = deleteDoc(doc, "2025-01-03T00:00:00.000Z|0002|e5f6");

	expect(redeleted.meta.deletedAt).toBe("2025-01-03T00:00:00.000Z|0002|e5f6");
});

test("deleteDoc with decodeDoc shows document is deleted", () => {
	const doc = encodeDoc(
		"users",
		"user-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const deleted = deleteDoc(doc, "2025-01-02T00:00:00.000Z|1");
	const decoded = decodeDoc(deleted);

	expect(decoded.deletedAt).toBe("2025-01-02T00:00:00.000Z|1");
	expect(decoded.data).toEqual({ name: "Alice" });
});

test("mergeDocs bubbles newest eventstamp from nested object fields", () => {
	const doc1 = encodeDoc(
		"users",
		"doc-1",
		{ user: { name: "Alice", email: "alice@old.com" } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeDoc(
		"users",
		"doc-1",
		{ user: { email: "alice@new.com" } },
		"2025-01-05T00:00:00.000Z|0000|k1l2", // Much newer
	);

	const [merged, eventstamp] = mergeDocs(doc1, doc2);
	const decoded = decodeDoc<{
		user: { name: string; email: string };
	}>(merged);

	// The newest eventstamp should bubble up to mergeDocs
	expect(eventstamp).toBe("2025-01-05T00:00:00.000Z|0000|k1l2");
	// And the merge should work correctly
	expect(decoded.data.user.name).toBe("Alice");
	expect(decoded.data.user.email).toBe("alice@new.com");
});

test("mergeDocs returns newest eventstamp even with multiple nested changes", () => {
	const doc1 = encodeDoc(
		"users",
		"doc-1",
		{
			profile: {
				personal: { name: "Alice" },
				settings: { theme: "dark" },
			},
		},
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeDoc(
		"users",
		"doc-1",
		{
			profile: {
				personal: { name: "Alice Updated" },
				settings: { theme: "light" },
			},
		},
		"2025-01-10T00:00:00.000Z|0000|o5p6", // Much newer timestamp
	);

	const [, eventstamp] = mergeDocs(doc1, doc2);

	// Even with multiple nested changes, newest eventstamp bubbles up
	expect(eventstamp).toBe("2025-01-10T00:00:00.000Z|0000|o5p6");
});

test("mergeDocs returns newest eventstamp when adding new fields", () => {
	const doc1 = encodeDoc(
		"users",
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeDoc(
		"users",
		"doc-1",
		{ email: "alice@example.com", phone: "555-1234" },
		"2025-01-08T00:00:00.000Z|0000|m3n4", // Newer
	);

	const [, eventstamp] = mergeDocs(doc1, doc2);

	expect(eventstamp).toBe("2025-01-08T00:00:00.000Z|0000|m3n4");
});
