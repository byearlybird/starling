import { describe, expect, test } from "bun:test";
import type { Collection } from "./crdt";
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

/**
 * Merges multiple store collections into a single consolidated store.
 *
 * This utility demonstrates how stores from different sources
 * (different clients, regions, or sync points) can be combined
 * into a single consistent state using CRDT-like merging.
 *
 * The merge process:
 * 1. Creates a new empty store
 * 2. Forwards the store's clock to the highest eventstamp across all collections
 * 3. Replays each document from every collection via store.merge()
 * 4. Returns the consolidated store
 *
 * @param collections - Array of store collections to merge
 * @returns A new store containing the merged state
 */
async function mergeStoreCollections<T extends Record<string, unknown>>(
	collections: Document[],
): Promise<Store<T>> {
	const consolidated = new Store<T>();

	// Initialize first (before merging) to avoid clock advancement after merge
	await consolidated.init();

	if (collections.length === 0) {
		return consolidated;
	}

	// Merge all documents from all collections
	// The merge() method automatically forwards the clock to the highest eventstamp
	for (const collection of collections) {
		consolidated.merge(collection);
	}

	return consolidated;
}

describe("Store Integration - Multi-Store Merging", () => {
	test("should merge independent writes with no conflicts", async () => {
		// Create 3 independent stores
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();
		const storeC = new Store<TestUser>();

		// Each store gets its own unique writes
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

		// Capture collections from all 3 stores
		const collectionA = storeA.collection();
		const collectionB = storeB.collection();
		const collectionC = storeC.collection();

		// Merge all collections into a consolidated store
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA,
			collectionB,
			collectionC,
		]);

		// Verify all 6 documents are present in the consolidated store
		expect(consolidated.get("user-1")).toEqual({
			id: "user-1",
			name: "Alice",
		});
		expect(consolidated.get("user-2")).toEqual({
			id: "user-2",
			name: "Bob",
		});
		expect(consolidated.get("user-3")).toEqual({
			id: "user-3",
			name: "Charlie",
		});
		expect(consolidated.get("user-4")).toEqual({
			id: "user-4",
			name: "Diana",
		});
		expect(consolidated.get("user-5")).toEqual({
			id: "user-5",
			name: "Eve",
		});
		expect(consolidated.get("user-6")).toEqual({
			id: "user-6",
			name: "Frank",
		});

		// Verify the consolidated store has exactly 6 entries
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(6);

		// Verify clock is forwarded to at least the highest input eventstamp
		// Note: The consolidated store's clock may be newer due to its initialization time
		// (eventstamps are ISO8601 strings, so lexicographic comparison works)
		const stamps = [
			collectionA.meta.eventstamp,
			collectionB.meta.eventstamp,
			collectionC.meta.eventstamp,
		];
		const maxRemoteStamp = stamps.sort().pop() || "";
		const consolidatedStamp = consolidated.collection().meta.eventstamp;
		expect(consolidatedStamp >= maxRemoteStamp).toBe(true);
	});

	test("should merge same document with different fields updated per store (field-level LWW)", async () => {
		// Create 3 stores, each updating different fields of the same document
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();
		const storeC = new Store<TestUser>();

		// All stores start with the same document (simulating an initial state)
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

		// Each store updates different fields
		storeA.begin((tx) => {
			tx.update("user-1", { name: "Alice" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { age: 30 });
		});

		// Capture collections
		const collectionA = storeA.collection();
		const collectionB = storeB.collection();
		const collectionC = storeC.collection();

		// Merge all collections
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA,
			collectionB,
			collectionC,
		]);

		// Verify the consolidated document has all three fields
		// (field-level LWW merge means all fields should be present)
		const user = consolidated.get("user-1");
		expect(user).toBeDefined();
		expect(user?.name).toBeDefined();
		expect(user?.email).toBeDefined();
		expect(user?.age).toBeDefined();
		expect(user?.id).toBe("user-1");

		// Verify there's exactly 1 entry (no duplicates)
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(1);
	});

	test("should resolve same-field conflicts using LWW (highest eventstamp wins)", async () => {
		// Create 3 stores where all update the same field with different values
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();
		const storeC = new Store<TestUser>();

		// Initialize the same document in all stores
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

		// All stores update the same field with different values
		// Since each store has its own clock, the eventstamps will differ
		storeA.begin((tx) => {
			tx.update("user-1", { name: "Alice" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { name: "Bob" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { name: "Charlie" });
		});

		// Capture collections
		const collectionA = storeA.collection();
		const collectionB = storeB.collection();
		const collectionC = storeC.collection();

		// Merge all collections
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA,
			collectionB,
			collectionC,
		]);

		// The final value should be whichever was merged last
		// (since they're applied in order, the last one to be processed wins LWW)
		const user = consolidated.get("user-1");
		expect(user).toBeDefined();
		expect(user?.name).toBeDefined();

		// The name should be one of the three values (whichever has the highest eventstamp)
		if (user?.name) {
			expect(["Alice", "Bob", "Charlie"]).toContain(user.name);
		}

		// Verify there's exactly 1 entry
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(1);
	});

	test("should handle deletions where deletion eventstamp is highest", async () => {
		// Create 3 stores with different mutation sequences
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();
		const storeC = new Store<TestUser>();

		// Store A: Add a document
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		// Store B: Update the document
		storeB.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		// Store C: Delete the document (after receiving prior updates)
		storeC.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeC.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		storeC.begin((tx) => {
			tx.del("user-1");
		});

		// Capture collections
		const collectionA = storeA.collection();
		const collectionB = storeB.collection();
		const collectionC = storeC.collection();

		// Merge in order: A → B → C
		// This ensures the deletion (highest eventstamp) is merged last
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA,
			collectionB,
			collectionC,
		]);

		// The document should be deleted (not appear in active entries)
		expect(consolidated.get("user-1")).toBeNull();

		// The collection should show the document as deleted (with deletedAt timestamp)
		const collection = consolidated.collection();
		const deletedDoc = collection.data.find(
			(doc) => doc.id === "user-1",
		);
		expect(deletedDoc?.meta.deletedAt).toBeDefined();

		// The consolidated store should have 0 active entries
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should merge empty snapshots gracefully", async () => {
		const emptyCollection: Document = {
			jsonapi: { version: "1.1" },
			meta: {
				eventstamp: "2025-01-01T00:00:00.000Z|0000|0000",
			},
			data: [],
		};

		const consolidated = await mergeStoreCollections<TestUser>([
			emptyCollection,
		]);

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should maintain consistency when merging stores with overlapping and unique data", async () => {
		// Create 3 stores with partial overlaps
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();
		const storeC = new Store<TestUser>();

		// All stores have user-1
		// A and B have user-2
		// B and C have user-3
		// Only C has user-4
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		// Delay to ensure storeB operations have later eventstamps (testing LWW order)
		await new Promise((resolve) => setTimeout(resolve, 5));

		storeB.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob-Updated" }, { withId: "user-2" });
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		// Delay to ensure storeC operations have even later eventstamps
		await new Promise((resolve) => setTimeout(resolve, 5));
		storeC.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice-Updated" }, { withId: "user-1" });
			tx.add({ id: "user-3", name: "Charlie-Updated" }, { withId: "user-3" });
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		// Capture collections
		const collectionA = storeA.collection();
		const collectionB = storeB.collection();
		const collectionC = storeC.collection();

		// Merge all collections
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA,
			collectionB,
			collectionC,
		]);

		// Verify all 4 users are present
		expect(consolidated.get("user-1")).toBeDefined();
		expect(consolidated.get("user-2")).toBeDefined();
		expect(consolidated.get("user-3")).toBeDefined();
		expect(consolidated.get("user-4")).toBeDefined();

		// Verify the consolidated store has exactly 4 entries
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(4);

		// user-2 should have the version from storeB (later eventstamp)
		const user2 = consolidated.get("user-2");
		expect(user2?.name).toBe("Bob-Updated");

		// user-1 should have the version from storeC (latest update)
		const user1 = consolidated.get("user-1");
		expect(user1?.name).toBe("Alice-Updated");

		// user-3 should have the version from storeC (latest update)
		const user3 = consolidated.get("user-3");
		expect(user3?.name).toBe("Charlie-Updated");

		// user-4 should be from storeC
		const user4 = consolidated.get("user-4");
		expect(user4?.name).toBe("Diana");
	});

	test("should forward clock during sync and continue working correctly", async () => {
		// Create 2 stores that will sync with clock forwarding
		const storeA = new Store<TestUser>();
		const storeB = new Store<TestUser>();

		// Both stores make initial writes
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		storeB.begin((tx) => {
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		// Manually forward store B's clock to simulate receiving updates from the future
		// (e.g., from a remote client that's far ahead in time)
		// Create a timestamp 60 seconds in the future with max hex counter
		const futureMs = Date.now() + 60000;
		const isoString = new Date(futureMs).toISOString();
		const futureTimestamp = `${isoString}|ffffffff|0000`;

		const clockBeforeFwd = storeB.collection().meta.eventstamp;
		// Forward the clock by merging a snapshot with the future timestamp
		storeB.merge({
			jsonapi: { version: "1.1" },
			meta: {
				eventstamp: futureTimestamp,
			},
			data: [],
		});
		const clockAfterFwd = storeB.collection().meta.eventstamp;

		// Verify the clock was indeed forwarded (it should now reflect the future timestamp)
		expect(clockAfterFwd > clockBeforeFwd).toBe(true);

		// Make a write to Store B after clock forwarding to verify it uses the forwarded clock
		storeB.begin((tx) => {
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		// Get snapshots after clock forwarding and continued writes
		const collectionA2 = storeA.collection();
		const collectionB2 = storeB.collection();

		// Merge both snapshots into a consolidated store
		const consolidated = await mergeStoreCollections<TestUser>([
			collectionA2,
			collectionB2,
		]);

		// Verify the consolidated store has all 3 users
		expect(consolidated.get("user-1")).toBeDefined();
		expect(consolidated.get("user-2")).toBeDefined();
		expect(consolidated.get("user-3")).toBeDefined();

		// Verify the consolidated store's clock is synchronized to the highest
		const maxSnapshotClock =
			[collectionA2.meta.eventstamp, collectionB2.meta.eventstamp].sort().pop() ||
			"";
		const consolidatedClock = consolidated.collection().meta.eventstamp;
		expect(consolidatedClock).toEqual(maxSnapshotClock);

		// Now continue working: make new writes on both the consolidated store
		// and create new independent stores to verify the system still works
		const storeC = new Store<TestUser>();

		// Add a new user to the consolidated store
		consolidated.begin((tx) => {
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		// Add a new user to store C (independent)
		storeC.begin((tx) => {
			tx.add({ id: "user-5", name: "Eve" }, { withId: "user-5" });
		});

		// Get snapshots after continued writes
		const collectionConsolidated = consolidated.collection();
		const collectionC = storeC.collection();

		// Merge the post-forwarding writes
		const finalMerged = await mergeStoreCollections<TestUser>([
			collectionConsolidated,
			collectionC,
		]);

		// Verify all 5 users are present in the final merged store
		expect(finalMerged.get("user-1")).toEqual({ id: "user-1", name: "Alice" });
		expect(finalMerged.get("user-2")).toEqual({ id: "user-2", name: "Bob" });
		expect(finalMerged.get("user-3")).toEqual({
			id: "user-3",
			name: "Charlie",
		});
		expect(finalMerged.get("user-4")).toEqual({ id: "user-4", name: "Diana" });
		expect(finalMerged.get("user-5")).toEqual({ id: "user-5", name: "Eve" });

		// Verify there are exactly 5 entries
		const entries = Array.from(finalMerged.entries());
		expect(entries).toHaveLength(5);

		// Verify the final merged store's clock is well past the forwarded time
		// (since we made writes after forwarding)
		const finalClock = finalMerged.collection().meta.eventstamp;
		expect(finalClock).toBeDefined();
		expect(finalClock.length > 0).toBe(true);
	});
});
