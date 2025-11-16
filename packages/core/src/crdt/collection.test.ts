import { expect, test } from "bun:test";
import {
	type Collection,
	createCollection,
	mergeCollections,
} from "./collection";
import { encodeDoc } from "./document";

test("createCollection returns empty collection with given eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const collection = createCollection(eventstamp);

	expect(collection.data).toEqual([]);
	expect(collection.meta.eventstamp).toBe(eventstamp);
	expect(collection.jsonapi.version).toBe("1.1");
});

test("mergeCollections with empty collections", () => {
	const into = createCollection("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = createCollection("2025-01-01T00:05:00.000Z|0001|c3d4");

	const result = mergeCollections(into, from);

	expect(result.collection.data).toEqual([]);
	expect(result.collection.meta.eventstamp).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections forwards clock to newer eventstamp", () => {
	const into = createCollection("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = createCollection("2025-01-01T00:10:00.000Z|0002|e5f6");

	const result = mergeCollections(into, from);

	expect(result.collection.meta.eventstamp).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeCollections keeps older eventstamp when into is newer", () => {
	const into = createCollection("2025-01-01T00:10:00.000Z|0002|e5f6");
	const from = createCollection("2025-01-01T00:00:00.000Z|0000|a1b2");

	const result = mergeCollections(into, from);

	expect(result.collection.meta.eventstamp).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeCollections adds new document from source", () => {
	const into = createCollection("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.collection.data[0]?.id).toBe("doc-1");
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("doc-1")).toBe(true);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections updates existing document", () => {
	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};
	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeDoc("items", "doc-1", { age: 31 }, "2025-01-01T00:05:00.000Z|0001|c3d4"),
		],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections marks document as deleted", () => {
	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [deletedDoc],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.collection.data[0]?.meta.deletedAt).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc-1")).toBe(true);
});

test("mergeCollections keeps deleted document deleted on update", () => {
	const deletedDoc = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:02:00.000Z|0001|b2c3";

	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:02:00.000Z|0001|b2c3" },
		data: [deletedDoc],
	};

	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0002|c3d4" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice Updated" },
				"2025-01-01T00:05:00.000Z|0002|c3d4",
			),
		],
	};

	const result = mergeCollections(into, from);

	// Deletion is final: document stays deleted, but data is merged internally
	expect(result.collection.data.length).toBe(1);
	expect(result.collection.data[0]?.meta.deletedAt).toBe(
		"2025-01-01T00:02:00.000Z|0001|b2c3",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections does not track deleted documents as added", () => {
	const into = createCollection("2025-01-01T00:00:00.000Z|0000|a1b2");

	const deletedDoc = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [deletedDoc],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections merges multiple documents with mixed operations", () => {
	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeDoc(
				"items",
				"doc-2",
				{ name: "Bob", age: 25 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = encodeDoc(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeDoc("items", "doc-1", { age: 31 }, "2025-01-01T00:05:00.000Z|0001|c3d4"), // update
			deletedDoc, // delete
			encodeDoc(
				"items",
				"doc-3",
				{ name: "Charlie", age: 28 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // add
		],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(3);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("doc-3")).toBe(true);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc-2")).toBe(true);
});

test("mergeCollections preserves documents only in base collection", () => {
	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			encodeDoc("items", "doc-2", { name: "Bob" }, "2025-01-01T00:00:00.000Z|0000|a1b2"),
		],
	};
	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeDoc(
				"items",
				"doc-3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(3);
	const ids = result.collection.data.map((doc) => doc.id);
	expect(ids).toContain("doc-1");
	expect(ids).toContain("doc-2");
	expect(ids).toContain("doc-3");
});

test("mergeCollections does not mark unchanged documents as updated", () => {
	const doc = encodeDoc(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};
	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeCollections field-level LWW for nested objects", () => {
	const into: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ name: "Alice", email: "alice@old.com" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const from: Collection = {
		jsonapi: { version: "1.1" },
		meta: { eventstamp: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			encodeDoc(
				"items",
				"doc-1",
				{ email: "alice@new.com" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeCollections(into, from);

	expect(result.collection.data.length).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("doc-1")).toBe(true);
});
