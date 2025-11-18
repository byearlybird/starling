import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createDatabase } from "./db";
import { createMultiCollectionDb, createTestDb } from "./test-helpers";

describe("Database", () => {
	describe("initialization", () => {
		test("creates database with typed collections", () => {
			const db = createTestDb();

			expect(db.tasks).toBeDefined();
			expect(typeof db.tasks.add).toBe("function");
			expect(typeof db.tasks.get).toBe("function");
			expect(typeof db.tasks.update).toBe("function");
			expect(typeof db.tasks.remove).toBe("function");
			expect(typeof db.begin).toBe("function");
		});

		test("creates multiple collections", () => {
			const db = createMultiCollectionDb();

			expect(db.tasks).toBeDefined();
			expect(db.users).toBeDefined();
			expect(typeof db.begin).toBe("function");
		});

		test("supports custom getId functions", () => {
			const db = createDatabase({
				schema: {
					kv: {
						schema: z.object({
							key: z.string(),
							value: z.string(),
						}),
						getId: (item) => item.key,
					},
				},
			});

			const item = db.kv.add({ key: "foo", value: "bar" });
			expect(db.kv.get("foo")).toEqual(item);
		});
	});

	describe("API surface", () => {
		test("provides collection CRUD methods", () => {
			const db = createTestDb();

			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			expect(db.tasks.get("1")?.title).toBe("Task 1");

			db.tasks.update("1", { completed: true });
			expect(db.tasks.get("1")?.completed).toBe(true);

			db.tasks.remove("1");
			expect(db.tasks.get("1")).toBeNull();
		});

		test("provides transaction method", () => {
			const db = createTestDb();

			const result = db.begin((tx) => {
				tx.tasks.add({ id: "1", title: "Test", completed: false });
				return "success";
			});

			expect(result).toBe("success");
			expect(db.tasks.get("1")?.title).toBe("Test");
		});

		test("provides event subscription", () => {
			const db = createTestDb();
			const events: any[] = [];

			db.on("mutation", (e) => events.push(e));
			db.tasks.add({ id: "1", title: "Test", completed: false });

			expect(events).toHaveLength(1);
		});
	});

	describe("events", () => {
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

	describe("toDocuments", () => {
		test("returns documents for all collections", () => {
			const db = createMultiCollectionDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			db.tasks.add({ id: "task-2", title: "Walk dog", completed: true });
			db.users.add({ id: "user-1", name: "Alice", email: "alice@example.com" });

			const documents = db.toDocuments();

			expect(documents.tasks).toBeDefined();
			expect(documents.users).toBeDefined();
			expect(documents.tasks.jsonapi.version).toBe("1.1");
			expect(documents.users.jsonapi.version).toBe("1.1");
			expect(documents.tasks.data).toHaveLength(2);
			expect(documents.users.data).toHaveLength(1);
		});

		test("returns empty documents for empty collections", () => {
			const db = createMultiCollectionDb();

			const documents = db.toDocuments();

			expect(documents.tasks).toBeDefined();
			expect(documents.users).toBeDefined();
			expect(documents.tasks.data).toHaveLength(0);
			expect(documents.users.data).toHaveLength(0);
			expect(documents.tasks.meta.latest).toBeDefined();
			expect(documents.users.meta.latest).toBeDefined();
		});

		test("includes soft-deleted items in documents", () => {
			const db = createTestDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			db.tasks.remove("task-1");

			const documents = db.toDocuments();

			expect(documents.tasks.data).toHaveLength(1);
			expect(documents.tasks.data[0].meta.deletedAt).toBeDefined();
			expect(documents.tasks.data[0].meta.deletedAt).not.toBeNull();
		});

		test("includes correct latest eventstamps for each collection", () => {
			const db = createMultiCollectionDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			db.users.add({ id: "user-1", name: "Alice", email: "alice@example.com" });

			const documents = db.toDocuments();

			expect(documents.tasks.meta.latest).toBeDefined();
			expect(documents.users.meta.latest).toBeDefined();
			expect(typeof documents.tasks.meta.latest).toBe("string");
			expect(typeof documents.users.meta.latest).toBe("string");
			expect(documents.tasks.meta.latest).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]+\|[0-9a-f]+$/);
			expect(documents.users.meta.latest).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]+\|[0-9a-f]+$/);
		});
	});
});
