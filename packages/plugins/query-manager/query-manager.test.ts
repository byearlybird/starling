import { beforeEach, describe, expect, it } from "bun:test";
import { create as createStore } from "@byearlybird/starling/src/store";
import { createQueryManager } from "./query-manager";

type User = {
	name: string;
	active: boolean;
	age: number;
};

describe("QueryManager", () => {
	let store: ReturnType<typeof createStore<User>>;
	let queries: ReturnType<typeof createQueryManager<User>>;

	beforeEach(() => {
		store = createStore<User>();
		queries = createQueryManager<User>();
		store.use(() => queries.plugin());
	});

	it("creates a query and returns matching items", () => {
		const activeUsers = queries.query((user) => user.active);

		store.put("user1", { name: "Alice", active: true, age: 30 });
		store.put("user2", { name: "Bob", active: false, age: 25 });
		store.put("user3", { name: "Charlie", active: true, age: 35 });

		const results = activeUsers.results();
		expect(results.size).toBe(2);
		expect(results.get("user1")).toEqual({
			name: "Alice",
			active: true,
			age: 30,
		});
		expect(results.get("user3")).toEqual({
			name: "Charlie",
			active: true,
			age: 35,
		});
	});

	it("updates query results when items are patched", () => {
		const activeUsers = queries.query((user) => user.active);

		store.put("user1", { name: "Alice", active: true, age: 30 });
		store.put("user2", { name: "Bob", active: false, age: 25 });

		expect(activeUsers.results().size).toBe(1);

		// Patch user2 to be active
		store.patch("user2", { active: true });

		const results = activeUsers.results();
		expect(results.size).toBe(2);
		expect(results.get("user2")).toEqual({
			name: "Bob",
			active: true,
			age: 25,
		});
	});

	it("removes items from query results when they no longer match", () => {
		const activeUsers = queries.query((user) => user.active);

		store.put("user1", { name: "Alice", active: true, age: 30 });
		store.put("user2", { name: "Bob", active: true, age: 25 });

		expect(activeUsers.results().size).toBe(2);

		// Patch user1 to be inactive
		store.patch("user1", { active: false });

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toBeUndefined();
		expect(results.get("user2")).toBeDefined();
	});

	it("removes items when they are deleted", () => {
		const activeUsers = queries.query((user) => user.active);

		store.put("user1", { name: "Alice", active: true, age: 30 });
		store.put("user2", { name: "Bob", active: true, age: 25 });

		expect(activeUsers.results().size).toBe(2);

		store.del("user1");

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toBeUndefined();
	});

	it("triggers onChange callbacks when results change", () => {
		const activeUsers = queries.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put("user1", { name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		store.put("user2", { name: "Bob", active: false, age: 25 });
		expect(callCount).toBe(1); // No change, user2 doesn't match

		store.patch("user2", { active: true });
		expect(callCount).toBe(2); // Changed, user2 now matches

		store.patch("user1", { age: 31 });
		expect(callCount).toBe(2); // No change, user1 still active
	});

	it("does not trigger callbacks for non-matching items", () => {
		const activeUsers = queries.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put("user1", { name: "Alice", active: false, age: 30 });
		expect(callCount).toBe(0);

		store.put("user2", { name: "Bob", active: false, age: 25 });
		expect(callCount).toBe(0);
	});

	it("supports multiple independent queries", () => {
		const activeUsers = queries.query((user) => user.active);
		const youngUsers = queries.query((user) => user.age < 30);

		store.put("user1", { name: "Alice", active: true, age: 30 });
		store.put("user2", { name: "Bob", active: false, age: 25 });
		store.put("user3", { name: "Charlie", active: true, age: 35 });

		expect(activeUsers.results().size).toBe(2);
		expect(youngUsers.results().size).toBe(1);
	});

	it("allows disposing of a query", () => {
		const activeUsers = queries.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put("user1", { name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		activeUsers.dispose();

		store.put("user2", { name: "Bob", active: true, age: 25 });
		expect(callCount).toBe(1); // No more callbacks after dispose
	});

	it("returns a new Map from results() to prevent external mutation", () => {
		const activeUsers = queries.query((user) => user.active);

		store.put("user1", { name: "Alice", active: true, age: 30 });

		const results1 = activeUsers.results();
		const results2 = activeUsers.results();

		expect(results1).not.toBe(results2); // Different Map instances
		expect(results1.get("user1")).toEqual(results2.get("user1"));
	});

	it("unsubscribe from onChange returns a function that removes the callback", () => {
		const activeUsers = queries.query((user) => user.active);
		let callCount = 0;

		const unsubscribe = activeUsers.onChange(() => {
			callCount++;
		});

		store.put("user1", { name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		unsubscribe();

		store.put("user2", { name: "Bob", active: true, age: 25 });
		expect(callCount).toBe(1); // No more callbacks after unsubscribe
	});
});
