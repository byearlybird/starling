import { expect, test } from "bun:test";
import * as $document from "./document";
import * as $map from "./map";

test("set adds new document to map", () => {
	const map = $map.create();
	const doc = $document.encode(
		"item-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);

	map.set("item-1", doc);

	expect(map.has("item-1")).toBe(true);
	expect(map.get("item-1")).toEqual(doc);
});

test("set merges when document already exists", () => {
	const map = $map.create();
	const doc1 = $document.encode(
		"item-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);
	const doc2 = $document.encode(
		"item-1",
		{ name: "Alice", email: "alice@example.com" },
		"2025-01-02T00:00:00.000Z|1",
	);

	map.set("item-1", doc1);
	map.set("item-1", doc2);

	const retrieved = map.get("item-1");
	expect(retrieved).toBeDefined();
	expect(retrieved?.__id).toBe("item-1");
});

test("set returns the map for chaining", () => {
	const map = $map.create();
	const doc = $document.encode(
		"item-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);

	const result = map.set("item-1", doc);

	expect(result).toBe(map);
});

test("del marks document as deleted and returns true", () => {
	const map = $map.create();
	const doc = $document.encode(
		"item-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);

	map.set("item-1", doc);
	const deleted = map.del("item-1", "2025-01-02T00:00:00.000Z|1");

	expect(deleted).toBe(true);
});

test("del sets __deletedAt with eventstamp", () => {
	const map = $map.create();
	const doc = $document.encode(
		"item-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);

	map.set("item-1", doc);
	const eventstamp = "2025-01-02T00:00:00.000Z|1";
	map.del("item-1", eventstamp);

	const deleted = map.get("item-1");
	expect(deleted?.__deletedAt).toBe(eventstamp);
});

test("del on non-existent document returns false", () => {
	const map = $map.create();

	const result = map.del("non-existent", "2025-01-02T00:00:00.000Z|1");

	expect(result).toBe(false);
});

test("del preserves document data when marking as deleted", () => {
	const map = $map.create();
	const doc = $document.encode(
		"item-1",
		{ name: "Alice", age: 30 },
		"2025-01-01T00:00:00.000Z|0",
	);

	map.set("item-1", doc);
	map.del("item-1", "2025-01-02T00:00:00.000Z|1");

	const deleted = map.get("item-1");
	expect(deleted?.__data).toBe(doc.__data);
});

test("set and del work together", () => {
	const map = $map.create();
	const doc1 = $document.encode(
		"item-1",
		{ name: "Alice" },
		"2025-01-01T00:00:00.000Z|0",
	);
	const doc2 = $document.encode(
		"item-1",
		{ name: "Alice", age: 30 },
		"2025-01-02T00:00:00.000Z|1",
	);

	map.set("item-1", doc1);
	map.set("item-1", doc2);
	map.del("item-1", "2025-01-03T00:00:00.000Z|2");

	const final = map.get("item-1");
	expect(final?.__deletedAt).toBe("2025-01-03T00:00:00.000Z|2");
});
