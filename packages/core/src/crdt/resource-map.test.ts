import { describe, expect, test } from "bun:test";
import type { Document } from "./document";
import { MIN_EVENTSTAMP } from "./eventstamp";
import { createResource, type ResourceObject } from "./resource";
import { ResourceMap } from "./resource-map";

const RESOURCE_TYPE = "test-users";

function buildResource(
	id: string,
	data: Record<string, unknown>,
	eventstamp: string,
	deletedAt: string | null = null,
): ResourceObject {
	return createResource(RESOURCE_TYPE, id, data, eventstamp, deletedAt);
}

function mapFromResources(...resources: ResourceObject[]): Map<string, ResourceObject> {
	return new Map(resources.map((resource) => [resource.id, resource] as const));
}

function makeDocument(resources: ResourceObject[], eventstamp: string): Document {
	return {
		data: resources,
		meta: { "~eventstamp": eventstamp },
	};
}

describe("ResourceMap", () => {
	describe("constructor", () => {
		test("creates empty map with default clock", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);

			const snapshot = crdt.document();
			expect(snapshot.data).toHaveLength(0);
			expect(snapshot.meta["~eventstamp"]).toBeDefined();
		});

		test("forwards clock when initial eventstamp provided", () => {
			const eventstamp = "2025-01-01T00:00:00.000Z|0001|abcd";
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, new Map(), eventstamp);

			expect(crdt.document().meta["~eventstamp"] >= eventstamp).toBe(true);
		});

		test("hydrates from existing resources", () => {
			const userA = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const userB = buildResource("id2", { name: "Bob" }, MIN_EVENTSTAMP);
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, mapFromResources(userA, userB));

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.has("id2")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});
	});

	describe("has/get", () => {
		test("returns true for existing non-deleted documents", () => {
			const resource = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, mapFromResources(resource));

			expect(crdt.has("id1")).toBe(true);
		});

		test("respects includeDeleted flag", () => {
			const deleted = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP, MIN_EVENTSTAMP);
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, mapFromResources(deleted));

			expect(crdt.has("id1")).toBe(false);
			expect(crdt.has("id1", { includeDeleted: true })).toBe(true);
		});

		test("get returns decoded data or undefined", () => {
			const resource = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, mapFromResources(resource));

			expect(crdt.get("id1")).toEqual({ name: "Alice" });
			expect(crdt.get("missing")).toBeUndefined();
		});
	});

	describe("add/update/delete", () => {
		test("add stores plain object data", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);

			crdt.add("id1", { name: "Alice" });

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("update merges fields using LWW semantics", () => {
			const crdt = new ResourceMap<{ name: string; age?: number }>(RESOURCE_TYPE);

			crdt.add("id1", { name: "Alice", age: 30 });
			crdt.update("id1", { age: 31 });

			expect(crdt.get("id1")).toEqual({ name: "Alice", age: 31 });
		});

		test("update creates document when missing", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);

			crdt.update("id1", { name: "Alice" });

			expect(crdt.get("id1")).toEqual({ name: "Alice" });
		});

		test("delete marks document as soft deleted", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("id1", { name: "Alice" });

			crdt.delete("id1");

			expect(crdt.get("id1")).toBeUndefined();
			expect(crdt.has("id1")).toBe(false);
			expect(crdt.has("id1", { includeDeleted: true })).toBe(true);
			const resource = crdt.document().data.find((node) => node.id === "id1");
			expect(resource?.meta["~deletedAt"]).not.toBeNull();
		});
	});

	describe("cloneMap/document", () => {
		test("cloneMap returns independent copy of encoded resources", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("id1", { name: "Alice" });

			const clone = crdt.cloneMap();
			expect(clone).not.toBe(crdt.cloneMap());
			expect(clone.get("id1")?.id).toBe("id1");

			clone.delete("id1");
			expect(crdt.has("id1")).toBe(true);
		});

		test("document exports all resources including deleted ones", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("id1", { name: "Alice" });
			crdt.delete("id1");

			const document = crdt.document();
			expect(document.data).toHaveLength(1);
			expect(document.data[0]?.meta["~deletedAt"]).not.toBeNull();
		});

		test("document eventstamp reflects latest mutation", () => {
			const initial = "2025-01-01T00:00:00.000Z|0001|0000";
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE, new Map(), initial);

			crdt.add("id1", { name: "Alice" });
			const snapshot = crdt.document();
			expect(snapshot.meta["~eventstamp"] >= initial).toBe(true);
		});
	});

	describe("fromDocument", () => {
		test("rehydrates ResourceMap from document", () => {
			const resource = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP);
			const document = makeDocument([resource], MIN_EVENTSTAMP);

			const crdt = ResourceMap.fromDocument<{ name: string }>(RESOURCE_TYPE, document);

			expect(crdt.has("id1")).toBe(true);
			expect(crdt.document().meta["~eventstamp"] >= MIN_EVENTSTAMP).toBe(true);
		});

		test("preserves deleted resources when hydrating", () => {
			const resource = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP, MIN_EVENTSTAMP);
			const document = makeDocument([resource], MIN_EVENTSTAMP);

			const crdt = ResourceMap.fromDocument<{ name: string }>(RESOURCE_TYPE, document);

			expect(crdt.has("id1")).toBe(false);
			expect(crdt.has("id1", { includeDeleted: true })).toBe(true);
			expect(crdt.get("id1")).toBeUndefined();
		});

		test("throws when document contains mismatched resource type", () => {
			const otherResource = {
				...buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP),
				type: "other",
			};
			const document = makeDocument([otherResource], MIN_EVENTSTAMP);

			expect(() => ResourceMap.fromDocument(RESOURCE_TYPE, document)).toThrow(/Resource type mismatch/);
		});
	});

	describe("merge", () => {
		test("merges new documents from remote snapshot", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("local", { name: "Alice" });

			const remoteResource = buildResource("remote", { name: "Bob" }, MIN_EVENTSTAMP);
			crdt.merge(makeDocument([remoteResource], MIN_EVENTSTAMP));

			expect(crdt.has("local")).toBe(true);
			expect(crdt.has("remote")).toBe(true);
		});

		test("applies field-level LWW when merging existing ids", () => {
			const initialStamp = "2025-01-01T00:00:00.000Z|0001|aaaa";
			const baseResource = buildResource("id1", { name: "Alice", age: 30 }, initialStamp);
			const crdt = new ResourceMap<{ name: string; age?: number }>(
				RESOURCE_TYPE,
				mapFromResources(baseResource),
				initialStamp,
			);

			const updated = buildResource("id1", { age: 31 }, "2025-01-01T00:00:05.000Z|0001|abcd");
			crdt.merge(makeDocument([updated], "2025-01-01T00:00:05.000Z|0001|abcd"));

			expect(crdt.get("id1")?.age).toBe(31);
			expect(crdt.get("id1")?.name).toBe("Alice");
		});

		test("preserves deletions from remote snapshot", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("id1", { name: "Alice" });

			const deletionStamp = "2025-01-01T00:00:10.000Z|0001|dead";
			const deleted = buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP, deletionStamp);
			crdt.merge(makeDocument([deleted], deletionStamp));

			const resource = crdt.document().data.find((node) => node.id === "id1");
			expect(resource?.meta["~deletedAt"]).toBe(deletionStamp);
		});

		test("forwards clock to remote eventstamp", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			const remoteEventstamp = "2025-01-01T00:00:20.000Z|0001|ffff";

			crdt.merge(makeDocument([], remoteEventstamp));

			const after = crdt.document().meta["~eventstamp"];
			expect(after >= remoteEventstamp).toBe(true);
		});

		test("throws when merging document with mismatched types", () => {
			const doc: Document = {
				data: [
					{
						...buildResource("id1", { name: "Alice" }, MIN_EVENTSTAMP),
						type: "other",
					},
				],
				meta: { "~eventstamp": MIN_EVENTSTAMP },
			};
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);

			expect(() => crdt.merge(doc)).toThrow(/Resource type mismatch/);
		});
	});

	describe("convergence", () => {
		test("replicas converge when exchanging documents", () => {
			const replicaA = new ResourceMap<{ text: string; completed?: boolean }>(RESOURCE_TYPE);
			const replicaB = new ResourceMap<{ text: string; completed?: boolean }>(RESOURCE_TYPE);

			replicaA.add("todo1", { text: "Buy milk" });
			replicaB.add("todo2", { text: "Read book" });

			const docA = replicaA.document();
			const docB = replicaB.document();

			replicaA.merge(docB);
			replicaB.merge(docA);

			expect(replicaA.has("todo1")).toBe(true);
			expect(replicaA.has("todo2")).toBe(true);
			expect(replicaB.has("todo1")).toBe(true);
			expect(replicaB.has("todo2")).toBe(true);
		});

		test("deletion beats subsequent stale updates", () => {
			const crdt = new ResourceMap<{ name: string }>(RESOURCE_TYPE);
			crdt.add("id1", { name: "Alice" });

			crdt.delete("id1");
			crdt.update("id1", { name: "Bob" }); // Should not resurrect due to later delete stamp

			const document = crdt.document();
			const encoded = document.data.find((node) => node.id === "id1");
			expect(encoded?.meta["~deletedAt"]).not.toBeNull();
		});
	});
});
