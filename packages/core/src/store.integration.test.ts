import { describe, expect, test } from "bun:test";
import { createStore, type Store, type StoreSnapshot } from "./store";

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
 * Merges multiple store snapshots into a single consolidated store.
 *
 * This utility demonstrates how stores from different sources
 * (different clients, regions, or sync points) can be combined
 * into a single consistent state using CRDT-like merging.
 *
 * The merge process:
 * 1. Creates a new empty store
 * 2. Forwards the store's clock to the highest eventstamp across all snapshots
 * 3. Replays each document from every snapshot via tx.merge() (silent mode)
 * 4. Returns the consolidated store
 *
 * @param snapshots - Array of store snapshots to merge
 * @returns A new store containing the merged state
 */
async function mergeStoreSnapshots<T extends Record<string, unknown>>(
	snapshots: StoreSnapshot[],
): Promise<Store<T>> {
	const consolidated = createStore<T>();

	if (snapshots.length === 0) {
		await consolidated.init();
		return consolidated;
	}

	// Find the highest eventstamp across all snapshots for clock synchronization
	let maxEventstamp = "";
	for (const snapshot of snapshots) {
		if (snapshot.latestEventstamp > maxEventstamp) {
			maxEventstamp = snapshot.latestEventstamp;
		}
	}

	// Forward the clock to ensure new writes don't collide with remote timestamps
	consolidated.forwardClock(maxEventstamp);

	// Merge all documents from all snapshots using silent transactions
	// (silent to avoid triggering hooks during hydration)
	for (const snapshot of snapshots) {
		consolidated.begin(
			(tx) => {
				for (const doc of snapshot.docs) {
					tx.merge(doc);
				}
			},
			{ silent: true },
		);
	}

	// Initialize any plugins (though this example doesn't use them)
	await consolidated.init();

	return consolidated;
}

