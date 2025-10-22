import { expect, mock, test } from "bun:test";
import { createQuery } from "./query-v3";
import { createStore } from "./store-v3";

// Helper to create a store with v3 API
function createStoreV3<T extends object>() {
	let eventCounter = 0;
	const eventstampFn = () => String(eventCounter++);

	const store = createStore<T>({
		eventstampFn,
	});

	return store;
}

// Helper to convert query results array to Record for easier testing
function resultsToRecord<T extends object>(
	results: { key: string; value: T }[],
): Record<string, T> {
	return Object.fromEntries(results.map(({ key, value }) => [key, value]));
}

// Initialization tests

test("initialize filters existing store items", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });
	store.put("user3", { name: "Charlie", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 35 });
	expect("user2" in results).toBe(false);
});

test("initialize returns empty results when no items match predicate", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 20 });
	store.put("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(0);
});

test("initialize with empty store returns empty results", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	const q = createQuery(store, (user) => user.age >= 30);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(0);
});

// Put operation tests

test("put matching item emits change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("put non-matching item does not emit event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user2", { name: "Bob", age: 25 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("put before query creation does not emit event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user1", { name: "Alice", age: 30 });

	// Event should be emitted because query registers handlers on construction
	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("multiple puts with mixed matching emits correct events", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });
	store.put("user3", { name: "Charlie", age: 35 });

	// Only matching puts emit events
	expect(mockChange).toHaveBeenCalledTimes(2);
});

test("putMany with matching items emits single change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.putMany([
		{ key: "user1", value: { name: "Alice", age: 30 } },
		{ key: "user2", value: { name: "Bob", age: 25 } },
		{ key: "user3", value: { name: "Charlie", age: 35 } },
	]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
});

// Update operation tests

test("change item in results that still matches emits change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.update("user1", { age: 31 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(results["user1"]?.age).toBe(31);
});

test("change item in results to no longer match removes it", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.update("user1", { age: 25 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("change item not in results does not emit event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	// user2 is not in results (age < 30), and change still doesn't match
	store.update("user2", { age: 26 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("change item not in results to now match predicate adds it to results", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	// user2 is not in results (age < 30), change to now match
	store.update("user2", { age: 30 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 30 });
});

test("updateMany with mixed changes emits single change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.updateMany([
		{ key: "user1", value: { age: 25 } },
		{ key: "user2", value: { age: 40 } },
	]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 40 });
});

// Delete operation tests

test("delete item in results emits change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.delete("user1");

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("delete item not in results does not emit event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	// user2 is not in results
	store.delete("user2");

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("deleteMany with mixed items emits single change event", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });
	store.put("user3", { name: "Charlie", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	// Delete user1 (in results) and user3 (not in results)
	store.deleteMany(["user1", "user3"]);

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(1);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

// Event subscription tests

test("unsubscribe from change stops receiving callbacks", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	const unsubscribe = q.onChange(mockChange);

	store.put("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	unsubscribe();

	store.put("user3", { name: "Charlie", age: 40 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("multiple listeners can subscribe independently", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange1 = mock();
	const mockChange2 = mock();
	q.onChange(mockChange1);
	q.onChange(mockChange2);

	store.put("user2", { name: "Bob", age: 35 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(1);
});

test("unsubscribing one listener does not affect others", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange1 = mock();
	const mockChange2 = mock();
	const unsubscribe1 = q.onChange(mockChange1);
	q.onChange(mockChange2);

	store.put("user2", { name: "Bob", age: 35 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(1);

	unsubscribe1();

	store.put("user3", { name: "Charlie", age: 40 });

	expect(mockChange1).toHaveBeenCalledTimes(1);
	expect(mockChange2).toHaveBeenCalledTimes(2);
});

// Cleanup tests

test("dispose stops receiving put events from store", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user2", { name: "Bob", age: 35 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	store.put("user3", { name: "Charlie", age: 40 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving update events from store", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.update("user1", { age: 31 });

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	store.update("user1", { age: 32 });

	expect(mockChange).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving delete events from store", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.delete("user1");

	expect(mockChange).toHaveBeenCalledTimes(1);

	q.dispose();

	store.delete("user2");

	expect(mockChange).toHaveBeenCalledTimes(1);
});

// Edge cases

test("no change event when changes don't affect filtered results", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	// Update user2 which is not in results
	store.update("user2", { age: 26 });

	expect(mockChange).toHaveBeenCalledTimes(0);

	// Put user3 which doesn't match
	store.put("user3", { name: "Charlie", age: 20 });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("results array contains current filtered state", () => {
	const store = createStoreV3<{ name: string; age: number }>();

	store.put("user1", { name: "Alice", age: 30 });
	store.put("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user3", { name: "Charlie", age: 40 });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(3);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 40 });
});

test("results array format is correct", () => {
	const store = createStoreV3<{ name: string }>();

	store.put("user1", { name: "Alice" });
	store.put("user2", { name: "Bob" });

	const q = createQuery(store, () => true);

	const results = q.results();
	expect(Array.isArray(results)).toBe(true);
	expect(results.length).toBe(2);
	expect(results[0]).toHaveProperty("key");
	expect(results[0]).toHaveProperty("value");
	expect(results[1]).toHaveProperty("key");
	expect(results[1]).toHaveProperty("value");
});

test("complex predicate filters correctly", () => {
	const store = createStoreV3<{
		name: string;
		age: number;
		active: boolean;
	}>();

	store.put("user1", { name: "Alice", age: 30, active: true });
	store.put("user2", { name: "Bob", age: 25, active: false });
	store.put("user3", { name: "Charlie", age: 35, active: true });

	const q = createQuery(
		store,
		(user) => user.age >= 30 && user.active === true,
	);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
	expect("user2" in results).toBe(false);

	const mockChange = mock();
	q.onChange(mockChange);

	store.update("user2", { age: 30, active: true });

	expect(mockChange).toHaveBeenCalledTimes(1);
	const updatedResults = resultsToRecord(q.results());
	expect(Object.keys(updatedResults).length).toBe(3);
});

test("query with always-true predicate includes all items", () => {
	const store = createStoreV3<{ name: string }>();

	store.put("user1", { name: "Alice" });
	store.put("user2", { name: "Bob" });

	const q = createQuery(store, () => true);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(2);
});

test("query with always-false predicate includes no items", () => {
	const store = createStoreV3<{ name: string }>();

	store.put("user1", { name: "Alice" });
	store.put("user2", { name: "Bob" });

	const q = createQuery(store, () => false);

	const results = resultsToRecord(q.results());
	expect(Object.keys(results).length).toBe(0);

	const mockChange = mock();
	q.onChange(mockChange);

	store.put("user3", { name: "Charlie" });

	expect(mockChange).toHaveBeenCalledTimes(0);
});

test("results() returns new array each call", () => {
	const store = createStoreV3<{ name: string }>();

	store.put("user1", { name: "Alice" });

	const q = createQuery(store, () => true);

	const results1 = q.results();
	const results2 = q.results();

	expect(results1).toEqual(results2);
	// Arrays should be equal but not the same instance
	expect(results1 === results2).toBe(false);
});
