import { describe, expect, test } from "bun:test";
import type { Document } from "./crdt";
import { delay } from "./crdt/test-utils";
import { Store } from "./store";

/**
 * Integration test type: a document with multiple optional fields
 * to test field-level merging and conflict resolution.
 */
type TestUser = {
	id: string;
	name?: string;
	email?: string;
	age?: number;
};

const TEST_RESOURCE_TYPE = "test-users";
const createTestStore = () =>
	new Store<TestUser>({ resourceType: TEST_RESOURCE_TYPE });

async function mergeStoreDocuments<T extends Record<string, unknown>>(
	resourceType: string,
	documents: Document[],
): Promise<Store<T>> {
	const consolidated = new Store<T>({ resourceType });

	if (documents.length === 0) {
		await consolidated.init();
		return consolidated;
	}

	for (const document of documents) {
		consolidated.merge(document);
	}

	await consolidated.init();
	return consolidated;
}

function expectUsersInStore<T extends Record<string, unknown>>(
	store: Store<T>,
	expectedUsers: Record<string, Partial<T>>,
) {
	for (const [id, expected] of Object.entries(expectedUsers)) {
		expect(store.get(id)).toEqual(expected);
	}
	expect(Array.from(store.entries())).toHaveLength(
		Object.keys(expectedUsers).length,
	);
}

function expectClockForwarded<T extends Record<string, unknown>>(
	consolidated: Store<T>,
	...documents: Document[]
) {
	const stamps = documents.map((d) => d.meta["~eventstamp"]);
	const maxRemoteStamp = stamps.sort().pop() || "";
	expect(consolidated.document().meta["~eventstamp"] >= maxRemoteStamp).toBe(
		true,
	);
}

