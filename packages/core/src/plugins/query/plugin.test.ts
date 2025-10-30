import { beforeEach, describe, expect, it } from "bun:test";
import { createStore } from "../../store";
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

	it("sorts results by order comparator", () => {
		const sortedUsers = store.query({
			where: (user) => user.active,
			order: (a, b) => a.name.localeCompare(b.name),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user1" });
			tx.add({ name: "Alice", active: true }, { withId: "user2" });
			tx.add({ name: "Bob", active: true }, { withId: "user3" });
		});

		const results = Array.from(sortedUsers.results().values());
		expect(results.length).toBe(3);
		expect(results.at(0)?.name).toBe("Alice");
		expect(results.at(1)?.name).toBe("Bob");
		expect(results.at(2)?.name).toBe("Charlie");
	});

	it("sorts in reverse order", () => {
		const reverseSortedUsers = store.query({
			where: (user) => user.active,
			order: (a, b) => b.name.localeCompare(a.name),
		});

		store.begin((tx) => {
			tx.add({ name: "Alice", active: true }, { withId: "user1" });
			tx.add({ name: "Bob", active: true }, { withId: "user2" });
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
		});

		const results = Array.from(reverseSortedUsers.results().values());
		expect(results.length).toBe(3);
		expect(results.at(0)?.name).toBe("Charlie");
		expect(results.at(1)?.name).toBe("Bob");
		expect(results.at(2)?.name).toBe("Alice");
	});

	it("sorts with select transformation", () => {
		const sortedNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
			order: (a, b) => a.localeCompare(b),
		});

		store.begin((tx) => {
			tx.add({ name: "Zoe", active: true }, { withId: "user1" });
			tx.add({ name: "Amy", active: true }, { withId: "user2" });
			tx.add({ name: "Max", active: true }, { withId: "user3" });
		});

		const results = Array.from(sortedNames.results().values());
		expect(results.length).toBe(3);
		expect(results.at(0)).toBe("Amy");
		expect(results.at(1)).toBe("Max");
		expect(results.at(2)).toBe("Zoe");
	});

	it("maintains sort order when items are updated", () => {
		const sortedUsers = store.query({
			where: (user) => user.active,
			order: (a, b) => a.name.localeCompare(b.name),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user1" });
			tx.add({ name: "Alice", active: true }, { withId: "user2" });
		});

		let results = Array.from(sortedUsers.results().values());
		expect(results.length).toBe(2);
		expect(results.at(0)?.name).toBe("Alice");
		expect(results.at(1)?.name).toBe("Charlie");

		store.begin((tx) => {
			tx.update("user1", { name: "Zoe" });
		});

		results = Array.from(sortedUsers.results().values());
		expect(results.length).toBe(2);
		expect(results.at(0)?.name).toBe("Alice");
		expect(results.at(1)?.name).toBe("Zoe");
	});

	it("excludes non-matching items from sorted results", () => {
		const sortedActiveUsers = store.query({
			where: (user) => user.active,
			order: (a, b) => a.name.localeCompare(b.name),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user1" });
			tx.add({ name: "Alice", active: false }, { withId: "user2" });
			tx.add({ name: "Bob", active: true }, { withId: "user3" });
		});

		const results = Array.from(sortedActiveUsers.results().values());
		expect(results.length).toBe(2);
		expect(results.at(0)?.name).toBe("Bob");
		expect(results.at(1)?.name).toBe("Charlie");
	});

	it("sorts by numeric values", async () => {
		type Todo = { title: string; priority: number };
		const todoStore = await createStore<Todo>().use(queryPlugin()).init();

		const sortedByPriority = todoStore.query({
			where: () => true,
			order: (a, b) => a.priority - b.priority,
		});

		todoStore.begin((tx) => {
			tx.add({ title: "High", priority: 3 }, { withId: "todo1" });
			tx.add({ title: "Low", priority: 1 }, { withId: "todo2" });
			tx.add({ title: "Medium", priority: 2 }, { withId: "todo3" });
		});

		const results = Array.from(sortedByPriority.results().values());
		expect(results.length).toBe(3);
		expect(results.at(0)?.priority).toBe(1);
		expect(results.at(1)?.priority).toBe(2);
		expect(results.at(2)?.priority).toBe(3);

		await todoStore.dispose();
	});
});
