import { expect, mock, test } from "bun:test";
import { createStore } from "./store";

test("insert adds a new object to the store", () => {
	const store = createStore<{ name: string; age: number }>();

	store.insert("user1", { name: "Alice", age: 30 });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 30 },
	});
});

test("insert with duplicate key throws error", () => {
	const store = createStore<{ name: string }>();

	store.insert("user1", { name: "Alice" });

	expect(() => {
		store.insert("user1", { name: "Bob" });
	}).toThrow("Duplicate key: user1");
});

test("update modifies an existing object", () => {
	const store = createStore<{ name: string; age: number; city?: string }>();

	store.insert("user1", { name: "Alice", age: 30 });
	store.update("user1", { age: 31, city: "NYC" });

	const values = store.values();
	expect(values).toEqual({
		user1: { name: "Alice", age: 31, city: "NYC" },
	});
});

test("update with non-existent key throws error", () => {
	const store = createStore<{ name: string }>();

	expect(() => {
		store.update("user1", { name: "Alice" });
	}).toThrow("Key not found: user1");
});

test("values returns all objects in the store", () => {
	const store = createStore<{ name: string; age: number }>();

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
	}>();

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
	const store = createStore<{ name: string; age: number }>();
	const mockCallback = mock();

	store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice", age: 30 });

	expect(mockCallback).toHaveBeenCalledTimes(1);
	expect(mockCallback).toHaveBeenCalledWith([{ name: "Alice", age: 30 }]);
});

test("onUpdate callback is called when updating", () => {
	const store = createStore<{ name: string; age: number; city?: string }>();
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
	const store = createStore<{ name: string }>();
	const mockCallback = mock();

	store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice" });
	store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(2);
	expect(mockCallback).toHaveBeenNthCalledWith(1, [{ name: "Alice" }]);
	expect(mockCallback).toHaveBeenNthCalledWith(2, [{ name: "Bob" }]);
});

test("onUpdate callback receives merged data", () => {
	const store = createStore<{ name: string; age: number; city?: string }>();
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
	const store = createStore<{ name: string }>();
	const mockCallback = mock();

	const unsubscribe = store.onInsert(mockCallback);

	store.insert("user1", { name: "Alice" });

	expect(mockCallback).toHaveBeenCalledTimes(1);

	unsubscribe();

	store.insert("user2", { name: "Bob" });

	expect(mockCallback).toHaveBeenCalledTimes(1);
});

test("unsubscribe from onUpdate stops receiving callbacks", () => {
	const store = createStore<{ name: string; age: number }>();
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
	const store = createStore<{ name: string }>();
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
