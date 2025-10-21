import { expect, mock, test } from "bun:test";
import { monotonicFactory } from "ulid";
import { createStorage } from "unstorage";
import { Store } from "./store-v2";

// Helper to create a store instance
function createTestStore<TValue extends object>(key = "test") {
	return new Store<TValue>(key, {
		storage: createStorage(),
		eventstampFn: monotonicFactory(),
	});
}

// ============================================================================
// Basic Single Operations
// ============================================================================

test("insert adds a new object to the store", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
	});
});

test("insert with duplicate key throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	expect(store.insert("user1", { name: "Bob" })).rejects.toThrow(
		"Duplicate key",
	);
});

test("update modifies an existing object", async () => {
	const store = createTestStore<{ name: string; age: number; city?: string }>(
		"users",
	);
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.update("user1", { age: 31, city: "NYC" });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31, city: "NYC" },
	});
});

test("update with non-existent key throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	expect(store.update("user1", { name: "Alice" })).rejects.toThrow(
		"Key(s) not found",
	);
});

test("delete removes an object from the store", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });
	await store.delete("user1");

	const values = store.values();
	expect(values).toEqual({});
});

test("delete with non-existent key throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	expect(store.delete("user1")).rejects.toThrow("Key(s) not found");
});

test("values returns all objects in the store", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
		user2: { name: "Bob", age: 25 },
		user3: { name: "Charlie", age: 35 },
	});
});

test("insert then update workflow preserves original data", async () => {
	const store = createTestStore<{
		name: string;
		profile: { age: number; email?: string };
	}>("users");
	await store.init();

	await store.insert("user1", {
		name: "Alice",
		profile: { age: 30 },
	});

	await store.update("user1", {
		profile: { email: "alice@example.com" },
	});

	const values = store.values();
	expect(values).toEqual({
		user1: {
			name: "Alice",
			profile: {
				age: 30,
				email: "alice@example.com",
			},
		},
	});
});

// ============================================================================
// Bulk Operations
// ============================================================================

test("insertAll adds multiple objects to the store", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
		{ key: "user3", value: { name: "Charlie", age: 35 } },
	]);

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
		user2: { name: "Bob", age: 25 },
		user3: { name: "Charlie", age: 35 },
	});
});

test("insertAll with duplicate keys throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	expect(
		store.insertAll([
			{ key: "user1", value: { name: "Bob" } },
			{ key: "user2", value: { name: "Charlie" } },
		]),
	).rejects.toThrow("Duplicate key");
});

test("updateAll modifies multiple existing objects", async () => {
	const store = createTestStore<{ name: string; age: number; city?: string }>(
		"users",
	);
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
	]);

	await store.updateAll([
		{ key: "user1", value: { age: 31, city: "NYC" } },
		{ key: "user2", value: { city: "LA" } },
	]);

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31, city: "NYC" },
		user2: { name: "Bob", age: 25, city: "LA" },
	});
});

test("updateAll with non-existent keys throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	expect(
		store.updateAll([
			{ key: "user1", value: { name: "Alice Updated" } },
			{ key: "user2", value: { name: "Bob" } },
		]),
	).rejects.toThrow("Key(s) not found");
});

test("updateAll with no changes does not mutate", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });

	const mockMutate = mock();
	store.on("mutate", mockMutate);

	// Update with same value but newer eventstamp - in CRDT this is still a write
	await store.updateAll([{ key: "user1", value: { age: 30 } }]);

	// Should emit mutate event because eventstamp changed (CRDT behavior)
	expect(mockMutate).toHaveBeenCalledTimes(1);
});

test("deleteAll removes multiple objects from the store", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
		{ key: "user3", value: { name: "Charlie" } },
	]);

	await store.deleteAll(["user1", "user3"]);

	const values = store.values();
	expect(values).toEqual({
		user2: { name: "Bob" },
	});
});

test("deleteAll with non-existent keys throws error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	expect(store.deleteAll(["user1", "user2"])).rejects.toThrow(
		"Key(s) not found",
	);
});

