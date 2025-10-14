import { expect, mock, test } from "bun:test";
import { createStore } from "./store";

test("insert adds a new object to the store", () => {
	const store = createStore<{ name: string; age: number }>("users");

	store.insert("user1", { name: "Alice", age: 30 });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
	});
});

test("insert with duplicate key throws error", () => {
	const store = createStore<{ name: string }>("users");

	store.insert("user1", { name: "Alice" });

	expect(() => {
		store.insert("user1", { name: "Bob" });
	}).toThrow("Duplicate key: user1");
});

test("update modifies an existing object", () => {
	const store = createStore<{ name: string; age: number; city?: string }>("users");

	store.insert("user1", { name: "Alice", age: 30 });
	store.update("user1", { age: 31, city: "NYC" });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31, city: "NYC" },
	});
});

test("update with non-existent key throws error", () => {
	const store = createStore<{ name: string }>("users");

	expect(() => {
		store.update("user1", { name: "Alice" });
	}).toThrow("Key not found: user1");
});

test("values returns all objects in the store", () => {
	const store = createStore<{ name: string; age: number }>("users");

	store.insert("user1", { name: "Alice", age: 30 });
	store.insert("user2", { name: "Bob", age: 25 });
	store.insert("user3", { name: "Charlie", age: 35 });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
		user2: { name: "Bob", age: 25 },
		user3: { name: "Charlie", age: 35 },
	});
});

