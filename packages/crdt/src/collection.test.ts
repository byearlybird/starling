import { expect, test } from "bun:test";
import { type Collection, del, from, insert, update } from "./collection";
import type { EncodedDocument } from "./document";

// Helper to create test documents
const createDoc = (id: string, data = {}): EncodedDocument => ({
	__id: id,
	__data: data,
	__deletedAt: null,
});

test("insert: adds a new document", () => {
	const collection = new Map<string, EncodedDocument>();
	const doc = createDoc("1");

	const result = insert(collection, doc);

	expect(result.has("1")).toBe(true);
	expect(result.get("1")?.__id).toBe("1");
});

test("insert: throws when key already exists", () => {
	const collection = new Map<string, EncodedDocument>();
	const doc1 = createDoc("1");
	const doc2 = createDoc("1");

	const col1 = insert(collection, doc1);

	expect(() => insert(col1, doc2)).toThrow("Key already exists: 1");
});

test("update: updates existing document", () => {
	const collection = new Map<string, EncodedDocument>();
	const doc1 = createDoc("1", { name: "Alice" });
	const doc2 = createDoc("1", { name: "Bob" });

	const col1 = insert(collection, doc1);
	const col2 = update(col1, doc2);

	expect(col2.get("1")?.__id).toBe("1");
});

test("update: throws when document doesn't exist", () => {
	const collection = new Map<string, EncodedDocument>();
	const doc = createDoc("1");

	expect(() => update(collection, doc)).toThrow("Key not found: 1");
});

test("del: removes document from collection", () => {
	const collection = new Map<string, EncodedDocument>();
	const doc = createDoc("1");

	const col1 = insert(collection, doc);
	const col2 = del(col1, "1");

	expect(col2.has("1")).toBe(false);
	expect(col2.size).toBe(0);
});

test("del: throws when document doesn't exist", () => {
	const collection = new Map<string, EncodedDocument>();

	expect(() => del(collection, "1")).toThrow("Key not found: 1");
});

test("from: creates collection from documents", () => {
	const docs = [createDoc("1"), createDoc("2"), createDoc("3")];

	const collection = from(docs);

	expect(collection.size).toBe(3);
	expect(collection.has("1")).toBe(true);
	expect(collection.has("2")).toBe(true);
	expect(collection.has("3")).toBe(true);
});

test("from: throws on duplicate keys", () => {
	const docs = [createDoc("1"), createDoc("1")];

	expect(() => from(docs)).toThrow("Duplicate key found: 1");
});