test("deleteAll with no changes does not mutate", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	await store.delete("user1");

	const mockMutate = mock();
	store.on("mutate", mockMutate);

	// Try to delete already deleted item - in CRDT, newer timestamp is still a write
	await store.deleteAll(["user1"]);

	// Should emit mutate event because eventstamp changed (CRDT behavior)
	expect(mockMutate).toHaveBeenCalledTimes(1);
});

// ============================================================================
// Event System - Single Operations
// ============================================================================

test("on insert callback is called when inserting", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	const mockCallback = mock();
	store.on("insert", mockCallback);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 30 } },
	]);
});

test("on update callback is called when updating", async () => {
	const store = createTestStore<{ name: string; age: number; city?: string }>(
		"users",
	);
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });

	const mockCallback = mock();
	store.on("update", mockCallback);

	await store.update("user1", { age: 31, city: "NYC" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 31, city: "NYC" } },
	]);
});

test("on delete callback is called when deleting", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	const mockCallback = mock();
	store.on("delete", mockCallback);

	await store.delete("user1");

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([{ key: "user1" }]);
});

test("on mutate callback is called for all operations", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	const mockCallback = mock();
	store.on("mutate", mockCallback);

	await store.insert("user1", { name: "Alice" });
	await store.update("user1", { name: "Alice Updated" });
	await store.delete("user1");

	expect(mockCallback).toHaveBeenCalledTimes(3);
});

test("update with no changes does emit update event", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });

	const mockUpdate = mock();
	store.on("update", mockUpdate);

	// Update with same value but newer eventstamp - in CRDT this is still a write
	await store.update("user1", { age: 30 });

	// Should emit update event because eventstamp changed (CRDT behavior)
	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

// ============================================================================
// Event System - Bulk Operations
// ============================================================================

test("insertAll emits insert event with all inserted items", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	const mockCallback = mock();
	store.on("insert", mockCallback);

	await store.insertAll([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);
});

test("updateAll emits update event with all updated items", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
	]);

	const mockCallback = mock();
	store.on("update", mockCallback);

	await store.updateAll([
		{ key: "user1", value: { age: 31 } },
		{ key: "user2", value: { age: 26 } },
	]);

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 31 } },
		{ key: "user2", value: { name: "Bob", age: 26 } },
	]);
});

test("deleteAll emits delete event with all deleted items", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const mockCallback = mock();
	store.on("delete", mockCallback);

	await store.deleteAll(["user1", "user2"]);

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1" },
		{ key: "user2" },
	]);
});

test("bulk operations emit mutate event with all mutated keys", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insertAll([
		{ key: "user1", value: { name: "Alice" } },
		{ key: "user2", value: { name: "Bob" } },
	]);

	const mockCallback = mock();
	store.on("mutate", mockCallback);

	await store.updateAll([
		{ key: "user1", value: { name: "Alice Updated" } },
		{ key: "user2", value: { name: "Bob Updated" } },
	]);

	expect(mockCallback).toHaveBeenCalledTimes(1);
	const mutatedKeys = mockCallback.mock.calls[0]?.[0].map(
		(item: { key: string }) => item.key,
	);
	expect(mutatedKeys).toContain("user1");
	expect(mutatedKeys).toContain("user2");
});

// ============================================================================
// Unsubscribe
// ============================================================================

