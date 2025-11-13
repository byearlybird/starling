import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { encodeResource } from "./resource";
import { encodeValue } from "./value";

test("createDocument returns empty document with given eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const document = createDocument(eventstamp);

	expect(document.data).toEqual([]);
	expect(document.meta["~eventstamp"]).toBe(eventstamp);
});

test("mergeDocuments with empty documents", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = createDocument("2025-01-01T00:05:00.000Z|0001|c3d4");

	const result = mergeDocuments(into, from);

	expect(result.document.data).toEqual([]);
	expect(result.document.meta["~eventstamp"]).toBe(
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

	expect(result.document.meta["~eventstamp"]).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments keeps older eventstamp when into is newer", () => {
	const into = createDocument("2025-01-01T00:10:00.000Z|0002|e5f6");
	const from = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");

	const result = mergeDocuments(into, from);

	expect(result.document.meta["~eventstamp"]).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments adds new document from source", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
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
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};
	const from: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
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
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const deletedDoc = encodeResource(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta["~deletedAt"] = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		data: [deletedDoc],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc-1")).toBe(true);
});

test("mergeDocuments keeps deleted document deleted on update", () => {
	const deletedDoc = encodeResource(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta["~deletedAt"] = "2025-01-01T00:02:00.000Z|0001|b2c3";

	const into: Document = {
		data: [deletedDoc],
		meta: { "~eventstamp": "2025-01-01T00:02:00.000Z|0001|b2c3" },
	};

	const from: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice Updated" },
				"2025-01-01T00:05:00.000Z|0002|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0002|c3d4" },
	};

	const result = mergeDocuments(into, from);

	// Deletion is final: document stays deleted, but data is merged internally
	expect(result.document.data.length).toBe(1);
	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(
		"2025-01-01T00:02:00.000Z|0001|b2c3",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments does not track deleted documents as added", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");

	const deletedDoc = encodeResource(
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	deletedDoc.meta["~deletedAt"] = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		data: [deletedDoc],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments merges multiple documents with mixed operations", () => {
	const into: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeResource(
				"doc-2",
				{ name: "Bob", age: 25 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const deletedDoc = encodeResource(
		"doc-2",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta["~deletedAt"] = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // update
			deletedDoc, // delete
			encodeResource(
				"doc-3",
				{ name: "Charlie", age: 28 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // add
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
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
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeResource(
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};
	const from: Document = {
		data: [
			encodeResource(
				"doc-3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
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
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const into: Document = {
		data: [doc],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};
	const from: Document = {
		data: [doc],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments field-level LWW for nested objects", () => {
	const into: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ name: "Alice", email: "alice@old.com" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const from: Document = {
		data: [
			encodeResource(
				"doc-1",
				{ email: "alice@new.com" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
});

test("mergeDocuments with primitive values", () => {
	const into: Document = {
		data: [
			{
				type: "resource",
				id: "doc-1",
				attributes: encodeValue("hello", "2025-01-01T00:00:00.000Z|0000|a1b2"),
				meta: { "~deletedAt": null },
			},
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const from: Document = {
		data: [
			{
				type: "resource",
				id: "doc-1",
				attributes: encodeValue("world", "2025-01-01T00:05:00.000Z|0001|c3d4"),
				meta: { "~deletedAt": null },
			},
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
});