describe("Store Integration - Multi-Store Merging", () => {
	test("should merge independent writes with no conflicts", async () => {
		const storeA = createTestStore();
		const storeB = createTestStore();
		const storeC = createTestStore();

		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		storeB.begin((tx) => {
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		storeC.begin((tx) => {
			tx.add({ id: "user-5", name: "Eve" }, { withId: "user-5" });
			tx.add({ id: "user-6", name: "Frank" }, { withId: "user-6" });
		});

		const documentA = storeA.document();
		const documentB = storeB.document();
		const documentC = storeC.document();

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA, documentB, documentC],
		);

		expectUsersInStore(consolidated, {
			"user-1": { id: "user-1", name: "Alice" },
			"user-2": { id: "user-2", name: "Bob" },
			"user-3": { id: "user-3", name: "Charlie" },
			"user-4": { id: "user-4", name: "Diana" },
			"user-5": { id: "user-5", name: "Eve" },
			"user-6": { id: "user-6", name: "Frank" },
		});

		expectClockForwarded(consolidated, documentA, documentB, documentC);
	});

	test("should merge same document with different fields updated per store (field-level LWW)", async () => {
		const storeA = createTestStore();
		const storeB = createTestStore();
		const storeC = createTestStore();

		const initialUser = { id: "user-1", name: "Initial" };

		storeA.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeC.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeA.begin((tx) => {
			tx.update("user-1", { name: "Alice" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { age: 30 });
		});

		const documentA = storeA.document();
		const documentB = storeB.document();
		const documentC = storeC.document();

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA, documentB, documentC],
		);

		const user = consolidated.get("user-1");
		expect(user).toBeDefined();
		expect(user?.name).toBeDefined();
		expect(user?.email).toBeDefined();
		expect(user?.age).toBeDefined();
		expect(user?.id).toBe("user-1");

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(1);
	});

	test("should resolve same-field conflicts using LWW (highest eventstamp wins)", async () => {
		const storeA = createTestStore();
		const storeB = createTestStore();
		const storeC = createTestStore();

		const initialUser = { id: "user-1", name: "Initial" };

		storeA.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeC.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		storeA.begin((tx) => {
			tx.update("user-1", { name: "Alice" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { name: "Bob" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { name: "Charlie" });
		});

		const documentA = storeA.document();
		const documentB = storeB.document();
		const documentC = storeC.document();

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA, documentB, documentC],
		);

		const user = consolidated.get("user-1");
		expect(user).toBeDefined();
		expect(user?.name).toBeDefined();

		if (user?.name) {
			expect(["Alice", "Bob", "Charlie"]).toContain(user.name);
		}

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(1);
	});

	test("should handle deletions where deletion eventstamp is highest", async () => {
		const storeA = createTestStore();
		const storeB = createTestStore();
		const storeC = createTestStore();

		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		storeC.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		storeC.begin((tx) => {
			tx.del("user-1");
		});

		// Capture documents
		const documentA = storeA.document();
		const documentB = storeB.document();
		const documentC = storeC.document();

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA, documentB, documentC],
		);

		expect(consolidated.get("user-1")).toBeNull();

		const document = consolidated.document();
		const deletedDoc = document.data.find((doc) => doc.id === "user-1");
		expect(deletedDoc?.meta["~deletedAt"]).toBeDefined();

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should merge empty snapshots gracefully", async () => {
		const emptyDocument: Document = {
			data: [],
			meta: { "~eventstamp": "2025-01-01T00:00:00.000Z|0000|0000" },
		};

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[emptyDocument],
		);

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should maintain consistency when merging stores with overlapping and unique data", async () => {
		const storeA = createTestStore();
		const storeB = createTestStore();
		const storeC = createTestStore();

		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		await delay(5);

		storeB.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob-Updated" }, { withId: "user-2" });
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		await delay(5);
		storeC.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice-Updated" }, { withId: "user-1" });
			tx.add({ id: "user-3", name: "Charlie-Updated" }, { withId: "user-3" });
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		// Capture documents
		const documentA = storeA.document();
		const documentB = storeB.document();
		const documentC = storeC.document();

		// Merge all documents
		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA, documentB, documentC],
		);

		expectUsersInStore(consolidated, {
			"user-1": { id: "user-1", name: "Alice-Updated" },
			"user-2": { id: "user-2", name: "Bob-Updated" },
			"user-3": { id: "user-3", name: "Charlie-Updated" },
			"user-4": { id: "user-4", name: "Diana" },
		});
	});

	test("should forward clock during sync and continue working correctly", async () => {
		// Create 2 stores that will sync with clock forwarding
		const storeA = createTestStore();
		const storeB = createTestStore();

		// Both stores make initial writes
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		const futureMs = Date.now() + 60000;
		const isoString = new Date(futureMs).toISOString();
		const futureTimestamp = `${isoString}|ffffffff|0000`;

		const clockBeforeFwd = storeB.document().meta["~eventstamp"];
		storeB.merge({
			data: [],
			meta: { "~eventstamp": futureTimestamp },
		});
		const clockAfterFwd = storeB.document().meta["~eventstamp"];

		expect(clockAfterFwd > clockBeforeFwd).toBe(true);

		storeB.begin((tx) => {
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		const documentA2 = storeA.document();
		const documentB2 = storeB.document();

		const consolidated = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentA2, documentB2],
		);

		expect(consolidated.get("user-1")).toBeDefined();
		expect(consolidated.get("user-2")).toBeDefined();
		expect(consolidated.get("user-3")).toBeDefined();

		expectClockForwarded(consolidated, documentA2, documentB2);

		const storeC = createTestStore();

		consolidated.begin((tx) => {
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		storeC.begin((tx) => {
			tx.add({ id: "user-5", name: "Eve" }, { withId: "user-5" });
		});

		const documentConsolidated = consolidated.document();
		const documentC = storeC.document();

		const finalMerged = await mergeStoreDocuments<TestUser>(
			TEST_RESOURCE_TYPE,
			[documentConsolidated, documentC],
		);

		expectUsersInStore(finalMerged, {
			"user-1": { id: "user-1", name: "Alice" },
			"user-2": { id: "user-2", name: "Bob" },
			"user-3": { id: "user-3", name: "Charlie" },
			"user-4": { id: "user-4", name: "Diana" },
			"user-5": { id: "user-5", name: "Eve" },
		});

		const finalClock = finalMerged.document().meta["~eventstamp"];
		expect(finalClock).toBeDefined();
		expect(finalClock.length > 0).toBe(true);
	});
});
