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

	describe("plugins", () => {
		test("database has init() and dispose() methods", () => {
			const db = createTestDb();

			expect(typeof db.init).toBe("function");
			expect(typeof db.dispose).toBe("function");
		});

		test("init() and dispose() return promises", async () => {
			const db = createTestDb();

			const initResult = db.init();
			expect(initResult instanceof Promise).toBe(true);
			await initResult;

			const disposeResult = db.dispose();
			expect(disposeResult instanceof Promise).toBe(true);
			await disposeResult;
		});

		test("plugin init handlers are called in registration order", async () => {
			const calls: string[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: () => {
								calls.push("plugin1-init");
							},
						},
					},
					{
						handlers: {
							init: () => {
								calls.push("plugin2-init");
							},
						},
					},
					{
						handlers: {
							init: () => {
								calls.push("plugin3-init");
							},
						},
					},
				],
			});

			await db.init();

			expect(calls).toEqual(["plugin1-init", "plugin2-init", "plugin3-init"]);
		});

		test("plugin dispose handlers are called in reverse order", async () => {
			const calls: string[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							dispose: () => {
								calls.push("plugin1-dispose");
							},
						},
					},
					{
						handlers: {
							dispose: () => {
								calls.push("plugin2-dispose");
							},
						},
					},
					{
						handlers: {
							dispose: () => {
								calls.push("plugin3-dispose");
							},
						},
					},
				],
			});

			await db.dispose();

			expect(calls).toEqual([
				"plugin3-dispose",
				"plugin2-dispose",
				"plugin1-dispose",
			]);
		});

		test("plugins can access database instance", async () => {
			let dbInstance: any = null;

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: (db) => {
								dbInstance = db;
							},
						},
					},
				],
			});

			await db.init();

			expect(dbInstance).toBe(db);
			expect(dbInstance.tasks).toBeDefined();
			expect(typeof dbInstance.begin).toBe("function");
		});

		test("plugins can perform database operations", async () => {
			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: (db) => {
								db.tasks.add({
									id: "plugin-task",
									title: "Added by plugin",
									completed: false,
								});
							},
						},
					},
				],
			});

			await db.init();

			const task = db.tasks.get("plugin-task");
			expect(task).toBeDefined();
			expect(task?.title).toBe("Added by plugin");
		});

		test("async plugin handlers work correctly", async () => {
			const calls: string[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: async (db) => {
								await new Promise((resolve) => setTimeout(resolve, 10));
								calls.push("async-init");
								db.tasks.add({
									id: "1",
									title: "Test",
									completed: false,
								});
							},
							dispose: async () => {
								await new Promise((resolve) => setTimeout(resolve, 10));
								calls.push("async-dispose");
							},
						},
					},
				],
			});

			await db.init();
			expect(calls).toContain("async-init");
			expect(db.tasks.get("1")).toBeDefined();

			await db.dispose();
			expect(calls).toContain("async-dispose");
		});

		test("plugins can subscribe to mutation events", async () => {
			const pluginEvents: any[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: (db) => {
								db.on("mutation", (events) => {
									pluginEvents.push(events);
								});
							},
						},
					},
				],
			});

			await db.init();

			db.tasks.add({ id: "1", title: "Test", completed: false });

			expect(pluginEvents).toHaveLength(1);
			expect(pluginEvents[0][0].collection).toBe("tasks");
		});

		test("works without plugins (backward compatibility)", async () => {
			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
			});

			// Should not throw
			await db.init();
			await db.dispose();

			// Database should still work
			db.tasks.add({ id: "1", title: "Test", completed: false });
			expect(db.tasks.get("1")).toBeDefined();
		});

		test("plugins with only init handler work", async () => {
			const calls: string[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							init: () => {
								calls.push("init-only");
							},
						},
					},
				],
			});

			await db.init();
			expect(calls).toContain("init-only");

			// Should not throw
			await db.dispose();
		});

		test("plugins with only dispose handler work", async () => {
			const calls: string[] = [];

			const db = createDatabase({
				schema: {
					tasks: {
						schema: z.object({
							id: z.string(),
							title: z.string(),
							completed: z.boolean(),
						}),
						getId: (task) => task.id,
					},
				},
				plugins: [
					{
						handlers: {
							dispose: () => {
								calls.push("dispose-only");
							},
						},
					},
				],
			});

			// Should not throw
			await db.init();

			await db.dispose();
			expect(calls).toContain("dispose-only");
		});
	});
});
