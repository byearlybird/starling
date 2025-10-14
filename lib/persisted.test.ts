import { expect, mock, test } from "bun:test";
import { createMemoryDriver } from "./drivers/memory-driver";
import { createPersist } from "./persisted";
import { createStore } from "./store";

test("init loads persisted data from driver", async () => {
	const driver = createMemoryDriver();
	const store = createStore<{ name: string; age: number }>("users");

	// Pre-populate driver with data
	store.insert("user1", { name: "Alice", age: 30 });
	const serialized = JSON.stringify(store.state());
	await driver.set("__users", serialized);

	// Create new store and persist
	const newStore = createStore<{ name: string; age: number }>("users");
	const persist = createPersist({
		store: newStore,
		driver,
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
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
	const driver = createMemoryDriver();
	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		driver,
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
		onError: console.error,
		debounceMs: 100,
	});

	await persist.init;

	const values = store.values();
	expect(values).toEqual({});
});

test("trigger debounces and persists store data", async () => {
	const driver = createMemoryDriver();
	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		driver,
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
		onError: console.error,
		debounceMs: 50,
	});

	await persist.init;

	store.insert("user1", { name: "Alice", age: 30 });
	persist.trigger();

	// Wait for debounce
	await Bun.sleep(100);

	const persisted = await driver.get("__users");
	expect(persisted).not.toBeNull();

	const data = JSON.parse(persisted!);
	expect(data).toHaveProperty("user1");
});

test("trigger debounces multiple calls", async () => {
	const driver = createMemoryDriver();
	const store = createStore<{ name: string; age: number }>("users");
	const mockSet = mock(driver.set);

	const persist = createPersist({
		store,
		driver: { ...driver, set: mockSet },
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
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
	const driver = createMemoryDriver();
	const store = createStore<{ name: string; age: number }>("users");
	const mockSet = mock(driver.set);

	const persist = createPersist({
		store,
		driver: { ...driver, set: mockSet },
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
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

test("onError is called when driver.get fails during init", async () => {
	const driver = createMemoryDriver();
	const mockGet = mock(() => Promise.reject(new Error("Driver error")));
	const mockError = mock();

	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		driver: { ...driver, get: mockGet },
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
		onError: mockError,
		debounceMs: 50,
	});

	await persist.init;

	expect(mockError).toHaveBeenCalledTimes(1);
	expect(mockError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
});

test("onError is called when driver.set fails during persist", async () => {
	const driver = createMemoryDriver();
	const mockSet = mock(() => Promise.reject(new Error("Driver error")));
	const mockError = mock();

	const store = createStore<{ name: string; age: number }>("users");

	const persist = createPersist({
		store,
		driver: { ...driver, set: mockSet },
		key: "__users",
		serialize: JSON.stringify,
		deserialize: JSON.parse,
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
