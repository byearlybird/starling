import { expect, test } from "bun:test";
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
