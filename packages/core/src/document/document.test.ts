import { expect, test } from "bun:test";
import { type Document, makeDocument, mergeDocuments } from "./document";
import { makeResource } from "./resource";

test("makeDocument returns empty collection with given eventstamp", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const collection = makeDocument<Record<string, unknown>>(eventstamp);

	expect(collection.data).toEqual([]);
	expect(collection.meta.latest).toBe(eventstamp);
	expect(collection.jsonapi.version).toBe("1.1");
});

test("mergeDocuments with empty collections", () => {
	const into = makeDocument<Record<string, unknown>>("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = makeDocument<Record<string, unknown>>("2025-01-01T00:05:00.000Z|0001|c3d4");

	const result = mergeDocuments(into, from);

	expect(result.document.data).toEqual([]);
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments forwards clock to newer eventstamp", () => {
	const into = makeDocument<Record<string, unknown>>("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from = makeDocument<Record<string, unknown>>("2025-01-01T00:10:00.000Z|0002|e5f6");

	const result = mergeDocuments(into, from);

	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments keeps older eventstamp when into is newer", () => {
	const into = makeDocument<Record<string, unknown>>("2025-01-01T00:10:00.000Z|0002|e5f6");
	const from = makeDocument<Record<string, unknown>>("2025-01-01T00:00:00.000Z|0000|a1b2");

	const result = mergeDocuments(into, from);

	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:10:00.000Z|0002|e5f6",
	);
});

test("mergeDocuments adds new document from source", () => {
	const into = makeDocument<Record<string, unknown>>("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
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
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};
	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
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
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = makeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
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
	const deletedDoc = makeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:02:00.000Z|0001|b2c3";

	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:02:00.000Z|0001|b2c3" },
		data: [deletedDoc],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0002|c3d4" },
		data: [
			makeResource(
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
	const into = makeDocument<Record<string, unknown>>("2025-01-01T00:00:00.000Z|0000|a1b2");

	const deletedDoc = makeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [deletedDoc],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments merges multiple documents with mixed operations", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			makeResource(
				"items",
				"doc-2",
				{ name: "Bob", age: 25 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = makeResource(
		"items",
		"doc-2",
		{ name: "Bob" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:05:00.000Z|0001|c3d4";

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			), // update
			deletedDoc, // delete
			makeResource(
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
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			makeResource(
				"items",
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};
	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
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
	const doc = makeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);

	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};
	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [doc],
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments field-level LWW for nested objects", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice", email: "alice@old.com" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
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

test("mergeDocuments detects no changes when content is identical", () => {
	const eventstamp = "2025-01-01T00:00:00.000Z|0000|a1b2";
	const resource = makeResource(
		"items",
		"doc-1",
		{ name: "Alice", age: 30 },
		eventstamp,
	);

	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: eventstamp },
		data: [resource],
	};

	// Create a copy of the document with identical content but different object reference
	const fromResource = makeResource(
		"items",
		"doc-1",
		{ name: "Alice", age: 30 },
		eventstamp,
	);

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: eventstamp },
		data: [fromResource],
	};

	const result = mergeDocuments(into, from);

	// Should have 1 resource but no changes tracked
	expect(result.document.data.length).toBe(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

// Document-level cache validation tests

test("mergeDocuments: document meta.latest matches max of resource meta.latest values", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
			makeResource(
				"items",
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:02:00.000Z|0000|e5f6",
			),
		],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:05:00.000Z|0001|c3d4" },
		data: [
			makeResource(
				"items",
				"doc-3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|c3d4",
			),
		],
	};

	const result = mergeDocuments(into, from);

	// Compute max from all resources
	const maxResourceLatest = result.document.data.reduce((max, resource) => {
		return resource.meta.latest > max ? resource.meta.latest : max;
	}, "");

	expect(result.document.meta.latest).toBe(maxResourceLatest);
	// Should be the newest resource eventstamp
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:05:00.000Z|0001|c3d4",
	);
});

test("mergeDocuments: document meta.latest after adding new resource", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:10:00.000Z|0002|i9j0" },
		data: [
			makeResource(
				"items",
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:10:00.000Z|0002|i9j0",
			),
		],
	};

	const result = mergeDocuments(into, from);

	// Compute max from all resources
	const maxResourceLatest = result.document.data.reduce((max, resource) => {
		return resource.meta.latest > max ? resource.meta.latest : max;
	}, "");

	expect(result.document.meta.latest).toBe(maxResourceLatest);
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:10:00.000Z|0002|i9j0",
	);
});

test("mergeDocuments: document meta.latest after update", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice", age: 30 },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:08:00.000Z|0001|g7h8" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ age: 31 },
				"2025-01-01T00:08:00.000Z|0001|g7h8",
			),
		],
	};

	const result = mergeDocuments(into, from);

	// Compute max from all resources
	const maxResourceLatest = result.document.data.reduce((max, resource) => {
		return resource.meta.latest > max ? resource.meta.latest : max;
	}, "");

	expect(result.document.meta.latest).toBe(maxResourceLatest);
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:08:00.000Z|0001|g7h8",
	);
});

test("mergeDocuments: document meta.latest with deleted resource", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:00:00.000Z|0000|a1b2" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:00:00.000Z|0000|a1b2",
			),
		],
	};

	const deletedDoc = makeResource(
		"items",
		"doc-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0000|a1b2",
	);
	deletedDoc.meta.deletedAt = "2025-01-01T00:12:00.000Z|0003|k1l2";

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:12:00.000Z|0003|k1l2" },
		data: [deletedDoc],
	};

	const result = mergeDocuments(into, from);

	// Compute max from all resources (including deletedAt in resource meta.latest)
	const maxResourceLatest = result.document.data.reduce((max, resource) => {
		return resource.meta.latest > max ? resource.meta.latest : max;
	}, "");

	expect(result.document.meta.latest).toBe(maxResourceLatest);
	// Should include the deletion eventstamp
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:12:00.000Z|0003|k1l2",
	);
});

test("mergeDocuments: document meta.latest with multiple resources at different times", () => {
	const into: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:03:00.000Z|0001|c3d4" },
		data: [
			makeResource(
				"items",
				"doc-1",
				{ name: "Alice" },
				"2025-01-01T00:01:00.000Z|0000|a1b2",
			),
			makeResource(
				"items",
				"doc-2",
				{ name: "Bob" },
				"2025-01-01T00:03:00.000Z|0001|c3d4",
			),
		],
	};

	const from: Document<Record<string, unknown>> = {
		jsonapi: { version: "1.1" },
		meta: { latest: "2025-01-01T00:07:00.000Z|0002|g7h8" },
		data: [
			makeResource(
				"items",
				"doc-3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|e5f6",
			),
			makeResource(
				"items",
				"doc-4",
				{ name: "Dave" },
				"2025-01-01T00:07:00.000Z|0002|g7h8",
			),
		],
	};

	const result = mergeDocuments(into, from);

	// Compute max from all resources
	const maxResourceLatest = result.document.data.reduce((max, resource) => {
		return resource.meta.latest > max ? resource.meta.latest : max;
	}, "");

	expect(result.document.meta.latest).toBe(maxResourceLatest);
	// Should be the newest resource eventstamp across all resources
	expect(result.document.meta.latest).toBe(
		"2025-01-01T00:07:00.000Z|0002|g7h8",
	);
});
