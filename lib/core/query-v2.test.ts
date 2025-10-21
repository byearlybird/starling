import { expect, mock, test } from "bun:test";
import { createStorage } from "unstorage";
import { Query } from "./query-v2";
import { Store } from "./store-v2";

// Helper to create a store with v2 API
function createStoreV2<T extends object>(key: string) {
	let eventCounter = 0;
	const eventstampFn = () => String(eventCounter++);

	const store = new Store<T>(key, {
		storage: createStorage(),
		eventstampFn,
	});

	return store;
}

// Initialization tests

test("initialize filters existing store items", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const results = q.results();
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 35 });
	expect("user2" in results).toBe(false);
});

test("initialize returns empty results when no items match predicate", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 20 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const results = q.results();
	expect(Object.keys(results).length).toBe(0);
});

test("initialize with empty store returns empty results", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	const q = new Query(store, (user) => user.age >= 30);

	const results = q.results();
	expect(Object.keys(results).length).toBe(0);
});

// Insert operation tests

test("insert matching item emits change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("insert non-matching item does not emit event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user2", { name: "Bob", age: 25 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("insert before query creation does not emit event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user1", { name: "Alice", age: 30 });

	// Event should be emitted even though insert was before query subscription
	// because query registers handlers on construction
	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("multiple inserts with mixed matching emits correct events", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	// Only matching inserts emit events
	expect(mockChange).toHaveBeenCalledTimes(2);
});

test("insertAll with matching items emits single change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insertAll([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
		{ key: "user3", value: { name: "Charlie", age: 35 } },
	]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
});

// Update operation tests

test("change item in results that still matches emits change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.update("user1", { age: 31 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(results["user1"]?.age).toBe(31);
});

test("change item in results to no longer match removes it", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.update("user1", { age: 25 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("change item not in results does not emit event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	// user2 is not in results (age < 30), and change still doesn't match
	await store.update("user2", { age: 26 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("change item not in results to now match predicate adds it to results", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	// user2 is not in results (age < 30), change to now match
	await store.update("user2", { age: 30 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 30 });
});

test("updateAll with mixed changes emits single change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.updateAll([
		{ key: "user1", value: { age: 25 } },
		{ key: "user2", value: { age: 40 } },
	]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 40 });
});

// Delete operation tests

test("delete item in results emits change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.delete("user1");

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("delete item not in results does not emit event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	// user2 is not in results
	await store.delete("user2");

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("deleteAll with mixed items emits single change event", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });
	await store.insert("user3", { name: "Charlie", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	// Delete user1 (in results) and user3 (not in results)
	await store.deleteAll(["user1", "user3"]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(1);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

// Event subscription tests

test("unsubscribe from change stops receiving callbacks", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	const unsubscribe = q.on("change", mockChange);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.insert("user3", { name: "Charlie", age: 40 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("multiple listeners can subscribe independently", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange1 = mock();
	const mockChange2 = mock();
	q.on("change", mockChange1);
	q.on("change", mockChange2);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(1);
});

test("unsubscribing one listener does not affect others", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange1 = mock();
	const mockChange2 = mock();
	const unsubscribe1 = q.on("change", mockChange1);
	q.on("change", mockChange2);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(1);

	unsubscribe1();

	await store.insert("user3", { name: "Charlie", age: 40 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(2);
});

// Cleanup tests

test("dispose stops receiving insert events from store", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.insert("user3", { name: "Charlie", age: 40 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving update events from store", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.update("user1", { age: 31 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.update("user1", { age: 32 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving delete events from store", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.delete("user1");

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.delete("user2");

	expect(mockChange).toHaveBeenCalledTimes(1);
});

// Edge cases

test("no change event when changes don't affect filtered results", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	// Update user2 which is not in results
	await store.update("user2", { age: 26 });

	expect(mockChange).toHaveBeenCalledTimes(0);

	// Insert user3 which doesn't match
	await store.insert("user3", { name: "Charlie", age: 20 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("results object contains current filtered state", async () => {
	const store = createStoreV2<{ name: string; age: number }>("users");

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = new Query(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user3", { name: "Charlie", age: 40 });

	const results = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(3);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 40 });
});

test("complex predicate filters correctly", async () => {
	const store = createStoreV2<{
		name: string;
		age: number;
		active: boolean;
	}>("users");

	await store.insert("user1", { name: "Alice", age: 30, active: true });
	await store.insert("user2", { name: "Bob", age: 25, active: false });
	await store.insert("user3", { name: "Charlie", age: 35, active: true });

	const q = new Query(
		store,
		(user) => user.age >= 30 && user.active === true
	);

	const results = q.results();
	expect(Object.keys(results).length).toBe(2);
	expect("user2" in results).toBe(false);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.update("user2", { age: 30, active: true });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const updatedResults = mockChange.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number; active: boolean }
	>;
	expect(Object.keys(updatedResults).length).toBe(3);
});

test("query with always-true predicate includes all items", async () => {
	const store = createStoreV2<{ name: string }>("users");

	await store.insert("user1", { name: "Alice" });
	await store.insert("user2", { name: "Bob" });

	const q = new Query(store, () => true);

	const results = q.results();
	expect(Object.keys(results).length).toBe(2);
});

test("query with always-false predicate includes no items", async () => {
	const store = createStoreV2<{ name: string }>("users");

	await store.insert("user1", { name: "Alice" });
	await store.insert("user2", { name: "Bob" });

	const q = new Query(store, () => false);

	const results = q.results();
	expect(Object.keys(results).length).toBe(0);

	const mockChange = mock();
	q.on("change", mockChange);

	await store.insert("user3", { name: "Charlie" });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("results() returns new object each call", async () => {
	const store = createStoreV2<{ name: string }>("users");

	await store.insert("user1", { name: "Alice" });

	const q = new Query(store, () => true);

	const results1 = q.results();
	const results2 = q.results();

	expect(results1).toEqual(results2);
	// Objects should be equal but not the same instance
	expect(results1 === results2).toBe(false);
});
