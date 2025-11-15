import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { createResource } from "./resource";

const RESOURCE_TYPE = "users";

function buildResource(
	id: string,
	data: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
) {
	return createResource(RESOURCE_TYPE, id, data, eventstamp, deletedAt);
}

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

test("mergeDocuments adds new resource objects", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Document = {
	data: [
		buildResource("doc1", { name: "Alice" }, "2025-01-01T00:01:00.000Z|0000|c3d4"),
	],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(1);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.get("doc1")).toBeDefined();
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments tracks added resources that are not deleted", () => {
	const into = createDocument("2025-01-01T00:00:00.000Z|0000|a1b2");
	const from: Document = {
		data: [
			buildResource("doc1", { name: "Alice" }, "2025-01-01T00:01:00.000Z|0000|c3d4"),
			buildResource(
				"doc2",
				{ name: "Bob" },
				"2025-01-01T00:01:00.000Z|0000|c3d4",
				"2025-01-01T00:01:00.000Z|0000|c3d4",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(2);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.get("doc1")).toBeDefined();
	expect(result.changes.added.get("doc2")).not.toBeDefined(); // Deleted, so not tracked as added
});

test("mergeDocuments updates existing resource objects", () => {
const resource1 = buildResource(
	"doc1",
	{ name: "Alice", age: 30 },
	"2025-01-01T00:00:00.000Z|0000|a1b2",
);
	const into: Document = {
		data: [resource1],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

const resource2 = buildResource(
	"doc1",
	{ name: "Bob", age: 25 },
	"2025-01-01T00:01:00.000Z|0000|c3d4",
);
	const from: Document = {
		data: [resource2],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments tracks deletions", () => {
const resource1 = buildResource(
	"doc1",
	{ name: "Alice" },
	"2025-01-01T00:00:00.000Z|0000|a1b2",
);
	const into: Document = {
		data: [resource1],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

const resource2 = buildResource(
	"doc1",
	{ name: "Alice" },
	"2025-01-01T00:01:00.000Z|0000|c3d4",
	"2025-01-01T00:01:00.000Z|0000|c3d4",
);
	const from: Document = {
		data: [resource2],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(1);
	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(
		"2025-01-01T00:01:00.000Z|0000|c3d4",
	);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc1")).toBe(true);
});

test("mergeDocuments does not restore deleted resources on update", () => {
const resource1 = buildResource(
	"doc1",
	{ name: "Alice" },
	"2025-01-01T00:00:00.000Z|0000|a1b2",
	"2025-01-01T00:00:30.000Z|0000|x1y2",
);
	const into: Document = {
		data: [resource1],
		meta: { "~eventstamp": "2025-01-01T00:00:30.000Z|0000|x1y2" },
	};

const resource2 = buildResource(
	"doc1",
	{ name: "Bob" },
	"2025-01-01T00:01:00.000Z|0000|c3d4",
);
	const from: Document = {
		data: [resource2],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	// Resource should merge but stay deleted
	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(
		"2025-01-01T00:00:30.000Z|0000|x1y2",
	);
	expect(result.changes.deleted.size).toBe(0); // Not a new deletion, already deleted
	expect(result.changes.updated.size).toBe(0); // Not tracked as update while deleted
});

test("mergeDocuments handles multiple resources", () => {
	const into: Document = {
		data: [
			buildResource("doc1", { name: "Alice", age: 30 }, "2025-01-01T00:00:00.000Z|0000|a1b2"),
			buildResource("doc2", { name: "Bob", age: 25 }, "2025-01-01T00:00:00.000Z|0000|a1b2"),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const from: Document = {
		data: [
			buildResource("doc1", { name: "Alice", age: 31 }, "2025-01-01T00:01:00.000Z|0000|c3d4"),
			buildResource("doc3", { name: "Charlie" }, "2025-01-01T00:01:00.000Z|0000|c3d4"),
		],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(3);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments uses field-level LWW for resource data", () => {
	const into: Document = {
		data: [
			buildResource("doc1", { name: "Alice", age: 30 }, "2025-01-01T00:00:00.000Z|0000|a1b2"),
		],
		meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|a1b2" },
	};

	const from: Document = {
		data: [
			buildResource("doc1", { name: "Bob", email: "bob@example.com" }, "2025-01-01T00:01:00.000Z|0000|c3d4"),
		],
		meta: { "~eventstamp": "2025-01-01T00:01:00.000Z|0000|c3d4" },
	};

	const result = mergeDocuments(into, from);
	// biome-ignore lint/style/noNonNullAssertion: <allow for test>
	const merged = result.document.data[0]!;

	// name and email should come from `from` (newer)
	// age should come from `into` (not in `from`)
	expect(merged.attributes.name).toBe("Bob");
	expect((merged.attributes as Record<string, unknown>).email).toBe(
		"bob@example.com",
	);
	expect(merged.attributes.age).toBe(30);
});
