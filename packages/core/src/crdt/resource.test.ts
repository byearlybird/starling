import { expect, test } from "bun:test";
import { decodeResource, deleteResource, encodeResource, mergeResources } from ".";

test("encodeResource creates EncodedDocument with null deletedAt", () => {
	const result = encodeResource(
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

test("encodeResource with id", () => {
	const result = encodeResource(
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

test("decodeResource returns original data structure", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const original = { name: "Charlie", score: 100 };
	const encoded = encodeResource("users", "user-3", original, eventstamp);
	const decoded = decodeResource(encoded);

	expect(decoded.id).toBe("user-3");
	expect(decoded.type).toBe("users");
	expect(decoded.deletedAt).toBe(null);
	expect(decoded.data).toEqual(original);
});

test("mergeResources both deleted - keeps greater timestamp", () => {
	const eventstamp1 = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const eventstamp2 = "2025-01-02T00:00:00.000Z|0000|c3d4";

	const doc1 = encodeResource("items", "doc-1", { name: "Alice" }, eventstamp1);
	doc1.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const doc2 = encodeResource("items", "doc-2", { name: "Bob" }, eventstamp2);
	doc2.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const [merged, eventstamp] = mergeResources(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeResources both deleted - keeps greater timestamp (reverse order)", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const doc2 = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const [merged, eventstamp] = mergeResources(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeResources one deleted - keeps the deleted one", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = "2025-01-01T12:00:00.000Z|0001|g7h8";

	const doc2 = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = null;

	const [merged, eventstamp] = mergeResources(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-01T12:00:00.000Z|0001|g7h8");
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("mergeResources one deleted (from) - keeps the deleted one", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc1.meta.deletedAt = null;

	const doc2 = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);
	doc2.meta.deletedAt = "2025-01-02T12:00:00.000Z|0002|i9j0";

	const [merged, eventstamp] = mergeResources(doc1, doc2);

	expect(merged.meta.deletedAt).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
	expect(eventstamp).toBe("2025-01-02T12:00:00.000Z|0002|i9j0");
});

test("mergeResources neither deleted - returns null", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged, eventstamp] = mergeResources(doc1, doc2);

	expect(merged.meta.deletedAt).toBe(null);
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("mergeResources preserves id from into document", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const doc2 = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged] = mergeResources(doc1, doc2);

	expect(merged.id).toBe("doc-1");
});

test("mergeResources merges attributes using object mergeRecords", () => {
	const doc1 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice Updated", email: "alice@example.com" },
		"2025-01-02T00:00:00.000Z|0000|c3d4",
	);

	const [merged, eventstamp] = mergeResources(doc1, doc2);
	const decoded = decodeResource(merged);

	expect(decoded.data).toBeDefined();
	expect(merged.attributes).toBeDefined();
	expect(eventstamp).toBe("2025-01-02T00:00:00.000Z|0000|c3d4");
});

test("deleteResource marks document as deleted with eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const doc = encodeResource("users", "user-1", { name: "Alice", age: 30 }, eventstamp);
	const deleteEventstamp = "2025-01-02T00:00:00.000Z|1";

	const deleted = deleteResource(doc, deleteEventstamp);

	expect(deleted.meta.deletedAt).toBe(deleteEventstamp);
	expect(deleted.id).toBe("user-1");
	expect(deleted.attributes).toEqual(doc.attributes);
});

test("deleteResource preserves original document id and data", () => {
	const doc = encodeResource(
		"items",
		"doc-123",
		{ status: "active" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const deleted = deleteResource(doc, "2025-01-02T00:00:00.000Z|1");

	expect(deleted.id).toBe("doc-123");
	expect(deleted.attributes).toBe(doc.attributes);
});

test("deleteResource can be called on already deleted document", () => {
	const doc = encodeResource(
		"users",
		"user-1",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	doc.meta.deletedAt = "2025-01-02T00:00:00.000Z|1";

	const redeleted = deleteResource(doc, "2025-01-03T00:00:00.000Z|0002|e5f6");

	expect(redeleted.meta.deletedAt).toBe("2025-01-03T00:00:00.000Z|0002|e5f6");
});

test("deleteResource with decodeResource shows document is deleted", () => {
	const doc = encodeResource(
		"users",
		"user-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const deleted = deleteResource(doc, "2025-01-02T00:00:00.000Z|1");
	const decoded = decodeResource(deleted);

	expect(decoded.deletedAt).toBe("2025-01-02T00:00:00.000Z|1");
	expect(decoded.data).toEqual({ name: "Alice" });
});

test("mergeResources bubbles newest eventstamp from nested object fields", () => {
	const doc1 = encodeResource(
		"users",
		"doc-1",
		{ user: { name: "Alice", email: "alice@old.com" } },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeResource(
		"users",
		"doc-1",
		{ user: { email: "alice@new.com" } },
		"2025-01-05T00:00:00.000Z|0000|k1l2", // Much newer
	);

	const [merged, eventstamp] = mergeResources(doc1, doc2);
	const decoded = decodeResource<{
		user: { name: string; email: string };
	}>(merged);

	// The newest eventstamp should bubble up to mergeResources
	expect(eventstamp).toBe("2025-01-05T00:00:00.000Z|0000|k1l2");
	// And the merge should work correctly
	expect(decoded.data.user.name).toBe("Alice");
	expect(decoded.data.user.email).toBe("alice@new.com");
});

test("mergeResources returns newest eventstamp even with multiple nested changes", () => {
	const doc1 = encodeResource(
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
	const doc2 = encodeResource(
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

	const [, eventstamp] = mergeResources(doc1, doc2);

	// Even with multiple nested changes, newest eventstamp bubbles up
	expect(eventstamp).toBe("2025-01-10T00:00:00.000Z|0000|o5p6");
});

test("mergeResources returns newest eventstamp when adding new fields", () => {
	const doc1 = encodeResource(
		"users",
		"doc-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	const doc2 = encodeResource(
		"users",
		"doc-1",
		{ email: "alice@example.com", phone: "555-1234" },
		"2025-01-08T00:00:00.000Z|0000|m3n4", // Newer
	);

	const [, eventstamp] = mergeResources(doc1, doc2);

	expect(eventstamp).toBe("2025-01-08T00:00:00.000Z|0000|m3n4");
});
