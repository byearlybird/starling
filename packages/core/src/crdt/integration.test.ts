import { expect, test } from "bun:test";
import { createDocument, type Document, mergeDocuments } from "./document";
import { createResource, type ResourceObject } from "./resource";

const RESOURCE_TYPE = "users";

const buildResource = (
	id: string,
	data: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
) => createResource(RESOURCE_TYPE, id, data, eventstamp, deletedAt);

function resourceById(
	document: Document,
	id: string,
): ResourceObject | undefined {
	return document.data.find((resource) => resource.id === id);
}

test("CRDT integration merges updates, creations, and deletions without resource map", () => {
	const baseDocument: Document = {
		...createDocument("2025-01-01T00:02:00.000Z|0001|base"),
		data: [
			buildResource(
				"user1",
				{
					status: "active",
					profile: {
						bio: "Hello world",
						location: "San Francisco",
					},
				},
				"2025-01-01T00:01:00.000Z|0001|user1",
			),
			buildResource(
				"user3",
				{
					name: "Charlie",
				},
				"2025-01-01T00:02:00.000Z|0001|user3",
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
					profile: {
						bio: "Bonjour tout le monde",
					},
				},
				"2025-01-01T00:03:00.000Z|0001|user1b",
			),
			buildResource(
				"user2",
				{
					name: "Bob",
					role: "editor",
				},
				"2025-01-01T00:04:00.000Z|0001|user2",
			),
			buildResource(
				"user3",
				{
					name: "Charlie",
				},
				"2025-01-01T00:05:00.000Z|0001|user3",
				"2025-01-01T00:05:00.000Z|0001|del3",
			),
		],
		meta: { "~eventstamp": "2025-01-01T00:05:00.000Z|0001|del3" },
	};

	const result = mergeDocuments(baseDocument, replicaDocument);
	const mergedDoc = result.document;

	expect(mergedDoc.meta["~eventstamp"]).toBe(
		"2025-01-01T00:05:00.000Z|0001|del3",
	);

	const user1 = resourceById(mergedDoc, "user1");
	expect(user1).toBeDefined();
	const user1Attrs = user1?.attributes as Record<string, unknown>;
	const user1Profile = user1Attrs.profile as Record<string, unknown>;
	expect(user1Profile.bio).toBe("Bonjour tout le monde"); // Newer replica value
	expect(user1Profile.location).toBe("San Francisco"); // Preserved from base
	expect(user1Attrs.status).toBe("active"); // Matching value
	expect(user1Attrs.lastLogin).toBe("2025-01-01T00:03:00.000Z"); // Newly added field

	const user2 = resourceById(mergedDoc, "user2");
	expect(user2).toBeDefined();
	expect(user2?.meta["~deletedAt"]).toBeNull();

	const user3 = resourceById(mergedDoc, "user3");
	expect(user3).toBeDefined();
	expect(user3?.meta["~deletedAt"]).toBe("2025-01-01T00:05:00.000Z|0001|del3");

	expect(result.changes.added.size).toBe(1);
	expect(result.changes.added.has("user2")).toBe(true);

	expect(result.changes.updated.size).toBe(1);
	expect(result.changes.updated.has("user1")).toBe(true);

	expect(result.changes.deleted.size).toBe(1);
	expect(result.changes.deleted.has("user3")).toBe(true);
});