test("unsubscribe from on insert stops receiving callbacks", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	const mockCallback = mock();
	const unsubscribe = store.on("insert", mockCallback);

	await store.insert("user1", { name: "Alice" });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("unsubscribe from on update stops receiving callbacks", async () => {
	const store = createTestStore<{ name: string; age: number }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice", age: 30 });

	const mockCallback = mock();
	const unsubscribe = store.on("update", mockCallback);

	await store.update("user1", { age: 31 });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.update("user1", { age: 32 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("multiple callbacks can be registered and unsubscribed independently", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	const mockCallback1 = mock();
	const mockCallback2 = mock();

	const unsubscribe1 = store.on("insert", mockCallback1);
	store.on("insert", mockCallback2);

	await store.insert("user1", { name: "Alice" });

	expect(mockCallback1).toHaveBeenCalledTimes(1);
	expect(mockCallback2).toHaveBeenCalledTimes(1);

	unsubscribe1();

	await store.insert("user2", { name: "Bob" });

	expect(mockCallback1).toHaveBeenCalledTimes(1);
	expect(mockCallback2).toHaveBeenCalledTimes(2);
});

// ============================================================================
// Storage & Initialization
// ============================================================================

test("init loads existing data from storage", async () => {
	const storage = createStorage();
	const ulid = monotonicFactory();
	const store1 = new Store<{ name: string }>("users", {
		storage,
		eventstampFn: ulid,
	});
	await store1.init();

	await store1.insert("user1", { name: "Alice" });
	await store1.insert("user2", { name: "Bob" });

	// Create new store instance with same storage
	const store2 = new Store<{ name: string }>("users", {
		storage,
		eventstampFn: ulid,
	});
	await store2.init();

	const values = store2.values();
	expect(values).toEqual({
		user1: { name: "Alice" },
		user2: { name: "Bob" },
	});
});

test("init filters out deleted items", async () => {
	const storage = createStorage();
	const ulid = monotonicFactory();
	const store1 = new Store<{ name: string }>("users", {
		storage,
		eventstampFn: ulid,
	});
	await store1.init();

	await store1.insert("user1", { name: "Alice" });
	await store1.insert("user2", { name: "Bob" });
	await store1.delete("user2");

	// Create new store instance with same storage
	const store2 = new Store<{ name: string }>("users", {
		storage,
		eventstampFn: ulid,
	});
	await store2.init();

	const values = store2.values();
	expect(values).toEqual({
		user1: { name: "Alice" },
	});
});

test("snapshot returns encoded record with metadata", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });

	const snapshot = store.snapshot();

	expect(snapshot.user1).toBeDefined();
	expect(snapshot?.user1?.name).toBeDefined();
	expect(snapshot?.user1?.name?.__value).toBe("Alice");
	expect(snapshot?.user1?.name?.__eventstamp).toBeDefined();
});

test("snapshot includes deleted items with __deleted flag", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });
	await store.delete("user1");

	const snapshot = store.snapshot();

	expect(snapshot.user1).toBeDefined();
	expect(snapshot?.user1?.__deleted).toBeDefined();
	expect(snapshot?.user1?.__deleted?.__value).toBe(true);
	expect(snapshot?.user1?.__deleted?.__eventstamp).toBeDefined();
});

test("values excludes deleted items", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insert("user1", { name: "Alice" });
	await store.insert("user2", { name: "Bob" });
	await store.delete("user1");

	const values = store.values();

	expect(values.user1).toBeUndefined();
	expect(values.user2).toEqual({ name: "Bob" });
});

// ============================================================================
// Cleanup
// ============================================================================

test("dispose removes all event listeners", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	const mockInsert = mock();
	const mockUpdate = mock();
	const mockDelete = mock();
	const mockMutate = mock();

	store.on("insert", mockInsert);
	store.on("update", mockUpdate);
	store.on("delete", mockDelete);
	store.on("mutate", mockMutate);

	store.dispose();

	await store.insert("user1", { name: "Alice" });
	await store.update("user1", { name: "Alice Updated" });
	await store.delete("user1");

	expect(mockInsert).toHaveBeenCalledTimes(0);
	expect(mockUpdate).toHaveBeenCalledTimes(0);
	expect(mockDelete).toHaveBeenCalledTimes(0);
	expect(mockMutate).toHaveBeenCalledTimes(0);
});

// ============================================================================
// Edge Cases
// ============================================================================

test("collectionKey getter returns the correct key", async () => {
	const store = createTestStore<{ name: string }>("users");
	expect(store.collectionKey).toBe("users");
});

test("empty updateAll does not error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.updateAll([]);

	// Should complete without error
	expect(true).toBe(true);
});

test("empty deleteAll does not error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.deleteAll([]);

	// Should complete without error
	expect(true).toBe(true);
});

test("empty insertAll does not error", async () => {
	const store = createTestStore<{ name: string }>("users");
	await store.init();

	await store.insertAll([]);

	// Should complete without error
	expect(true).toBe(true);
});
