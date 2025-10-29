import { beforeEach, describe, expect, it } from "bun:test";
import { createStore, Store } from "@byearlybird/starling";
import { queryPlugin } from "./plugin";

type User = {
	name: string;
	active: boolean;
};

const makeStore = () => createStore<User>().use(queryPlugin()).init();

describe("QueryPlugin", () => {
	let store: Awaited<ReturnType<typeof makeStore>>;

	beforeEach(async () => {
		store = await makeStore();
	});

	it("returns matching items", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
			tx.add({ name: "Bob", active: false }, { withId: "user2" });
		});

		const results = activeUsers.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toEqual({ name: "Alice", active: true });
	});

	it("updates query results when items are patched", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add({ name: "Alice", active: false }, { withId: "user1" });
		});

		expect(activeUsers.results().size).toBe(0);

		store.begin((tx) => {
			tx.update("user1", { active: true });
		});

		expect(activeUsers.results().size).toBe(1);
	});

	it("removes items when they are deleted", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(activeUsers.results().size).toBe(1);

		store.begin((tx) => {
			tx.del("user1");
		});

		expect(activeUsers.results().size).toBe(0);
	});

	it("triggers onChange callbacks", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);
	});

	it("supports multiple independent queries", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		const inactiveUsers = store.query({ where: (user) => !user.active });

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
			tx.add({ name: "Bob", active: false }, { withId: "user2" });
		});

		expect(activeUsers.results().size).toBe(1);
		expect(inactiveUsers.results().size).toBe(1);
	});

	it("allows disposing of a query", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		activeUsers.dispose();

		store.begin((tx) => {
			tx.add({ name: "Bob", active: true }, { withId: "user2" });
		});

		expect(callCount).toBe(1);
	});

	it("unsubscribe removes the callback", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		let callCount = 0;

		const unsubscribe = activeUsers.onChange(() => {
			callCount++;
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		unsubscribe();

		store.begin((tx) => {
			tx.add({ name: "Bob", active: true }, { withId: "user2" });
		});

		expect(callCount).toBe(1);
	});

	it("supports select to transform results", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
			tx.add({ name: "Bob", active: false }, { withId: "user2" });
		});

		const results = activeUserNames.results();
		expect(results.size).toBe(1);
		expect(results.get("user1")).toBe("Alice");
	});

	it("select updates when data changes", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(activeUserNames.results().get("user1")).toBe("Alice");

		store.begin((tx) => {
			tx.update("user1", { name: "Alicia" });
		});

		expect(activeUserNames.results().get("user1")).toBe("Alicia");
	});

	it("select removes items that no longer match", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
		});

		expect(activeUserNames.results().size).toBe(1);

		store.begin((tx) => {
			tx.update("user1", { active: false });
		});

		expect(activeUserNames.results().size).toBe(0);
	});
});
