import { expect, mock, test } from "bun:test";
import { createStorage } from "unstorage";
import { createPersist } from "./persisted";
import { createStore } from "./store";

test("init loads persisted data from storage", async () => {
	const storage = createStorage();
	const store = createStore<{ name: string; age: number }>("users");

	// Pre-populate storage with data
	store.insert("user1", { name: "Alice", age: 30 });
	await storage.set("__users", store.state());

	// Create new store and persist
	const newStore = createStore<{ name: string; age: number }>("users");
	const persist = createPersist({
		store: newStore,
		storage,
		key: "__users",
		onError: console.error,
		debounceMs: 100,
	});

	await persist.init;

	const values = newStore.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
	});
});

test("init handles missing data gracefully", async () => {
	const storage = createStorage();
	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		storage,
		key: "__users",
		onError: console.error,
		debounceMs: 100,
	});

	await persist.init;

	const values = store.values();
	expect(values).toEqual({});
});

test("trigger debounces and persists store data", async () => {
	const storage = createStorage();
	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		storage,
		key: "__users",
		onError: console.error,
		debounceMs: 50,
	});

	await persist.init;

	store.insert("user1", { name: "Alice", age: 30 });
	persist.trigger();

	// Wait for debounce
	await Bun.sleep(100);

	const persisted = await storage.get("__users");
	expect(persisted).not.toBeNull();
	expect(persisted).toHaveProperty("user1");
});

test("trigger debounces multiple calls", async () => {
	const storage = createStorage();
	const store = createStore<{ name: string; age: number }>("users");
	const mockSet = mock(storage.set);

	const persist = createPersist({
		store,
		storage: { ...storage, set: mockSet },
		key: "__users",
		onError: console.error,
		debounceMs: 50,
	});

	await persist.init;

	store.insert("user1", { name: "Alice", age: 30 });

	// Trigger multiple times rapidly
	persist.trigger();
	persist.trigger();
	persist.trigger();

	// Wait for debounce
	await Bun.sleep(100);

	// Should only call set once due to debouncing
	expect(mockSet).toHaveBeenCalledTimes(1);
});

test("cancel prevents pending persist", async () => {
	const storage = createStorage();
	const store = createStore<{ name: string; age: number }>("users");
	const mockSet = mock(storage.set);

	const persist = createPersist({
		store,
		storage: { ...storage, set: mockSet },
		key: "__users",
		onError: console.error,
		debounceMs: 50,
	});

	await persist.init;

	store.insert("user1", { name: "Alice", age: 30 });
	persist.trigger();
	persist.cancel();

	// Wait longer than debounce time
	await Bun.sleep(100);

	// Should not have called set because we cancelled
	expect(mockSet).toHaveBeenCalledTimes(0);
});

test("onError is called when storage.get fails during init", async () => {
	const storage = createStorage();
	const mockGet = mock(() => Promise.reject(new Error("Driver error")));
	const mockError = mock();

	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		storage: { ...storage, get: mockGet },
		key: "__users",
		onError: mockError,
		debounceMs: 50,
	});

	await persist.init;

	expect(mockError).toHaveBeenCalledTimes(1);
	expect(mockError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
});

test("onError is called when storage.set fails during persist", async () => {
	const storage = createStorage();
	const mockSet = mock(() => Promise.reject(new Error("Driver error")));
	const mockError = mock();

	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		storage: { ...storage, set: mockSet },
		key: "__users",
		onError: mockError,
		debounceMs: 50,
	});

	await persist.init;

	store.insert("user1", { name: "Alice", age: 30 });
	persist.trigger();

	// Wait for debounce and persist attempt
	await Bun.sleep(100);

	expect(mockError).toHaveBeenCalledTimes(1);
	expect(mockError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
});
