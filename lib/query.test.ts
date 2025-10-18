import { expect, mock, test } from "bun:test";
import { createStorage } from "unstorage";
import { query } from "./query";
import { createStore } from "./store";

// Initialization tests

test("initialize filters existing store items and emits init event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	const q = query(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.onInit(mockInit);

	await q.initialize();

	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.size).toBe(2);
	expect(results.get("user1")).toEqual({ name: "Alice", age: 30 });
	expect(results.get("user3")).toEqual({ name: "Charlie", age: 35 });
	expect(results.has("user2")).toBe(false);
});

test("initialize returns empty results when no items match predicate", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 20 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = query(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.onInit(mockInit);

	await q.initialize();

	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.size).toBe(0);
});

test("multiple onInit listeners receive the same event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	const mockInit1 = mock();
	const mockInit2 = mock();
	q.onInit(mockInit1);
	q.onInit(mockInit2);

	await q.initialize();

	expect(mockInit1).toHaveBeenCalledTimes(1);
	expect(mockInit2).toHaveBeenCalledTimes(1);
	const results1 = mockInit1.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	const results2 = mockInit2.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results1).toBe(results2); // Same Map instance
});

// Insert operation tests

test("insert matching item after initialize emits updated event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.size).toBe(2);
	expect(results.get("user2")).toEqual({ name: "Bob", age: 35 });
});

test("insert non-matching item after initialize does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user2", { name: "Bob", age: 25 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("insert before initialize is called does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("multiple inserts with mixed matching emits correct events", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	// Only matching inserts emit events
	expect(mockUpdate).toHaveBeenCalledTimes(2);
});

// Update operation tests

test("update item in results that still matches emits updated event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.get("user1")).toEqual({ name: "Alice", age: 31 });
});

test("update item in results to no longer match removes it", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.update("user1", { age: 25 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.size).toBe(1);
	expect(results.has("user1")).toBe(false);
	expect(results.get("user2")).toEqual({ name: "Bob", age: 35 });
});

test("update item not in results does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	// user2 is not in results (age < 30)
	await store.update("user2", { age: 26 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("update before initialize is called does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

// Event subscription tests

test("unsubscribe from onInit stops receiving callbacks", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	const mockInit = mock();
	const unsubscribe = q.onInit(mockInit);

	unsubscribe();

	await q.initialize();

	expect(mockInit).toHaveBeenCalledTimes(0);
});

test("unsubscribe from onUpdate stops receiving callbacks", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	const unsubscribe = q.onUpdate(mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

test("multiple listeners can subscribe independently", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate1 = mock();
	const mockUpdate2 = mock();
	q.onUpdate(mockUpdate1);
	q.onUpdate(mockUpdate2);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate1).toHaveBeenCalledTimes(1);
	expect(mockUpdate2).toHaveBeenCalledTimes(1);
});

test("unsubscribing one listener does not affect others", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate1 = mock();
	const mockUpdate2 = mock();
	const unsubscribe1 = q.onUpdate(mockUpdate1);
	q.onUpdate(mockUpdate2);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate1).toHaveBeenCalledTimes(1);
	expect(mockUpdate2).toHaveBeenCalledTimes(1);

	unsubscribe1();

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate1).toHaveBeenCalledTimes(1);
	expect(mockUpdate2).toHaveBeenCalledTimes(2);
});

// Cleanup tests

test("dispose stops receiving insert events from store", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving update events from store", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.update("user1", { age: 32 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

// Edge cases

test("no updated event when changes don't affect filtered results", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	// Update user2 which is not in results
	await store.update("user2", { age: 26 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);

	// Insert user3 which doesn't match
	await store.insert("user3", { name: "Charlie", age: 20 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("results Map contains current filtered state", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = query(store, (user) => user.age >= 30);
	await q.initialize();

	const mockUpdate = mock();
	q.onUpdate(mockUpdate);

	await store.insert("user3", { name: "Charlie", age: 40 });

	const results = mockUpdate.mock.calls[0]?.[0] as Map<
		string,
		{ name: string; age: number }
	>;
	expect(results.size).toBe(3);
	expect(results.get("user1")).toEqual({ name: "Alice", age: 30 });
	expect(results.get("user2")).toEqual({ name: "Bob", age: 35 });
	expect(results.get("user3")).toEqual({ name: "Charlie", age: 40 });
});
