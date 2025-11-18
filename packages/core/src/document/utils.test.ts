import { expect, test } from "bun:test";
import { makeDocument } from "./document";
import { makeResource } from "./resource";
import { documentToMap, mapToDocument } from "./utils";

test("documentToMap() converts document to map", () => {
	const doc = makeDocument("2025-01-01T00:00:00.000Z|0001|a1b2");
	doc.data.push(
		makeResource("users", "user-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0001|a1b2"),
	);
	doc.data.push(
		makeResource("users", "user-2", { name: "Bob" }, "2025-01-01T00:00:00.000Z|0001|a1b2"),
	);

	const map = documentToMap(doc);

	expect(map.size).toBe(2);
	expect(map.get("user-1")?.attributes.name).toBe("Alice");
	expect(map.get("user-2")?.attributes.name).toBe("Bob");
});

test("documentToMap() handles empty document", () => {
	const doc = makeDocument("2025-01-01T00:00:00.000Z|0001|a1b2");

	const map = documentToMap(doc);

	expect(map.size).toBe(0);
});

test("mapToDocument() converts map to document", () => {
	const map = new Map();
	map.set(
		"user-1",
		makeResource("users", "user-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0001|a1b2"),
	);
	map.set(
		"user-2",
		makeResource("users", "user-2", { name: "Bob" }, "2025-01-01T00:05:00.000Z|0001|c3d4"),
	);

	const doc = mapToDocument(map);

	expect(doc.jsonapi.version).toBe("1.1");
	expect(doc.meta.latest).toBe("2025-01-01T00:05:00.000Z|0001|c3d4");
	expect(doc.data).toHaveLength(2);
	expect(doc.data[0].id).toBe("user-1");
	expect(doc.data[1].id).toBe("user-2");
});

test("mapToDocument() includes fallback eventstamp in max calculation", () => {
	const map = new Map();
	map.set(
		"user-1",
		makeResource("users", "user-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0001|a1b2"),
	);

	const doc = mapToDocument(map, "2025-01-01T00:10:00.000Z|0001|f1f2");

	expect(doc.jsonapi.version).toBe("1.1");
	expect(doc.meta.latest).toBe("2025-01-01T00:10:00.000Z|0001|f1f2");
	expect(doc.data).toHaveLength(1);
});

test("mapToDocument() uses fallback eventstamp for empty map", () => {
	const map = new Map();

	const doc = mapToDocument(map, "2025-01-01T00:10:00.000Z|0001|f1f2");

	expect(doc.jsonapi.version).toBe("1.1");
	expect(doc.meta.latest).toBe("2025-01-01T00:10:00.000Z|0001|f1f2");
	expect(doc.data).toHaveLength(0);
});

test("mapToDocument() uses MIN_EVENTSTAMP when no fallback provided", () => {
	const map = new Map();

	const doc = mapToDocument(map);

	expect(doc.jsonapi.version).toBe("1.1");
	expect(doc.meta.latest).toBe("1970-01-01T00:00:00.000Z|0000|0000");
	expect(doc.data).toHaveLength(0);
});

test("documentToMap() and mapToDocument() are inverses", () => {
	const originalDoc = makeDocument("2025-01-01T00:00:00.000Z|0001|a1b2");
	originalDoc.data.push(
		makeResource("users", "user-1", { name: "Alice" }, "2025-01-01T00:00:00.000Z|0001|a1b2"),
	);
	originalDoc.data.push(
		makeResource("users", "user-2", { name: "Bob" }, "2025-01-01T00:05:00.000Z|0001|c3d4"),
	);

	const map = documentToMap(originalDoc);
	const reconstructedDoc = mapToDocument(map);

	expect(reconstructedDoc.jsonapi.version).toBe(originalDoc.jsonapi.version);
	expect(reconstructedDoc.meta.latest).toBe("2025-01-01T00:05:00.000Z|0001|c3d4");
	expect(reconstructedDoc.data).toHaveLength(originalDoc.data.length);
	expect(reconstructedDoc.data[0].id).toBe(originalDoc.data[0].id);
	expect(reconstructedDoc.data[1].id).toBe(originalDoc.data[1].id);
});
