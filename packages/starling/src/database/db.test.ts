import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createDatabase } from "./db";
import { createMultiCollectionDb, createTestDb } from "./test-helpers";

describe("Database", () => {
	describe("initialization", () => {
		test("creates database with typed collections", async () => {
			const db = await createTestDb();

			expect(db.tasks).toBeDefined();
			expect(typeof db.tasks.add).toBe("function");
			expect(typeof db.tasks.get).toBe("function");
			expect(typeof db.tasks.update).toBe("function");
			expect(typeof db.tasks.remove).toBe("function");
			expect(typeof db.begin).toBe("function");
		});

		test("creates multiple collections", async () => {
			const db = await createMultiCollectionDb();

			expect(db.tasks).toBeDefined();
			expect(db.users).toBeDefined();
			expect(typeof db.begin).toBe("function");
		});

		test("supports custom getId functions", async () => {
			const db = await createDatabase({
				name: `kv-db-${crypto.randomUUID()}`,
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

			const item = await db.kv.add({ key: "foo", value: "bar" });
			expect(await db.kv.get("foo")).toEqual(item);
		});
	});

	describe("API surface", () => {
		test("provides collection CRUD methods", async () => {
			const db = await createTestDb();

			await db.tasks.add({ id: "1", title: "Task 1", completed: false });
			expect((await db.tasks.get("1"))?.title).toBe("Task 1");

			await db.tasks.update("1", { completed: true });
			expect((await db.tasks.get("1"))?.completed).toBe(true);

			await db.tasks.remove("1");
			expect(await db.tasks.get("1")).toBeNull();
		});

		test("provides transaction method", async () => {
			const db = await createTestDb();

			const result = await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Test", completed: false });
				return "success";
			});

			expect(result).toBe("success");
			expect((await db.tasks.get("1"))?.title).toBe("Test");
		});

		test("provides event subscription", async () => {
			const db = await createTestDb();
			const events: any[] = [];

			db.on("mutation", (e) => events.push(e));
			await db.tasks.add({ id: "1", title: "Test", completed: false });

			expect(events).toHaveLength(1);
		});
	});

	describe("events", () => {
		test("emits events with collection name", async () => {
			const db = await createTestDb();
			const dbEvents: any[] = [];
			db.on("mutation", (e) => dbEvents.push(e));

			await db.tasks.add({ id: "1", title: "Task 1", completed: false });

			expect(dbEvents).toHaveLength(1);
			expect(dbEvents[0].collection).toBe("tasks");
			expect(dbEvents[0].added).toHaveLength(1);
		});

		test("emits events from multiple collections", async () => {
			const db = await createMultiCollectionDb();
			const dbEvents: any[] = [];
			db.on("mutation", (e) => dbEvents.push(e));

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Task 1", completed: false });
				tx.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });
			});

			expect(dbEvents).toHaveLength(2);

			const tasksEvent = dbEvents.find((e) => e.collection === "tasks");
			expect(tasksEvent.added).toHaveLength(1);

			const usersEvent = dbEvents.find((e) => e.collection === "users");
			expect(usersEvent.added).toHaveLength(1);
		});

		test("keeps database subscriptions active after transactions", async () => {
			const db = await createTestDb();
			const events: any[] = [];
			db.on("mutation", (e) => events.push(e));

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Tx Task", completed: false });
			});

			await db.tasks.add({ id: "2", title: "Outside Task", completed: false });

			expect(events).toHaveLength(2);
			expect(events[0].collection).toBe("tasks");
			expect(events[1].collection).toBe("tasks");
		});

		test("keeps collection subscriptions active after transactions", async () => {
			const db = await createTestDb();
			const events: any[] = [];
			db.tasks.on("mutation", (e) => events.push(e));

			await db.begin(async (tx) => {
				tx.tasks.add({ id: "1", title: "Tx Task", completed: false });
			});

			await db.tasks.add({ id: "2", title: "Outside Task", completed: false });

			expect(events).toHaveLength(2);
			expect(events[0].added).toHaveLength(1);
			expect(events[1].added).toHaveLength(1);
		});
	});

	describe("toDocuments", () => {
		test("returns documents for all collections", async () => {
			const db = await createMultiCollectionDb();
			await db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			await db.tasks.add({ id: "task-2", title: "Walk dog", completed: true });
			await db.users.add({
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
			});

			const documents = await db.toDocuments();

			expect(documents.tasks).toBeDefined();
			expect(documents.users).toBeDefined();
			expect(documents.tasks.jsonapi.version).toBe("1.1");
			expect(documents.users.jsonapi.version).toBe("1.1");
			expect(documents.tasks.data).toHaveLength(2);
			expect(documents.users.data).toHaveLength(1);
		});

		test("returns empty documents for empty collections", async () => {
			const db = await createMultiCollectionDb();

			const documents = await db.toDocuments();

			expect(documents.tasks).toBeDefined();
			expect(documents.users).toBeDefined();
			expect(documents.tasks.data).toHaveLength(0);
			expect(documents.users.data).toHaveLength(0);
			expect(documents.tasks.meta.latest).toBeDefined();
			expect(documents.users.meta.latest).toBeDefined();
		});

		test("includes soft-deleted items in documents", async () => {
			const db = await createTestDb();
			await db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			await db.tasks.remove("task-1");

			const documents = await db.toDocuments();

			expect(documents.tasks.data).toHaveLength(1);
			expect(documents.tasks.data[0]?.meta.deletedAt).toBeDefined();
			expect(documents.tasks.data[0]?.meta.deletedAt).not.toBeNull();
		});

		test("includes correct latest eventstamps for each collection", async () => {
			const db = await createMultiCollectionDb();
			await db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });
			await db.users.add({
				id: "user-1",
				name: "Alice",
				email: "alice@example.com",
			});

			const documents = await db.toDocuments();

			expect(documents.tasks.meta.latest).toBeDefined();
			expect(documents.users.meta.latest).toBeDefined();
			expect(typeof documents.tasks.meta.latest).toBe("string");
			expect(typeof documents.users.meta.latest).toBe("string");
			expect(documents.tasks.meta.latest).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]+\|[0-9a-f]+$/,
			);
			expect(documents.users.meta.latest).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f]+\|[0-9a-f]+$/,
			);
		});
	});
});
