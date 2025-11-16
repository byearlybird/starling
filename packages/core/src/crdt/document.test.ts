import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { encodeResource } from "./resource";

test("createDocument returns empty collection with given eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const collection = createDocument(eventstamp);

	expect(collection.data).toEqual([]);
	expect(collection.meta.eventstamp).toBe(eventstamp);
	expect(collection.jsonapi.version).toBe("1.1");
});

test("mergeDocuments with empty collections", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = createDocument("2025-01-01T00:05:00.000Z|0001|c3d4");

	const result = mergeDocuments(into, from);

	expect(result.document.data).toEqual([]);
	expect(result.document.meta.eventstamp).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments forwards clock to newer eventstamp", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = createDocument("2025-01-01T00:10:00.000Z|0002|e5f6");

	const result = mergeDocuments(into, from);

	expect(result.document.meta.eventstamp).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments keeps older eventstamp when into is newer", () => {
	const into = createDocument("2025-01-01T00:10:00.000Z|0002|e5f6");
	const from = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");

	const result = mergeDocuments(into, from);

	expect(result.document.meta.eventstamp).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments adds new document from source", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.document.data[0]?.id).toBe("doc-1");
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("doc-1")).toBe(true);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments updates existing document", () => {
	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};
	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments marks document as deleted", () => {
	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [deletedDoc],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.document.data[0]?.meta.deletedAt).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc-1")).toBe(true);
});

test("mergeDocuments keeps deleted document deleted on update", () => {
	const deletedDoc = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:02:00.000Z|0001|b2c3";

	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:02:00.000Z|0001|b2c3" },
		data: [deletedDoc],
	};

	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0002|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice Updated" },
				"2025-01-01T00:05:00.000Z|0002|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	// Deletion is final: document stays deleted, but data is merged internally
	expect(result.document.data.length).toBe(1);
	expect(result.document.data[0]?.meta.deletedAt).toBe(
		"2025-01-01T00:02:00.000Z|0001|b2c3",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments does not track deleted documents as added", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");

	const deletedDoc = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [deletedDoc],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments merges multiple documents with mixed operations", () => {
	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeResource(
				"items",
				"doc-2",
				{ name: "Bob", age: 25 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = encodeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // update
			deletedDoc, // delete
			encodeResource(
				"items",
				"doc-3",
				{ name: "Charlie", age: 28 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // add
		],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(3);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("doc-3")).toBe(true);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc-2")).toBe(true);
});

test("mergeDocuments preserves documents only in base collection", () => {
	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeResource(
				"items",
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};
	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(3);
	const ids = result.document.data.map((doc) => doc.id);
	expect(ids).toContain("doc-1");
	expect(ids).toContain("doc-2");
	expect(ids).toContain("doc-3");
});

test("mergeDocuments does not mark unchanged documents as updated", () => {
	const doc = encodeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};
	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments field-level LWW for nested objects", () => {
	const into: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ name: "Alice", email: "alice@old.com" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const from: Document = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeResource(
				"items",
				"doc-1",
				{ email: "alice@new.com" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
});