test("insert then update workflow preserves original data", () => {
	const store = createStore<{
		name: string;
		profile: { age: number; email?: string };
	}>("users");

	store.insert("user1", {
		name: "Alice",
		profile: { age: 30 },
	});

	store.update("user1", {
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

test("onInsert callback is called when inserting", () => {
	const store = createStore<{ name: string; age: number }>("users");
	const mockCallback = mock();

	store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice", age: 30 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([{ name: "Alice", age: 30 }]);
});

test("onUpdate callback is called when updating", () => {
	const store = createStore<{ name: string; age: number; city?: string }>("users");
	const mockCallback = mock();

	store.insert("user1", { name: "Alice", age: 30 });

	store.onUpdate(mockCallback);

	store.update("user1", { age: 31, city: "NYC" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([
		{ name: "Alice", age: 31, city: "NYC" },
	]);
});

test("onInsert callback receives correct data for multiple inserts", () => {
	const store = createStore<{ name: string }>("users");
	const mockCallback = mock();

	store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice" });
	store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(2);
	expect(mockCallback).toHaveBeenNthCalledWith(1, [{ name: "Alice" }]);
	expect(mockCallback).toHaveBeenNthCalledWith(2, [{ name: "Bob" }]);
});

test("onUpdate callback receives merged data", () => {
	const store = createStore<{ name: string; age: number; city?: string }>("users");
	const mockCallback = mock();

	store.insert("user1", { name: "Alice", age: 30 });

	store.onUpdate(mockCallback);

	store.update("user1", { city: "NYC" });
	store.update("user1", { age: 31 });

	expect(mockCallback).toHaveBeenCalledTimes(2);
	expect(mockCallback).toHaveBeenNthCalledWith(1, [
		{ name: "Alice", age: 30, city: "NYC" },
	]);
	expect(mockCallback).toHaveBeenNthCalledWith(2, [
		{ name: "Alice", age: 31, city: "NYC" },
	]);
});

test("unsubscribe from onInsert stops receiving callbacks", () => {
	const store = createStore<{ name: string }>("users");
	const mockCallback = mock();

	const unsubscribe = store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice" });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("unsubscribe from onUpdate stops receiving callbacks", () => {
	const store = createStore<{ name: string; age: number }>("users");
	const mockCallback = mock();

	store.insert("user1", { name: "Alice", age: 30 });

	const unsubscribe = store.onUpdate(mockCallback);

	store.update("user1", { age: 31 });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	store.update("user1", { age: 32 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("multiple callbacks can be registered and unsubscribed independently", () => {
	const store = createStore<{ name: string }>("users");
	const mockCallback1 = mock();
	const mockCallback2 = mock();

	const unsubscribe1 = store.onInsert(mockCallback1);

	store.onInsert(mockCallback2);

	store.insert("user1", { name: "Alice" });

	expect(mockCallback1).toHaveBeenCalledTimes(1);
	expect(mockCallback2).toHaveBeenCalledTimes(1);

	unsubscribe1();

	store.insert("user2", { name: "Bob" });

	expect(mockCallback1).toHaveBeenCalledTimes(1);
	expect(mockCallback2).toHaveBeenCalledTimes(2);
});

test("mergeState adds new keys and emits events", async () => {
	const store = createStore<{ name: string; age: number }>("users");

	// First add one user locally
	store.insert("user1", { name: "Alice", age: 30 });

	const mockInsert = mock();
	const mockUpdate = mock();
	store.onInsert(mockInsert);
	store.onUpdate(mockUpdate);

	// Wait to ensure newer eventstamps
	await Bun.sleep(5);

	// Merge remote state with one existing (user1) and one new (user2)
	const tempStore = createStore<{ name: string; age: number }>("users");
	tempStore.insert("user1", { name: "Alice", age: 31 });
	tempStore.insert("user2", { name: "Bob", age: 25 });

	store.mergeState(tempStore.state());

	// Should emit insert for new key (user2)
	expect(mockInsert).toHaveBeenCalledTimes(1);
	expect(mockInsert).toHaveBeenCalledWith([{ name: "Bob", age: 25 }]);

	// Should emit update for existing key (user1)
	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith([{ name: "Alice", age: 31 }]);

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31 },
		user2: { name: "Bob", age: 25 },
	});
});

test("mergeState merges existing keys with newer eventstamps", async () => {
	const store = createStore<{ name: string; age: number }>("users");
	store.insert("user1", { name: "Alice", age: 30 });

	const mockUpdate = mock();
	store.onUpdate(mockUpdate);

	// Simulate remote update with newer eventstamp
	await Bun.sleep(5);
	const tempStore = createStore<{ name: string; age: number }>("users");
	tempStore.insert("user1", { name: "Alice", age: 31 });

	store.mergeState(tempStore.state());

	expect(mockUpdate).toHaveBeenCalledTimes(1);
	expect(mockUpdate).toHaveBeenCalledWith([{ name: "Alice", age: 31 }]);

	const values = store.values();
	expect(values.user1?.age).toBe(31);
});

test("mergeState keeps local changes with newer eventstamps", async () => {
	const store = createStore<{ name: string; age: number }>("users");

	// Create initial state in temp store (older)
	const tempStore1 = createStore<{ name: string; age: number }>("users");
	tempStore1.insert("user1", { name: "Alice", age: 30 });
	const olderState = tempStore1.state();

	// Wait to ensure newer eventstamps
	await Bun.sleep(5);

	// Add to main store with newer timestamp
	store.insert("user1", { name: "Alice", age: 31 });

	const mockUpdate = mock();
	store.onUpdate(mockUpdate);

	// Try to merge older state - should keep local newer value
	store.mergeState(olderState);

	// Update should NOT be called (nothing changed - local values are newer)
	expect(mockUpdate).toHaveBeenCalledTimes(0);

	const values = store.values();
	// Local newer value should win
	expect(values.user1?.age).toBe(31);
});

test("getState returns encoded object for existing key", () => {
	const store = createStore<{ name: string; age: number }>("users");

	store.insert("user1", { name: "Alice", age: 30 });

	const state = store.getState("user1");

	expect(state).not.toBeNull();
	expect(typeof state).toBe("object");
});

test("getState returns null for non-existent key", () => {
	const store = createStore<{ name: string; age: number }>("users");

	const state = store.getState("user1");

	expect(state).toBeNull();
});
