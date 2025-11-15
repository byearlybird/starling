import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { buildResource } from "./test-utils";

function resourceById(document: Document, id: string) {
	return document.data.find((resource) => resource.id === id);
}

test("merges field-level updates preserving both sides", () => {
	const baseDocument: Document = {
		...createDocument("2025-01-01T00:02:00.000Z|0001|base"),
		data: [
			buildResource(
				"user1",
				{
					status: "active",
					profile: { bio: "Hello world", location: "San Francisco" },
				},
				"2025-01-01T00:01:00.000Z|0001|user1",
			),
		],
	};

	const replicaDocument: Document = {
		data: [
			buildResource(
				"user1",
				{
					status: "active",
					lastLogin: "2025-01-01T00:03:00.000Z",
					profile: { bio: "Bonjour tout le monde" },
				},
				"2025-01-01T00:03:00.000Z|0001|user1b",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:03:00.000Z|0001|user1b" },
	};

	const result = mergeDocuments(baseDocument, replicaDocument);
	const user1 = resourceById(result.document, "user1");
	const attrs = user1?.attributes as Record<string, unknown>;
	const profile = attrs.profile as Record<string, unknown>;

	expect(profile.bio).toBe("Bonjour tout le monde");
	expect(profile.location).toBe("San Francisco");
	expect(attrs.status).toBe("active");
	expect(attrs.lastLogin).toBe("2025-01-01T00:03:00.000Z");
	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("user1")).toBe(true);
});

test("tracks newly added resources", () => {
	const baseDocument = createDocument("2025-01-01T00:02:00.000Z|0001|base");

	const replicaDocument: Document = {
		data: [
			buildResource(
				"user2",
				{ name: "Bob", role: "editor" },
				"2025-01-01T00:04:00.000Z|0001|user2",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:04:00.000Z|0001|user2" },
	};

	const result = mergeDocuments(baseDocument, replicaDocument);
	const user2 = resourceById(result.document, "user2");

	expect(user2).toBeDefined();
	expect(user2?.meta["~deletedAt"]).toBeNull();
	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("user2")).toBe(true);
});

test("tracks resource deletions", () => {
	const baseDocument: Document = {
		...createDocument("2025-01-01T00:02:00.000Z|0001|base"),
		data: [
			buildResource(
				"user3",
				{ name: "Charlie" },
				"2025-01-01T00:02:00.000Z|0001|user3",
			),
		],
	};

	const replicaDocument: Document = {
		data: [
			buildResource(
				"user3",
				{ name: "Charlie" },
				"2025-01-01T00:05:00.000Z|0001|user3",
				"2025-01-01T00:05:00.000Z|0001|del3",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|del3" },
	};

	const result = mergeDocuments(baseDocument, replicaDocument);
	const user3 = resourceById(result.document, "user3");

	expect(user3).toBeDefined();
	expect(user3?.meta["~deletedAt"]).toBe("2025-01-01T00:05:00.000Z|0001|del3");
	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("user3")).toBe(true);
});
