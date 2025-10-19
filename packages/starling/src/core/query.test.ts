import { expect, mock, test } from "bun:test";
import { createStorage } from "unstorage";
import { createQuery } from "./query";
import { createStore } from "./store";

// Initialization tests

test("initialize filters existing store items and emits init event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.on("init", mockInit);

	await q.load();

	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 35 });
	expect("user2" in results).toBe(false);
});

test("initialize returns empty results when no items match predicate", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 20 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.on("init", mockInit);

	await q.load();

	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(0);
});

test("multiple onInit listeners receive the same event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit1 = mock();
	const mockInit2 = mock();
	q.on("init", mockInit1);
	q.on("init", mockInit2);

	await q.load();

	expect(mockInit1).toHaveBeenCalledTimes(1);
	expect(mockInit2).toHaveBeenCalledTimes(1);
	const results1 = mockInit1.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	const results2 = mockInit2.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(results1).toBe(results2); // Same object instance
});

// Insert operation tests

test("insert matching item after initialize emits change event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("insert non-matching item after initialize does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user2", { name: "Bob", age: 25 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("insert before load is called does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("multiple inserts with mixed matching emits correct events", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	// Only matching inserts emit events
	expect(mockUpdate).toHaveBeenCalledTimes(2);
});

// Update operation tests

test("change item in results that still matches emits change event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(results["user1"]).toEqual({ name: "Alice", age: 31 });
});

test("change item in results to no longer match removes it", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.update("user1", { age: 25 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(1);
	expect("user1" in results).toBe(false);
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("change item not in results does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	// user2 is not in results (age < 30), and change still doesn't match
	await store.update("user2", { age: 26 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("change item not in results to now match predicate adds it to results", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	// user2 is not in results (age < 30), change to now match
	await store.update("user2", { age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	const results = mockUpdate.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 30 });
});

test("change before load is called does not emit event", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

// Event subscription tests

test("unsubscribe from onInit stops receiving callbacks", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	const unsubscribe = q.on("init", mockInit);

	unsubscribe();

	await q.load();

	expect(mockInit).toHaveBeenCalledTimes(0);
});

test("unsubscribe from onUpdate stops receiving callbacks", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	const unsubscribe = q.on("change", mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

test("multiple listeners can subscribe independently", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate1 = mock();
	const mockUpdate2 = mock();
	q.on("change", mockUpdate1);
	q.on("change", mockUpdate2);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate1).toHaveBeenCalledTimes(1);
	expect(mockUpdate2).toHaveBeenCalledTimes(1);
});

test("unsubscribing one listener does not affect others", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate1 = mock();
	const mockUpdate2 = mock();
	const unsubscribe1 = q.on("change", mockUpdate1);
	q.on("change", mockUpdate2);

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
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.insert("user2", { name: "Bob", age: 35 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

test("dispose stops receiving change events from store", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.update("user1", { age: 31 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);

	q.dispose();

	await store.update("user1", { age: 32 });

	expect(mockUpdate).toHaveBeenCalledTimes(1);
});

// Edge cases

test("no change event when changes don't affect filtered results", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	// Update user2 which is not in results
	await store.update("user2", { age: 26 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);

	// Insert user3 which doesn't match
	await store.insert("user3", { name: "Charlie", age: 20 });

	expect(mockUpdate).toHaveBeenCalledTimes(0);
});

test("results Map contains current filtered state", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 35 });

	const q = createQuery(store, (user) => user.age >= 30);
	await q.load();

	const mockUpdate = mock();
	q.on("change", mockUpdate);

	await store.insert("user3", { name: "Charlie", age: 40 });

	const results = mockUpdate.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(3);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
	expect(results["user3"]).toEqual({ name: "Charlie", age: 40 });
});

// Race condition tests

test("insert during load is queued and processed after load", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.on("init", mockInit);

	// Start load (it's async)
	const loadPromise = q.load();

	// Insert while load is in progress
	await store.insert("user2", { name: "Bob", age: 35 });

	// Wait for load to complete
	await loadPromise;

	// Both users should be in the init results
	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(2);
	expect(results["user1"]).toEqual({ name: "Alice", age: 30 });
	expect(results["user2"]).toEqual({ name: "Bob", age: 35 });
});

test("update during load is queued and processed after load", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.on("init", mockInit);

	// Start load (it's async)
	const loadPromise = q.load();

	// Update to remove from results while load is in progress
	await store.update("user1", { age: 25 });

	// Wait for load to complete
	await loadPromise;

	// User should not be in results (age < 30)
	expect(mockInit).toHaveBeenCalledTimes(1);
	const results = mockInit.mock.calls[0]?.[0] as Record<
		string,
		{ name: string; age: number }
	>;
	expect(Object.keys(results).length).toBe(0);
});

test("concurrent load calls are handled safely", async () => {
	const store = createStore<{ name: string; age: number }>("users", {
		storage: createStorage(),
	});

	await store.insert("user1", { name: "Alice", age: 30 });

	const q = createQuery(store, (user) => user.age >= 30);
	const mockInit = mock();
	q.on("init", mockInit);

	// Start multiple concurrent loads
	const load1 = q.load();
	const load2 = q.load();
	const load3 = q.load();

	await Promise.all([load1, load2, load3]);

	// Only one init event should fire
	expect(mockInit).toHaveBeenCalledTimes(1);
});