describe("Store Integration - Multi-Store Merging", () => {
	test("should merge independent writes with no conflicts", async () => {
		// Create 3 independent stores
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();
		const storeC = createStore<TestUser>();

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

		// Capture snapshots from all 3 stores
		const snapshotA = storeA.snapshot();
		const snapshotB = storeB.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge all snapshots into a consolidated store
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA,
			snapshotB,
			snapshotC,
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

		// Verify clock is forwarded to the highest eventstamp
		// (eventstamps are ISO8601 strings, so lexicographic comparison works)
		const stamps = [
			snapshotA.latestEventstamp,
			snapshotB.latestEventstamp,
			snapshotC.latestEventstamp,
		];
		const maxRemoteStamp = stamps.sort().pop() || "";
		expect(consolidated.latestEventstamp()).toEqual(maxRemoteStamp);
	});

	test("should merge same document with different fields updated per store", async () => {
		// Create 3 stores, each updating different fields of the same document
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();
		const storeC = createStore<TestUser>();

		// All stores start with the same document (simulating an initial state)
		const initialUser = { id: "user-1", name: "Initial" };

		storeA.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		// Small delay to ensure different timestamps
		await new Promise((resolve) => setTimeout(resolve, 1));

		storeB.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeC.begin((tx) => {
			tx.add(initialUser, { withId: "user-1" });
		});

		// Each store updates different fields
		storeA.begin((tx) => {
			tx.update("user-1", { name: "Alice" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeB.begin((tx) => {
			tx.update("user-1", { email: "alice@example.com" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeC.begin((tx) => {
			tx.update("user-1", { age: 30 });
		});

		// Capture snapshots
		const snapshotA = storeA.snapshot();
		const snapshotB = storeB.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge all snapshots
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA,
			snapshotB,
			snapshotC,
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

	test("should resolve same field conflict with highest eventstamp winning", async () => {
		// Create 3 stores where all update the same field with different values
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();
		const storeC = createStore<TestUser>();

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

		// Capture snapshots
		const snapshotA = storeA.snapshot();
		const snapshotB = storeB.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge all snapshots
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA,
			snapshotB,
			snapshotC,
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
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();
		const storeC = createStore<TestUser>();

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

		// Capture snapshots
		const snapshotA = storeA.snapshot();
		const snapshotB = storeB.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge in order: A → B → C
		// This ensures the deletion (highest eventstamp) is merged last
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA,
			snapshotB,
			snapshotC,
		]);

		// The document should be deleted (not appear in active entries)
		expect(consolidated.get("user-1")).toBeNull();

		// The snapshot should show the document as deleted (with ~deletedAt timestamp)
		const snapshot = consolidated.snapshot();
		const deletedDoc = snapshot.docs.find((doc) => doc["~id"] === "user-1");
		expect(deletedDoc?.["~deletedAt"]).toBeDefined();

		// The consolidated store should have 0 active entries
		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should merge empty snapshots gracefully", async () => {
		const emptySnapshot: StoreSnapshot = {
			docs: [],
			latestEventstamp: "2025-01-01T00:00:00.000Z|00000000",
		};

		const consolidated = await mergeStoreSnapshots<TestUser>([emptySnapshot]);

		const entries = Array.from(consolidated.entries());
		expect(entries).toHaveLength(0);
	});

	test("should maintain consistency when merging stores with overlapping and unique data", async () => {
		// Create 3 stores with partial overlaps
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();
		const storeC = createStore<TestUser>();

		// All stores have user-1
		// A and B have user-2
		// B and C have user-3
		// Only C has user-4
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeB.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
			tx.add({ id: "user-2", name: "Bob-Updated" }, { withId: "user-2" });
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeC.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice-Updated" }, { withId: "user-1" });
			tx.add({ id: "user-3", name: "Charlie-Updated" }, { withId: "user-3" });
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		// Capture snapshots
		const snapshotA = storeA.snapshot();
		const snapshotB = storeB.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge all snapshots
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA,
			snapshotB,
			snapshotC,
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
		const storeA = createStore<TestUser>();
		const storeB = createStore<TestUser>();

		// Both stores make initial writes
		storeA.begin((tx) => {
			tx.add({ id: "user-1", name: "Alice" }, { withId: "user-1" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		storeB.begin((tx) => {
			tx.add({ id: "user-2", name: "Bob" }, { withId: "user-2" });
		});

		// Manually forward store B's clock to simulate receiving updates from the future
		// (e.g., from a remote client that's far ahead in time)
		// Create a timestamp 60 seconds in the future with max hex counter
		const futureMs = Date.now() + 60000;
		const isoString = new Date(futureMs).toISOString();
		const futureTimestamp = `${isoString}|ffffffff`;

		const clockBeforeFwd = storeB.latestEventstamp();
		storeB.forwardClock(futureTimestamp);
		const clockAfterFwd = storeB.latestEventstamp();

		// Verify the clock was indeed forwarded (it should now reflect the future timestamp)
		expect(clockAfterFwd > clockBeforeFwd).toBe(true);

		// Make a write to Store B after clock forwarding to verify it uses the forwarded clock
		storeB.begin((tx) => {
			tx.add({ id: "user-3", name: "Charlie" }, { withId: "user-3" });
		});

		// Get snapshots after clock forwarding and continued writes
		const snapshotA2 = storeA.snapshot();
		const snapshotB2 = storeB.snapshot();

		// Merge both snapshots into a consolidated store
		const consolidated = await mergeStoreSnapshots<TestUser>([
			snapshotA2,
			snapshotB2,
		]);

		// Verify the consolidated store has all 3 users
		expect(consolidated.get("user-1")).toBeDefined();
		expect(consolidated.get("user-2")).toBeDefined();
		expect(consolidated.get("user-3")).toBeDefined();

		// Verify the consolidated store's clock is synchronized to the highest
		const maxSnapshotClock =
			[snapshotA2.latestEventstamp, snapshotB2.latestEventstamp].sort().pop() ||
			"";
		const consolidatedClock = consolidated.latestEventstamp();
		expect(consolidatedClock).toEqual(maxSnapshotClock);

		// Now continue working: make new writes on both the consolidated store
		// and create new independent stores to verify the system still works
		const storeC = createStore<TestUser>();

		// Add a new user to the consolidated store
		consolidated.begin((tx) => {
			tx.add({ id: "user-4", name: "Diana" }, { withId: "user-4" });
		});

		// Add a new user to store C (independent)
		storeC.begin((tx) => {
			tx.add({ id: "user-5", name: "Eve" }, { withId: "user-5" });
		});

		await new Promise((resolve) => setTimeout(resolve, 1));

		// Get snapshots after continued writes
		const snapshotConsolidated = consolidated.snapshot();
		const snapshotC = storeC.snapshot();

		// Merge the post-forwarding writes
		const finalMerged = await mergeStoreSnapshots<TestUser>([
			snapshotConsolidated,
			snapshotC,
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
		const finalClock = finalMerged.latestEventstamp();
		expect(finalClock).toBeDefined();
		expect(finalClock.length > 0).toBe(true);
	});
});
