import { beforeEach, describe, expect, it } from "bun:test";
import { Store } from "./store";

type User = {
	name: string;
	active: boolean;
};

const makeStore = () => new Store<User>({ resourceType: "users" }).init();

const ACTIVE_ALICE = { name: "Alice", active: true };
const INACTIVE_ALICE = { name: "Alice", active: false };
const ACTIVE_BOB = { name: "Bob", active: true };
const INACTIVE_BOB = { name: "Bob", active: false };

describe("Store - Queries", () => {
	let store: Awaited<ReturnType<typeof makeStore>>;

	beforeEach(async () => {
		store = await makeStore();
	});

	it("returns matching items", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(INACTIVE_BOB, { withId: "user2" });
		});

		const results = activeUsers.results();
		expect(results.length).toBe(1);
		expect(results.find(([id]) => id === "user1")?.[1]).toEqual(ACTIVE_ALICE);
	});

	it("updates query results when items are patched", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add(INACTIVE_ALICE, { withId: "user1" });
		});

		expect(activeUsers.results().length).toBe(0);

		store.begin((tx) => {
			tx.update("user1", { active: true });
		});

		expect(activeUsers.results().length).toBe(1);
	});

	it("removes items when they are deleted", () => {
		const activeUsers = store.query({ where: (user) => user.active });

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(activeUsers.results().length).toBe(1);

		store.begin((tx) => {
			tx.del("user1");
		});

		expect(activeUsers.results().length).toBe(0);
	});

	it("triggers onChange callbacks", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(callCount).toBe(1);
	});

	it("supports multiple independent queries", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		const inactiveUsers = store.query({ where: (user) => !user.active });

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(INACTIVE_BOB, { withId: "user2" });
		});

		expect(activeUsers.results().length).toBe(1);
		expect(inactiveUsers.results().length).toBe(1);
	});

	it("allows disposing of a query", () => {
		const activeUsers = store.query({ where: (user) => user.active });
		let callCount = 0;

		activeUsers.onChange(() => {
			callCount++;
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		activeUsers.dispose();

		store.begin((tx) => {
			tx.add(ACTIVE_BOB, { withId: "user2" });
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
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(callCount).toBe(1);

		unsubscribe();

		store.begin((tx) => {
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		expect(callCount).toBe(1);
	});

	it("supports select to transform results", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(INACTIVE_BOB, { withId: "user2" });
		});

		const results = activeUserNames.results();
		expect(results.length).toBe(1);
		expect(results.find(([id]) => id === "user1")?.[1]).toBe("Alice");
	});

	it("select updates when data changes", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(activeUserNames.results().find(([id]) => id === "user1")?.[1]).toBe(
			"Alice",
		);

		store.begin((tx) => {
			tx.update("user1", { name: "Alice Smith" });
		});

		expect(activeUserNames.results().find(([id]) => id === "user1")?.[1]).toBe(
			"Alice Smith",
		);
	});

	it.each([
		{
			desc: "when predicate fails",
			action: (tx: ReturnType<typeof store.begin>) =>
				tx.update("user1", { active: false }),
		},
		{
			desc: "when they are deleted",
			action: (tx: ReturnType<typeof store.begin>) => tx.del("user1"),
		},
	])("select removes items $desc", ({ action }) => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
		});

		expect(activeUserNames.results().length).toBe(1);

		store.begin((tx) => action(tx));

		expect(activeUserNames.results().length).toBe(0);
	});

	it("supports order comparator", () => {
		const users = store.query({
			where: () => true,
			order: (a, b) => a.name.localeCompare(b.name),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		const results = users.results().map(([, user]) => user);
		expect(results.map((user) => user.name)).toEqual([
			"Alice",
			"Bob",
			"Charlie",
		]);
	});

	it("supports reverse order comparator", () => {
		const users = store.query({
			where: () => true,
			order: (a, b) => b.name.localeCompare(a.name),
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		const results = users.results().map(([, user]) => user);
		expect(results.map((user) => user.name)).toEqual([
			"Charlie",
			"Bob",
			"Alice",
		]);
	});

	it("supports order with select transformation", () => {
		const userNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
			order: (a, b) => a.localeCompare(b),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		const results = userNames.results().map(([, name]) => name);
		expect(results).toEqual(["Alice", "Bob", "Charlie"]);
	});

	it("maintains sort order when items are updated", () => {
		const userNames = store.query({
			where: () => true,
			select: (user) => user.name,
			order: (a, b) => a.localeCompare(b),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		store.begin((tx) => {
			tx.update("user3", { name: "Aaron" });
		});

		const results = userNames.results().map(([, name]) => name);
		expect(results).toEqual(["Aaron", "Alice", "Bob"]);
	});

	it("excludes non-matching items from sorted results", () => {
		const activeUserNames = store.query({
			where: (user) => user.active,
			select: (user) => user.name,
			order: (a, b) => a.localeCompare(b),
		});

		store.begin((tx) => {
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
			tx.add(INACTIVE_ALICE, { withId: "user1" });
			tx.add(ACTIVE_BOB, { withId: "user2" });
		});

		const results = activeUserNames.results().map(([, name]) => name);
		expect(results).toEqual(["Bob", "Charlie"]);
	});

	it("sorts by numeric values", () => {
		const usersByScore = store.query({
			where: () => true,
			select: (user) => ({ ...user, score: user.active ? 10 : 5 }),
			order: (a, b) => b.score - a.score,
		});

		store.begin((tx) => {
			tx.add(ACTIVE_ALICE, { withId: "user1" });
			tx.add(INACTIVE_BOB, { withId: "user2" });
			tx.add({ name: "Charlie", active: true }, { withId: "user3" });
		});

		const results = usersByScore.results().map(([, user]) => user);
		expect(results.map((user) => user.name)).toEqual([
			"Alice",
			"Charlie",
			"Bob",
		]);
	});
});
