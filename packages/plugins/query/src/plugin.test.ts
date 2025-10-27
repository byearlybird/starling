import { beforeEach, describe, expect, it } from "bun:test";
import { Store } from "@byearlybird/starling";
import { queryPlugin } from "./plugin";

type User = {
	name: string;
	active: boolean;
};

const createStore = () => Store.create<User>().use(queryPlugin()).init();

describe("QueryPlugin", () => {
	let store: Awaited<ReturnType<typeof createStore>>;

	beforeEach(async () => {
		store = await createStore();
	});

	it("returns matching items", () => {
		const activeUsers = store.query((user) => user.active);

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
			tx.put({ name: "Bob", active: false }, { withId: "user2" });
		});

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toEqual({ name: "Alice", active: true });
	});

	it("updates query results when items are patched", () => {
		const activeUsers = store.query((user) => user.active);

		store.set((tx) => {
			tx.put({ name: "Alice", active: false }, { withId: "user1" });
		});

		expect(activeUsers.results().size).toBe(0);

		store.set((tx) => {
			tx.patch("user1", { active: true });
		});

		expect(activeUsers.results().size).toBe(1);
	});

	it("removes items when they are deleted", () => {
		const activeUsers = store.query((user) => user.active);

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(activeUsers.results().size).toBe(1);

		store.set((tx) => {
			tx.del("user1");
		});

		expect(activeUsers.results().size).toBe(0);
	});

	it("triggers onChange callbacks", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);
	});

	it("supports multiple independent queries", () => {
		const activeUsers = store.query((user) => user.active);
		const inactiveUsers = store.query((user) => !user.active);

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
			tx.put({ name: "Bob", active: false }, { withId: "user2" });
		});

		expect(activeUsers.results().size).toBe(1);
		expect(inactiveUsers.results().size).toBe(1);
	});

	it("allows disposing of a query", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		activeUsers.dispose();

		store.set((tx) => {
			tx.put({ name: "Bob", active: true }, { withId: "user2" });
		});

		expect(callCount).toBe(1);
	});

	it("unsubscribe removes the callback", () => {
		const activeUsers = store.query((user) => user.active);
		let callCount = 0;

		const unsubscribe = activeUsers.onChange(() => {
			callCount++;
		});

		store.set((tx) => {
			tx.put({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		unsubscribe();

		store.set((tx) => {
			tx.put({ name: "Bob", active: true }, { withId: "user2" });
		});

		expect(callCount).toBe(1);
	});
});
