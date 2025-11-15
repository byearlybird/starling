import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { buildResource, EARLIER, LATER } from "./test-utils";

test("createDocument returns empty document with given eventstamp", () => {
	const document = createDocument(EARLIER);

	expect(document.data).toEqual([]);
	expect(document.meta["~eventstamp"]).toBe(EARLIER);
});

test("mergeDocuments with empty documents", () => {
	const result = mergeDocuments(createDocument(EARLIER), createDocument(LATER));

	expect(result.document.data).toEqual([]);
	expect(result.document.meta["~eventstamp"]).toBe(LATER);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments selects max eventstamp", () => {
	const result1 = mergeDocuments(
		createDocument(EARLIER),
		createDocument(LATER),
	);
	expect(result1.document.meta["~eventstamp"]).toBe(LATER);

	const result2 = mergeDocuments(
		createDocument(LATER),
		createDocument(EARLIER),
	);
	expect(result2.document.meta["~eventstamp"]).toBe(LATER);
});

test("mergeDocuments adds new resources and tracks changes", () => {
	const into = createDocument(EARLIER);
	const from: Document = {
		data: [
			buildResource("doc1", { name: "Alice" }, LATER),
			buildResource("doc2", { name: "Bob" }, LATER, LATER),
		],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(2);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.get("doc1")).toBeDefined();
	expect(result.changes.added.get("doc2")).not.toBeDefined();
	expect(result.changes.updated.size).toBe(0);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments updates existing resource objects", () => {
	const into: Document = {
		data: [buildResource("doc1", { name: "Alice", age: 30 }, EARLIER)],
		meta: { "~eventstamp": EARLIER },
	};

	const from: Document = {
		data: [buildResource("doc1", { name: "Bob", age: 25 }, LATER)],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(1);
	expect(result.changes.added.size).toBe(0);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments tracks deletions", () => {
	const into: Document = {
		data: [buildResource("doc1", { name: "Alice" }, EARLIER)],
		meta: { "~eventstamp": EARLIER },
	};

	const from: Document = {
		data: [buildResource("doc1", { name: "Alice" }, LATER, LATER)],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(1);
	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(LATER);
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("doc1")).toBe(true);
});

test("mergeDocuments does not restore deleted resources", () => {
	const deletionTimestamp = "2025-01-01T00:00:30.000Z|0000|x1y2";
	const into: Document = {
		data: [
			buildResource("doc1", { name: "Alice" }, EARLIER, deletionTimestamp),
		],
		meta: { "~eventstamp": deletionTimestamp },
	};

	const from: Document = {
		data: [buildResource("doc1", { name: "Bob" }, LATER)],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data[0]?.meta["~deletedAt"]).toBe(deletionTimestamp);
	expect(result.changes.deleted.size).toBe(0);
	expect(result.changes.updated.size).toBe(0);
});

test("mergeDocuments handles multiple resources", () => {
	const into: Document = {
		data: [
			buildResource("doc1", { name: "Alice", age: 30 }, EARLIER),
			buildResource("doc2", { name: "Bob", age: 25 }, EARLIER),
		],
		meta: { "~eventstamp": EARLIER },
	};

	const from: Document = {
		data: [
			buildResource("doc1", { name: "Alice", age: 31 }, LATER),
			buildResource("doc3", { name: "Charlie" }, LATER),
		],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);

	expect(result.document.data).toHaveLength(3);
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.deleted.size).toBe(0);
});

test("mergeDocuments uses field-level LWW", () => {
	const into: Document = {
		data: [buildResource("doc1", { name: "Alice", age: 30 }, EARLIER)],
		meta: { "~eventstamp": EARLIER },
	};

	const from: Document = {
		data: [buildResource("doc1", { name: "Bob", email: "bob@ex.com" }, LATER)],
		meta: { "~eventstamp": LATER },
	};

	const result = mergeDocuments(into, from);
	const merged = result.document.data[0];

	expect(merged?.attributes.name).toBe("Bob");
	expect((merged?.attributes as Record<string, unknown>).email).toBe(
		"bob@ex.com",
	);
	expect(merged?.attributes.age).toBe(30);
});
