import { expect, mock, test } from "bun:test";
import { createStorage } from "unstorage";
import { createStore } from "./store";

test("insert adds a new object to the store", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });

	const values = await store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
	});
});

test("insert with duplicate key throws error", async () => {
	const store = createStore<{ name: string }>(createStorage(), "users");

	await store.insert("user1", { name: "Alice" });

	await expect(store.insert("user1", { name: "Bob" })).rejects.toThrow(
		"Duplicate key: user1",
	);
});

test("update modifies an existing object", async () => {
	const store = createStore<{ name: string; age: number; city?: string }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.update("user1", { age: 31, city: "NYC" });

	const values = await store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31, city: "NYC" },
	});
});

test("update with non-existent key throws error", async () => {
	const store = createStore<{ name: string }>(createStorage(), "users");

	await expect(store.update("user1", { name: "Alice" })).rejects.toThrow(
		"Key not found: user1",
	);
});

test("values returns all objects in the store", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	await store.insert("user1", { name: "Alice", age: 30 });
	await store.insert("user2", { name: "Bob", age: 25 });
	await store.insert("user3", { name: "Charlie", age: 35 });

	const values = await store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
		user2: { name: "Bob", age: 25 },
		user3: { name: "Charlie", age: 35 },
	});
});

test("insert then update workflow preserves original data", async () => {
	const store = createStore<{
		name: string;
		profile: { age: number; email?: string };
	}>(createStorage(), "users");

	await store.insert("user1", {
		name: "Alice",
		profile: { age: 30 },
	});

	await store.update("user1", {
		profile: { email: "alice@example.com" },
	});

	const values = await store.values();
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

test("on insert callback is called when inserting", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	const mockCallback = mock();

	store.on("insert", mockCallback);

	await store.insert("user1", { name: "Alice", age: 30 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 30 } },
	]);
});

test("on update callback is called when updating", async () => {
	const store = createStore<{ name: string; age: number; city?: string }>(
		createStorage(),
		"users",
	);
	const mockCallback = mock();

	await store.insert("user1", { name: "Alice", age: 30 });

	store.on("update", mockCallback);

	await store.update("user1", { age: 31, city: "NYC" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 31, city: "NYC" } },
	]);
});

test("on insert callback receives correct data for multiple inserts", async () => {
	const store = createStore<{ name: string }>(createStorage(), "users");
	const mockCallback = mock();

	store.on("insert", mockCallback);

	await store.insert("user1", { name: "Alice" });
	await store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(2);
	expect(mockCallback).toHaveBeenNthCalledWith(1, [
		{ key: "user1", value: { name: "Alice" } },
	]);
	expect(mockCallback).toHaveBeenNthCalledWith(2, [
		{ key: "user2", value: { name: "Bob" } },
	]);
});

test("on update callback receives merged data", async () => {
	const store = createStore<{ name: string; age: number; city?: string }>(
		createStorage(),
		"users",
	);
	const mockCallback = mock();

	await store.insert("user1", { name: "Alice", age: 30 });

	store.on("update", mockCallback);

	await store.update("user1", { city: "NYC" });
	await store.update("user1", { age: 31 });

	expect(mockCallback).toHaveBeenCalledTimes(2);
	expect(mockCallback).toHaveBeenNthCalledWith(1, [
		{ key: "user1", value: { name: "Alice", age: 30, city: "NYC" } },
	]);
	expect(mockCallback).toHaveBeenNthCalledWith(2, [
		{ key: "user1", value: { name: "Alice", age: 31, city: "NYC" } },
	]);
});

test("unsubscribe from on insert stops receiving callbacks", async () => {
	const store = createStore<{ name: string }>(createStorage(), "users");
	const mockCallback = mock();

	const unsubscribe = store.on("insert", mockCallback);

	await store.insert("user1", { name: "Alice" });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("unsubscribe from on update stops receiving callbacks", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	const mockCallback = mock();

	await store.insert("user1", { name: "Alice", age: 30 });

	const unsubscribe = store.on("update", mockCallback);

	await store.update("user1", { age: 31 });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	await store.update("user1", { age: 32 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("multiple callbacks can be registered and unsubscribed independently", async () => {
	const store = createStore<{ name: string }>(createStorage(), "users");
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

test("mergeState adds new keys and emits events", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	// First add one user locally
	await store.insert("user1", { name: "Alice", age: 30 });

	const mockInsert = mock();
	const mockUpdate = mock();
	store.on("insert", mockInsert);
	store.on("update", mockUpdate);

	// Wait to ensure newer eventstamps
	await Bun.sleep(5);

	// Merge remote state with one existing (user1) and one new (user2)
	const tempStore = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	await tempStore.insert("user1", { name: "Alice", age: 31 });
	await tempStore.insert("user2", { name: "Bob", age: 25 });

	await store.mergeState(await tempStore.state());

	// Should emit insert for new key (user2)
	expect(mockInsert).toHaveBeenCalledTimes(1);
	expect(mockInsert).toHaveBeenCalledWith([
		{ key: "user2", value: { name: "Bob", age: 25 } },
	]);

	// Should emit update for existing key (user1)
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 31 } },
	]);

	const values = await store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31 },
		user2: { name: "Bob", age: 25 },
	});
});

test("mergeState merges existing keys with newer eventstamps", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	await store.insert("user1", { name: "Alice", age: 30 });

	const mockUpdate = mock();
	store.on("update", mockUpdate);

	// Simulate remote update with newer eventstamp
	await Bun.sleep(5);
	const tempStore = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	await tempStore.insert("user1", { name: "Alice", age: 31 });

	await store.mergeState(await tempStore.state());

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith([
		{ key: "user1", value: { name: "Alice", age: 31 } },
	]);

	const values = await store.values();
	expect(values.user1?.age).toBe(31);
});

test("mergeState keeps local changes with newer eventstamps", async () => {
	const store = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);

	// Create initial state in temp store (older)
	const tempStore1 = createStore<{ name: string; age: number }>(
		createStorage(),
		"users",
	);
	await tempStore1.insert("user1", { name: "Alice", age: 30 });
	const olderState = await tempStore1.state();

	// Wait to ensure newer eventstamps
	await Bun.sleep(5);

	// Add to main store with newer timestamp
	await store.insert("user1", { name: "Alice", age: 31 });

	const mockUpdate = mock();
	store.on("update", mockUpdate);

	// Try to merge older state - should keep local newer value
	await store.mergeState(olderState);

	// Update should NOT be called (nothing changed - local values are newer)
	expect(mockUpdate).toHaveBeenCalledTimes(0);

	const values = await store.values();
	// Local newer value should win
	expect(values.user1?.age).toBe(31);
});
