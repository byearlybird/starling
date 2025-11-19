import { describe, expect, test } from "bun:test";
import { createMultiCollectionDb, createTestDb, makeTaskDocument } from "./test-helpers";

describe("Mutation Events", () => {
	describe("collection-level events", () => {
		test("emits add event", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.tasks.add({ id: "1", title: "Buy milk", completed: false });

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				added: [{ id: "1", item: { id: "1", title: "Buy milk", completed: false } }],
				updated: [],
				removed: [],
			});
		});

		test("emits update event with before/after", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Buy milk", completed: false });

			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.tasks.update("1", { completed: true });

			expect(events).toHaveLength(1);
			expect(events[0].added).toEqual([]);
			expect(events[0].removed).toEqual([]);
			expect(events[0].updated).toHaveLength(1);
			expect(events[0].updated[0]).toEqual({
				id: "1",
				before: { id: "1", title: "Buy milk", completed: false },
				after: { id: "1", title: "Buy milk", completed: true },
			});
		});

		test("emits remove event", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Buy milk", completed: false });

			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.tasks.remove("1");

			expect(events).toHaveLength(1);
			expect(events[0]).toEqual({
				added: [],
				updated: [],
				removed: [{ id: "1", item: { id: "1", title: "Buy milk", completed: false } }],
			});
		});

		test("supports unsubscribe", () => {
			const db = createTestDb();
			const events: any[] = [];
			const unsubscribe = db.tasks.on("mutation", (e) => events.push(e));

			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			expect(events).toHaveLength(1);

			unsubscribe();
			db.tasks.add({ id: "2", title: "Task 2", completed: false });

			expect(events).toHaveLength(1);
		});
	});

	describe("database-level events", () => {
		test("emits events with collection name", () => {
			const db = createTestDb();
			const dbEvents: any[] = [];
			db.on("mutation", (e) => dbEvents.push(e));

			db.tasks.add({ id: "1", title: "Task 1", completed: false });

			expect(dbEvents).toHaveLength(1);
			expect(dbEvents[0]).toHaveLength(1);
			expect(dbEvents[0][0].collection).toBe("tasks");
			expect(dbEvents[0][0].added).toHaveLength(1);
		});

		test("emits events from multiple collections", () => {
			const db = createMultiCollectionDb();
			const dbEvents: any[] = [];
			db.on("mutation", (e) => dbEvents.push(e));

			db.begin((tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });
			});

			expect(dbEvents).toHaveLength(2);

			const tasksEvent = dbEvents.find((e) => e[0].collection === "tasks");
			expect(tasksEvent[0].added).toHaveLength(1);

			const usersEvent = dbEvents.find((e) => e[0].collection === "users");
			expect(usersEvent[0].added).toHaveLength(1);
		});
	});

	describe("transaction event batching", () => {
		test("batches multiple adds into single event", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.begin((tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.tasks.add({ id: "2", title: "Task 2", completed: false });
				tx.tasks.add({ id: "3", title: "Task 3", completed: false });
			});

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(3);
		});

		test("batches mixed operations into single event", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: false });

			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.begin((tx) => {
				tx.tasks.add({ id: "3", title: "Task 3", completed: false });
				tx.tasks.update("1", { completed: true });
				tx.tasks.remove("2");
			});

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(1);
			expect(events[0].updated).toHaveLength(1);
			expect(events[0].removed).toHaveLength(1);
		});

		test("emits no events on rollback", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.begin((tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.rollback();
			});

			expect(events).toHaveLength(0);
		});

		test("emits no events on exception", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			try {
				db.begin((tx) => {
					tx.tasks.add({ id: "1", title: "Task 1", completed: false });
					throw new Error("Oops!");
				});
			} catch {
				// Expected
			}

			expect(events).toHaveLength(0);
		});
	});

	describe("merge events", () => {
		test("emits add events for new resources", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			const doc = makeTaskDocument([
				{ id: "task-1", title: "Buy milk", completed: false },
			]);

			db.tasks.merge(doc);

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(1);
			expect(events[0].added[0].id).toBe("task-1");
			expect(events[0].updated).toHaveLength(0);
			expect(events[0].removed).toHaveLength(0);
		});

		test("emits update events for changed resources", () => {
			const db = createTestDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			const doc = makeTaskDocument(
				[{ id: "task-1", title: "Buy milk", completed: true }],
				"2099-01-01T00:05:00.000Z|0001|c3d4",
			);

			db.tasks.merge(doc);

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(0);
			expect(events[0].updated).toHaveLength(1);
			expect(events[0].updated[0].before.completed).toBe(false);
			expect(events[0].updated[0].after.completed).toBe(true);
			expect(events[0].removed).toHaveLength(0);
		});

		test("batches events in transactions", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.begin((tx) => {
				const doc = makeTaskDocument([
					{ id: "task-1", title: "Buy milk", completed: false },
				]);
				tx.tasks.merge(doc);
			});

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(1);
		});

		test("discards events on rollback", () => {
			const db = createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			db.begin((tx) => {
				const doc = makeTaskDocument([
					{ id: "task-1", title: "Buy milk", completed: false },
				]);
				tx.tasks.merge(doc);
				tx.rollback();
			});

			expect(db.tasks.get("task-1")).toBeNull();
			expect(events).toHaveLength(0);
		});
	});
});
