import { describe, expect, test } from "bun:test";
import type { Collection } from "./resource";
import { CRDT } from "./crdt";
import { decodeResource, encodeResource } from "./resource";
import { MIN_EVENTSTAMP } from "./eventstamp";

describe("CRDT", () => {
	describe("constructor", () => {
		test("creates empty CRDT with default eventstamp", () => {
			const crdt = new CRDT(new Map(), "default");
			const collection = crdt.snapshot();

			expect(collection.data).toHaveLength(0);
			expect(collection.meta.eventstamp).toBeDefined();
		});

		test("creates CRDT with initial eventstamp and forwards clock", () => {
			const eventstamp = "2025-01-01T00:00:00.000Z|0001|abcd";
			const crdt = new CRDT(new Map(), "default", eventstamp);
			const collection = crdt.snapshot();

			// Clock should be at least at the provided eventstamp
			expect(collection.meta.eventstamp >= eventstamp).toBe(true);
		});

		test("creates CRDT with existing documents", () => {
			const doc1 = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const doc2 = encodeResource("items", "id2", { name: "Bob" }, MIN_EVENTSTAMP);
			const map = new Map([
				[doc1.id, doc1],
				[doc2.id, doc2],
			]);

			const crdt = new CRDT<{ name: string }>(map, "items");
			expect(crdt.has("id1")).toBe(true);
			expect(crdt.has("id2")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
			expect(crdt.get("id2")).toEqual({ name: "Bob" });
		});
	});

	describe("has", () => {
		test("returns true for existing documents", () => {
			const doc = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const crdt = new CRDT<{ name: string }>(new Map([[doc.id, doc]]), "items");

			expect(crdt.has("id1")).toBe(true);
		});

		test("returns false for non-existing documents", () => {
			const crdt = new CRDT(new Map(), "default");

			expect(crdt.has("id1")).toBe(false);
		});
	});

	describe("get", () => {
		test("returns document for existing id", () => {
			const doc = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const crdt = new CRDT<{ name: string }>(new Map([[doc.id, doc]]), "items");

			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("returns undefined for non-existing id", () => {
			const crdt = new CRDT(new Map(), "default");

			expect(crdt.get("id1")).toBeUndefined();
		});
	});

	describe("add", () => {
		test("adds new document", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("overwrites existing document with same id", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			crdt.add("id1", { name: "Bob" });

			expect(crdt.get("id1")).toEqual({ name: "Bob" });
		});
	});

	describe("update", () => {
		test("merges document with existing document", () => {
			const crdt = new CRDT<{ name: string; age: number }>(new Map(), "items");

			crdt.add("id1", { name: "Alice", age: 30 });
			crdt.update("id1", { age: 31 });

			const merged = crdt.get("id1");
			expect(merged).toBeDefined();
			// Name should be preserved from original, age should be updated
			expect(merged?.name).toBe("Alice");
			expect(merged?.age).toBe(31);
		});

		test("adds document if it doesn't exist", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.update("id1", { name: "Alice" });

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("last-write-wins for concurrent updates", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			crdt.update("id1", { name: "Bob" });
			crdt.update("id1", { name: "Charlie" });

			const merged = crdt.get("id1");
			expect(merged?.name).toBe("Charlie");
		});
	});

	describe("delete", () => {
		test("soft-deletes existing document", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");

			// get() returns undefined for deleted documents
			const deleted = crdt.get("id1");
			expect(deleted).toBeUndefined();
			// has() returns false by default, but true if includeDeleted is true
			expect(crdt.has("id1")).toBe(false);
			expect(crdt.has("id1", { includeDeleted: true })).toBe(true);
		});

		test("does nothing if document doesn't exist", () => {
			const crdt = new CRDT(new Map(), "default");

			crdt.delete("id1");

			expect(crdt.has("id1")).toBe(false);
		});

		test("generates unique eventstamp for each delete", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");
			const collection1 = crdt.snapshot();

			// Re-add and delete again
			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");
			const collection2 = crdt.snapshot();

			// Collections should have different eventstamps due to second delete
			expect(collection2.meta.eventstamp > collection1.meta.eventstamp).toBe(
				true,
			);
		});
	});

	describe("cloneMap", () => {
		test("returns a copy of the internal encoded map", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			const clonedMap = crdt.cloneMap();

			expect(clonedMap).not.toBe(crdt.cloneMap());
			expect(clonedMap.size).toBe(1);
			expect(clonedMap.get("id1")).toBeDefined();
			expect(clonedMap.get("id1")?.id).toBe("id1");
		});

		test("modifications to cloned map don't affect original", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			const clonedMap = crdt.cloneMap();
			clonedMap.delete("id1");

			expect(crdt.has("id1")).toBe(true);
		});
	});

	describe("snapshot", () => {
		test("returns collection with documents and eventstamp", () => {
			const doc1 = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const doc2 = encodeResource("items", "id2", { name: "Bob" }, MIN_EVENTSTAMP);
			const crdt = new CRDT(
				new Map([
					[doc1.id, doc1],
					[doc2.id, doc2],
				]),
				"items",
			);

			const collection = crdt.snapshot();

			expect(collection.data).toHaveLength(2);
			expect(collection.meta.eventstamp).toBeDefined();
		});

		test("includes deleted documents in collection", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");

			const collection = crdt.snapshot();

			expect(collection.data).toHaveLength(1);
			expect(collection.data[0]?.meta.deletedAt).not.toBeNull();
		});

		test("eventstamp reflects latest operation", () => {
			const crdt = new CRDT<{ name: string }>(
				new Map(),
				"items",
				"2025-01-01T00:00:00.000Z|0001|abcd",
			);

			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");

			const collection = crdt.snapshot();

			// Eventstamp should be from the delete operation, which is more recent
			expect(
				collection.meta.eventstamp > "2025-01-01T00:00:00.000Z|0001|abcd",
			).toBe(true);
		});
	});

	describe("fromSnapshot", () => {
		test("creates CRDT from collection", () => {
			const collection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: "2025-01-01T00:00:00.000Z|0001|abcd" },
				data: [
					encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP),
					encodeResource("items", "id2", { name: "Bob" }, MIN_EVENTSTAMP),
				],
			};

			const crdt = CRDT.fromSnapshot<{ name: string }>(collection);

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.has("id2")).toBe(true);
			// Clock forwards to at least the provided eventstamp
			expect(crdt.snapshot().meta.eventstamp >= collection.meta.eventstamp).toBe(
				true,
			);
		});

		test("preserves deleted documents", () => {
			const deletedDoc = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			deletedDoc.meta.deletedAt = "2025-01-01T00:00:01.000Z|0001|abcd";

			const collection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: "2025-01-01T00:00:01.000Z|0001|abcd" },
				data: [deletedDoc],
			};

			const crdt = CRDT.fromSnapshot<{ name: string }>(collection);

			// Deleted documents still exist internally, but default has() returns false
			expect(crdt.has("id1")).toBe(false);
			expect(crdt.has("id1", { includeDeleted: true })).toBe(true);
			// get() returns undefined for deleted documents
			expect(crdt.get("id1")).toBeUndefined();
		});

		test("round-trip preserves data", () => {
			const original = new CRDT<{ name: string; age: number }>(
				new Map(),
				"items",
				"2025-01-01T00:00:00.000Z|0001|abcd",
			);
			original.add("id1", { name: "Alice", age: 30 });

			const collection = original.snapshot();
			const restored = CRDT.fromSnapshot<{ name: string; age: number }>(
				collection,
			);

			expect(restored.has("id1")).toBe(true);
			expect(restored.get("id1")).toEqual({ name: "Alice", age: 30 });
		});
	});

	describe("convergence", () => {
		test("multiple replicas converge to same state", () => {
			// Replica 1: Add Alice, update age
			const replica1 = new CRDT<{ name: string; age: number }>(new Map(), "users");
			replica1.add("id1", { name: "Alice", age: 30 });
			replica1.update("id1", { age: 31 });

			// Replica 2: Add Alice with different age
			const replica2 = new CRDT<{ name: string; age: number }>(new Map(), "users");
			replica2.add("id1", { name: "Alice", age: 25 });

			// Merge replica1 into replica2
			const collection1 = replica1.snapshot();
			for (const encodedDoc of collection1.data) {
				const decoded = decodeResource(encodedDoc);
				replica2.update(decoded.id, decoded.data as any);
			}

			// Age should be 31 (most recent update)
			const merged = replica2.get("id1");
			expect(merged?.age).toBe(31);
		});

		test("concurrent updates resolve via LWW", () => {
			const crdt = new CRDT<{ name?: string; age?: number }>(new Map(), "items");

			// Two concurrent updates to different fields
			crdt.update("id1", { name: "Alice" });
			crdt.update("id1", { age: 30 });

			const doc = crdt.get("id1");
			// Both fields should be present
			expect(doc?.name).toBe("Alice");
			expect(doc?.age).toBe(30);
		});

		test("delete after update preserves deletion", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");

			// Add document
			crdt.add("id1", { name: "Alice" });

			// Delete it
			crdt.delete("id1");

			// Try to update (with older eventstamp via plain update)
			crdt.update("id1", { name: "Bob" });

			// Should still be deleted (delete eventstamp is newer)
			const collection = crdt.snapshot();
			const doc = collection.data.find((d) => d.id === "id1");
			expect(doc?.meta.deletedAt).not.toBeNull();
		});
	});

	describe("clock forwarding", () => {
		test("clock forwards when loading newer eventstamp", () => {
			const collection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: "2025-01-01T00:00:10.000Z|0001|abcd" },
				data: [],
			};

			const restored = CRDT.fromSnapshot<{ name: string }>(collection);
			restored.add("id1", { name: "Alice" });

			// New operations should have eventstamps >= the loaded eventstamp
			restored.delete("id1");
			const collectionAfter = restored.snapshot();
			expect(collectionAfter.meta.eventstamp >= collection.meta.eventstamp).toBe(
				true,
			);
		});
	});

	describe("merge", () => {
		test("merges new documents from a collection", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");
			crdt.add("id1", { name: "Alice" });

			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: MIN_EVENTSTAMP },
				data: [encodeResource("items", "id2", { name: "Bob" }, MIN_EVENTSTAMP)],
			};

			crdt.merge(remoteCollection);

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.has("id2")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
			expect(crdt.get("id2")).toEqual({ name: "Bob" });
		});

		test("applies field-level last-write-wins during merge", () => {
			// Create a local document with an older eventstamp
			const localEventstamp = "2025-01-01T00:00:00.000Z|0001|aaaa";
			const localDoc = encodeResource(
				"items",
				"id1",
				{ name: "Alice", age: 30 },
				localEventstamp,
			);
			const crdt = new CRDT<{ name: string; age: number }>(
				new Map([["id1", localDoc]]),
				"items",
				localEventstamp,
			);

			// Create a remote document with a newer eventstamp for one field
			const laterEventstamp = "2025-01-01T00:00:05.000Z|0001|efgh";
			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: laterEventstamp },
				data: [encodeResource("items", "id1", { age: 31 }, laterEventstamp)],
			};

			crdt.merge(remoteCollection);

			const merged = crdt.get("id1");
			expect(merged?.name).toBe("Alice"); // Local value preserved
			expect(merged?.age).toBe(31); // Remote value wins (later eventstamp)
		});

		test("handles deleted documents in remote collection", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items");
			crdt.add("id1", { name: "Alice" });

			const deletedDoc = encodeResource("items", "id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const deletionEventstamp = "2025-01-01T00:00:05.000Z|0001|efgh";
			deletedDoc.meta.deletedAt = deletionEventstamp;

			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: deletionEventstamp },
				data: [deletedDoc],
			};

			crdt.merge(remoteCollection);

			// Document is soft-deleted
			const collection = crdt.snapshot();
			const doc = collection.data.find((d) => d.id === "id1");
			expect(doc?.meta.deletedAt).not.toBeNull();
		});

		test("forwards clock to remote eventstamp during merge", () => {
			const crdt = new CRDT<{ name: string }>(new Map(), "items", MIN_EVENTSTAMP);

			const futureEventstamp = "2025-01-01T00:00:10.000Z|0001|abcd";
			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: futureEventstamp },
				data: [],
			};

			crdt.merge(remoteCollection);

			// Add a new document after merge
			crdt.add("id1", { name: "Alice" });
			const collection = crdt.snapshot();

			// New eventstamp should be >= remote eventstamp
			expect(collection.meta.eventstamp >= futureEventstamp).toBe(true);
		});

		test("merge is idempotent", () => {
			const crdt = new CRDT<{ name: string; age: number }>(new Map(), "items");
			crdt.add("id1", { name: "Alice", age: 30 });

			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: MIN_EVENTSTAMP },
				data: [encodeResource("items", "id2", { name: "Bob", age: 25 }, MIN_EVENTSTAMP)],
			};

			crdt.merge(remoteCollection);
			const collection2 = crdt.snapshot();

			// Merge again
			crdt.merge(remoteCollection);
			const collection3 = crdt.snapshot();

			// Results should be identical
			expect(collection2.data.length).toBe(collection3.data.length);
			expect(crdt.get("id1")).toEqual({ name: "Alice", age: 30 });
			expect(crdt.get("id2")).toEqual({ name: "Bob", age: 25 });
		});

		test("merge preserves local data when remote is older", () => {
			const localEventstamp = "2025-01-01T00:00:10.000Z|0001|abcd";
			const localDoc = encodeResource("items", "id1", { name: "Alice" }, localEventstamp);
			const crdt = new CRDT(new Map([["id1", localDoc]]), "items");

			const olderEventstamp = "2025-01-01T00:00:05.000Z|0001|efgh";
			const remoteCollection: Document = {
				jsonapi: { version: "1.1" },
				meta: { eventstamp: olderEventstamp },
				data: [encodeResource("items", "id1", { name: "Bob" }, olderEventstamp)],
			};

			crdt.merge(remoteCollection);

			// Local value should be preserved (newer eventstamp)
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("merge combines documents from multiple replicas", () => {
			// Simulate two replicas that have diverged
			const replica1 = new CRDT<{ text: string; completed: boolean }>(
				new Map(),
				"todos",
			);
			replica1.add("todo1", { text: "Task 1", completed: false });
			replica1.add("todo2", { text: "Task 2", completed: false });

			const replica2 = new CRDT<{ text: string; completed: boolean }>(
				new Map(),
				"todos",
			);
			replica2.add("todo3", { text: "Task 3", completed: false });
			replica2.update("todo1", { completed: true }); // Update existing

			// Merge replica2's changes into replica1
			const collection2 = replica2.snapshot();
			replica1.merge(collection2);

			// replica1 should now have all three todos
			expect(replica1.has("todo1")).toBe(true);
			expect(replica1.has("todo2")).toBe(true);
			expect(replica1.has("todo3")).toBe(true);

			// And todo1 should reflect the completion status
			expect(replica1.get("todo1")?.completed).toBe(true);
		});
	});
});
