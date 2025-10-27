import { beforeEach, describe, expect, it } from "bun:test";
import { Store } from "@byearlybird/starling";
import { queryPlugin } from "./plugin";

type User = {
	name: string;
	active: boolean;
	age: number;
};

const createStore = () => Store.create<User>().use(queryPlugin());

type StoreWithQuery = ReturnType<typeof createStore>;

describe("QueryPlugin", () => {
	let store: StoreWithQuery;

	beforeEach(() => {
		store = createStore();
	});

	it("creates a query and returns matching items", () => {
		const activeUsers = store.query((user) => user.active);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		store.put({ "~id": "user3", name: "Charlie", active: true, age: 35 });

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

	it("prepopulates query results when registered after data exists", () => {
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		store.put({ "~id": "user3", name: "Charlie", active: true, age: 35 });

		const activeUsers = store.query((user) => user.active);
		const results = activeUsers.results();

		expect(results.size).toBe(2);
		expect(results.get("user1")?.name).toBe("Alice");
		expect(results.get("user3")?.name).toBe("Charlie");

		const inactiveUsers = store.query((user) => !user.active);
		const inactiveResults = inactiveUsers.results();

		expect(inactiveResults.size).toBe(1);
		expect(inactiveResults.get("user2")?.name).toBe("Bob");
	});

	it("updates query results when items are patched", () => {
		const activeUsers = store.query((user) => user.active);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });

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
		const activeUsers = store.query((user) => user.active);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });

		expect(activeUsers.results().size).toBe(2);

		// Patch user1 to be inactive
		store.patch("user1", { active: false });

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toBeUndefined();
		expect(results.get("user2")).toBeDefined();
	});

	it("removes items when they are deleted", () => {
		const activeUsers = store.query((user) => user.active);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });

		expect(activeUsers.results().size).toBe(2);

		store.del("user1");

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toBeUndefined();
	});

	it("triggers onChange callbacks whenever query data mutates", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		expect(callCount).toBe(1); // No change, user2 doesn't match

		store.patch("user2", { active: true });
		expect(callCount).toBe(2); // Changed, user2 now matches

		store.patch("user1", { age: 31 });
		expect(callCount).toBe(3); // Value change still notifies subscribers

		store.patch("user1", { active: true });
		expect(callCount).toBe(4); // Patch still notifies even if predicate unchanged
	});

	it("does not trigger callbacks for non-matching items", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put({ "~id": "user1", name: "Alice", active: false, age: 30 });
		expect(callCount).toBe(0);

		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		expect(callCount).toBe(0);
	});

	it("supports multiple independent queries", () => {
		const activeUsers = store.query((user) => user.active);
		const youngUsers = store.query((user) => user.age < 30);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		store.put({ "~id": "user3", name: "Charlie", active: true, age: 35 });

		expect(activeUsers.results().size).toBe(2);
		expect(youngUsers.results().size).toBe(1);
	});

	it("allows disposing of a query", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		activeUsers.dispose();

		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });
		expect(callCount).toBe(1); // No more callbacks after dispose
	});

	it("returns a new Map from results() to prevent external mutation", () => {
		const activeUsers = store.query((user) => user.active);

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });

		const results1 = activeUsers.results();
		const results2 = activeUsers.results();

		expect(results1).not.toBe(results2); // Different Map instances
		expect(results1.get("user1")).toEqual(results2.get("user1"));
	});

	it("unsubscribe from onChange returns a function that removes the callback", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		const unsubscribe = activeUsers.onChange(() => {
			callCount++;
		});

		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		unsubscribe();

		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });
		expect(callCount).toBe(1); // No more callbacks after unsubscribe
	});

	it("populates queries with existing store entries before init", async () => {
		// Add items before calling init
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		store.put({ "~id": "user3", name: "Charlie", active: true, age: 35 });

		// Create queries before init - they should be populated immediately
		const activeUsers = store.query((user) => user.active);
		const inactiveUsers = store.query((user) => !user.active);

		// Queries should be populated immediately even before init
		const activeResults = activeUsers.results();
		expect(activeResults.size).toBe(2);
		expect(activeResults.get("user1")).toEqual({
			name: "Alice",
			active: true,
			age: 30,
		});
		expect(activeResults.get("user3")).toEqual({
			name: "Charlie",
			active: true,
			age: 35,
		});

		const inactiveResults = inactiveUsers.results();
		expect(inactiveResults.size).toBe(1);
		expect(inactiveResults.get("user2")).toEqual({
			name: "Bob",
			active: false,
			age: 25,
		});

		// Initialize the store - results should remain consistent
		await store.init();
		expect(activeUsers.results().size).toBe(2);
		expect(inactiveUsers.results().size).toBe(1);
	});

	it("populates queries registered before init", async () => {
		// Create a fresh store with the plugin
		const freshStore: StoreWithQuery = Store.create<User>().use(
			queryPlugin(),
		) as StoreWithQuery;

		// Add data first
		freshStore.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		freshStore.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		freshStore.put({ "~id": "user3", name: "Charlie", active: true, age: 35 });

		// Create query BEFORE calling init - should be populated immediately
		const freshActiveUsers = freshStore.query((user) => user.active);

		// Verify query is already populated
		const resultsBefore = freshActiveUsers.results();
		expect(resultsBefore.size).toBe(2);
		expect(resultsBefore.get("user1")?.name).toBe("Alice");
		expect(resultsBefore.get("user3")?.name).toBe("Charlie");

		// Init should not change the results (they're already populated)
		await freshStore.init();

		const resultsAfter = freshActiveUsers.results();
		expect(resultsAfter.size).toBe(2);
		expect(resultsAfter.get("user1")?.name).toBe("Alice");
		expect(resultsAfter.get("user3")?.name).toBe("Charlie");
	});

	it("fires all registered callbacks on the same query", () => {
		const activeUsers = store.query((user) => user.active);
		let callback1Count = 0;
		let callback2Count = 0;
		let callback3Count = 0;

		activeUsers.onChange(() => {
			callback1Count++;
		});
		activeUsers.onChange(() => {
			callback2Count++;
		});
		activeUsers.onChange(() => {
			callback3Count++;
		});

		// Add a matching item - all callbacks should fire
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(callback1Count).toBe(1);
		expect(callback2Count).toBe(1);
		expect(callback3Count).toBe(1);

		// Add another matching item - all callbacks should fire again
		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });
		expect(callback1Count).toBe(2);
		expect(callback2Count).toBe(2);
		expect(callback3Count).toBe(2);
	});

	it("triggers onChange when matching items are deleted", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		// Add matching items
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		store.put({ "~id": "user2", name: "Bob", active: true, age: 25 });
		expect(callCount).toBe(2);

		// Delete a matching item - should trigger onChange
		store.del("user1");
		expect(callCount).toBe(3);

		// Delete the other matching item - should trigger onChange again
		store.del("user2");
		expect(callCount).toBe(4);

		// Delete a non-existent item - should not trigger onChange
		store.del("user3");
		expect(callCount).toBe(4);
	});

	it("fires callbacks for every query whose tracked data changed", () => {
		const activeUsers = store.query((user) => user.active);
		const youngUsers = store.query((user) => user.age < 30);
		let activeCallCount = 0;
		let youngCallCount = 0;

		activeUsers.onChange(() => {
			activeCallCount++;
		});
		youngUsers.onChange(() => {
			youngCallCount++;
		});

		// Add item matching only activeUsers
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(activeCallCount).toBe(1);
		expect(youngCallCount).toBe(0); // Should not fire

		// Add item matching only youngUsers
		store.put({ "~id": "user2", name: "Bob", active: false, age: 25 });
		expect(activeCallCount).toBe(1); // Should not fire
		expect(youngCallCount).toBe(1);

		// Add item matching both queries
		store.put({ "~id": "user3", name: "Charlie", active: true, age: 25 });
		expect(activeCallCount).toBe(2);
		expect(youngCallCount).toBe(2);

		// Patch to remove from youngUsers only
		store.patch("user3", { age: 35 });
		expect(activeCallCount).toBe(3); // Still fires because tracked data changed
		expect(youngCallCount).toBe(3); // Should fire (no longer young)
	});

	it("still emits onChange when patching non-predicate fields", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		// Add a matching item
		store.put({ "~id": "user1", name: "Alice", active: true, age: 30 });
		expect(callCount).toBe(1);

		// Patch a field that doesn't affect the predicate
		store.patch("user1", { name: "Alice Smith" });
		expect(callCount).toBe(2); // Should fire to reflect data change

		// Patch age (also doesn't affect the predicate)
		store.patch("user1", { age: 31 });
		expect(callCount).toBe(3); // Should fire to reflect data change

		// Patch the predicate field to a different value but still matching
		store.patch("user1", { active: true });
		expect(callCount).toBe(4); // Should fire even though still matches

		// Patch the predicate field to stop matching
		store.patch("user1", { active: false });
		expect(callCount).toBe(5); // Should fire (no longer matches)
	});
});
