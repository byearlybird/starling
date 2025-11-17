import { describe, expect, test } from "bun:test";
import type { StandardSchemaV1 } from "../standard-schema";
import { createDB } from "./db";
import type { DBPlugin } from "./db";

// Helper to create a simple StandardSchema-compliant schema
function createSchema<T>(): StandardSchemaV1<T, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "test",
			validate: (value: unknown) => ({
				value: value as T,
			}),
		},
	};
}

// Helper to create a schema with validation
function createValidatingSchema<T>(
	validator: (value: unknown) => T,
): StandardSchemaV1<T, T> {
	return {
		"~standard": {
			version: 1,
			vendor: "test",
			validate: (value: unknown) => {
				try {
					const validated = validator(value);
					return { value: validated };
				} catch (error) {
					return {
						issues: [
							{
								message:
									error instanceof Error ? error.message : String(error),
							},
						],
					};
				}
			},
		},
	};
}

describe("DB", () => {
	describe("Basic CRUD Operations", () => {
		test("should add and get documents", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const id = await db.task.add({ id: "task-1", title: "Learn Starling" });

			expect(id).toBe("task-1");
			expect(db.task.get(id)).toEqual({ id: "task-1", title: "Learn Starling" });
		});

		test("should update documents", async () => {
			type Task = { id: string; title: string; completed?: boolean };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const id = await db.task.add({ id: "task-1", title: "Learn Starling" });
			await db.task.update(id, { completed: true });

			const task = db.task.get(id);
			expect(task).toEqual({
				id: "task-1",
				title: "Learn Starling",
				completed: true,
			});
		});

		test("should remove documents", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const id = await db.task.add({ id: "task-1", title: "Learn Starling" });
			await db.task.remove(id);

			expect(db.task.get(id)).toBeNull();
			expect(db.task.has(id)).toBe(false);
		});

		test("should get all documents", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			await db.task.add({ id: "task-1", title: "Task 1" });
			await db.task.add({ id: "task-2", title: "Task 2" });
			await db.task.add({ id: "task-3", title: "Task 3" });

			const allTasks = db.task.getAll();
			expect(allTasks).toHaveLength(3);
			expect(allTasks).toContainEqual({ id: "task-1", title: "Task 1" });
			expect(allTasks).toContainEqual({ id: "task-2", title: "Task 2" });
			expect(allTasks).toContainEqual({ id: "task-3", title: "Task 3" });
		});

		test("should check if document exists with has", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			await db.task.add({ id: "task-1", title: "Task 1" });

			expect(db.task.has("task-1")).toBe(true);
			expect(db.task.has("task-2")).toBe(false);
		});
	});

	describe("Multi-collection Support", () => {
		test("should support multiple collections", async () => {
			type Task = { id: string; title: string };
			type User = { id: string; name: string };

			const taskSchema = createSchema<Task>();
			const userSchema = createSchema<User>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
					user: {
						schema: userSchema,
						getId: (user) => user.id,
					},
				},
			}).init();

			const taskId = await db.task.add({ id: "task-1", title: "Learn Starling" });
			const userId = await db.user.add({ id: "user-1", name: "Alice" });

			expect(db.task.get(taskId)).toEqual({
				id: "task-1",
				title: "Learn Starling",
			});
			expect(db.user.get(userId)).toEqual({ id: "user-1", name: "Alice" });
		});

		test("should isolate collections", async () => {
			type Task = { id: string; title: string };
			type User = { id: string; name: string };

			const taskSchema = createSchema<Task>();
			const userSchema = createSchema<User>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
					user: {
						schema: userSchema,
						getId: (user) => user.id,
					},
				},
			}).init();

			await db.task.add({ id: "1", title: "Task" });
			await db.user.add({ id: "1", name: "User" });

			// Same ID in different collections should not conflict
			expect(db.task.get("1")).toEqual({ id: "1", title: "Task" });
			expect(db.user.get("1")).toEqual({ id: "1", name: "User" });
		});

		test("should list collection names", async () => {
			type Task = { id: string; title: string };
			type User = { id: string; name: string };

			const taskSchema = createSchema<Task>();
			const userSchema = createSchema<User>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
					user: {
						schema: userSchema,
						getId: (user) => user.id,
					},
				},
			}).init();

			const names = db.getCollectionNames();
			expect(names).toContain("task");
			expect(names).toContain("user");
		});
	});

	describe("Schema Validation", () => {
		test("should validate data with StandardSchema", async () => {
			type Task = { id: string; title: string };

			const taskSchema = createValidatingSchema<Task>((value) => {
				const obj = value as Record<string, unknown>;
				if (typeof obj.id !== "string") {
					throw new Error("id must be a string");
				}
				if (typeof obj.title !== "string") {
					throw new Error("title must be a string");
				}
				return obj as Task;
			});

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			// Valid data should work
			await db.task.add({ id: "task-1", title: "Valid Task" });
			expect(db.task.get("task-1")).toEqual({
				id: "task-1",
				title: "Valid Task",
			});

			// Invalid data should throw
			await expect(
				db.task.add({ id: 123, title: "Invalid" } as any),
			).rejects.toThrow("id must be a string");
		});
	});

	describe("Transactions", () => {
		test("should support transactions", async () => {
			type Task = { id: string; title: string; completed?: boolean };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const taskId = db.task.begin((tx) => {
				const id = tx.add({ id: "task-1", title: "Task 1" });
				tx.add({ id: "task-2", title: "Task 2" });
				return id;
			});

			expect(await taskId).toBe("task-1");
			expect(db.task.get("task-1")).toEqual({ id: "task-1", title: "Task 1" });
			expect(db.task.get("task-2")).toEqual({ id: "task-2", title: "Task 2" });
		});

		test("should rollback transactions", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			db.task.begin((tx) => {
				tx.add({ id: "task-1", title: "Task 1" });
				tx.add({ id: "task-2", title: "Task 2" });
				tx.rollback();
			});

			expect(db.task.get("task-1")).toBeNull();
			expect(db.task.get("task-2")).toBeNull();
		});

		test("should read within transactions", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const result = db.task.begin((tx) => {
				tx.add({ id: "task-1", title: "Task 1" });
				const task = tx.get("task-1");
				return task;
			});

			expect(result).toEqual({ id: "task-1", title: "Task 1" });
		});
	});

	describe("Plugin System", () => {
		test("should support plugins with hooks", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const events: string[] = [];

			const loggingPlugin: DBPlugin<{
				task: { schema: typeof taskSchema; getId: (task: Task) => string };
			}> = {
				hooks: {
					onInit: async () => {
						events.push("init");
					},
					onAdd: (collectionName, entries) => {
						events.push(`add:${String(collectionName)}:${entries.length}`);
					},
					onUpdate: (collectionName, entries) => {
						events.push(`update:${String(collectionName)}:${entries.length}`);
					},
					onDelete: (collectionName, keys) => {
						events.push(`delete:${String(collectionName)}:${keys.length}`);
					},
				},
			};

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			})
				.use(loggingPlugin)
				.init();

			await db.task.add({ id: "task-1", title: "Task 1" });
			await db.task.update("task-1", { title: "Updated" });
			await db.task.remove("task-1");

			expect(events).toEqual([
				"init",
				"add:task:1",
				"update:task:1",
				"delete:task:1",
			]);
		});

		test("should support plugins with methods", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const customPlugin: DBPlugin<
				{
					task: { schema: typeof taskSchema; getId: (task: Task) => string };
				},
				{ customMethod: () => string }
			> = {
				methods: (db) => ({
					customMethod: () => "custom",
				}),
			};

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			})
				.use(customPlugin)
				.init();

			expect(db.customMethod()).toBe("custom");
		});

		test("should dispose plugins", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const events: string[] = [];

			const cleanupPlugin: DBPlugin<{
				task: { schema: typeof taskSchema; getId: (task: Task) => string };
			}> = {
				hooks: {
					onDispose: async () => {
						events.push("dispose");
					},
				},
			};

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			})
				.use(cleanupPlugin)
				.init();

			await db.dispose();

			expect(events).toContain("dispose");
		});
	});

	describe("Merge Operations", () => {
		test("should merge documents", async () => {
			type Task = { id: string; title: string; completed?: boolean };
			const taskSchema = createSchema<Task>();

			const db1 = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const db2 = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			// Add to db1
			await db1.task.add({ id: "task-1", title: "Task 1" });

			// Merge into db2
			const collection = db1.task.collection();
			await db2.task.merge(collection);

			expect(db2.task.get("task-1")).toEqual({ id: "task-1", title: "Task 1" });
		});

		test("should merge with conflict resolution", async () => {
			type Task = { id: string; title: string; completed?: boolean };
			const taskSchema = createSchema<Task>();

			const db1 = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const db2 = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			// Add same task to both
			await db1.task.add({ id: "task-1", title: "Task 1" });
			await db2.task.add({ id: "task-1", title: "Task 1" });

			// Update different fields
			await db1.task.update("task-1", { title: "Updated Title" });
			await db2.task.update("task-1", { completed: true });

			// Merge db2 into db1
			const collection = db2.task.collection();
			await db1.task.merge(collection);

			const task = db1.task.get("task-1");
			// Should have both updates (field-level LWW)
			expect(task).toHaveProperty("completed", true);
		});
	});

	describe("Custom ID Generation", () => {
		test("should use custom ID with withId option", async () => {
			type Task = { id: string; title: string };
			const taskSchema = createSchema<Task>();

			const db = await createDB({
				schema: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			}).init();

			const id = await db.task.add(
				{ id: "generated-id", title: "Task" },
				{ withId: "custom-id" },
			);

			expect(id).toBe("custom-id");
			expect(db.task.get("custom-id")).toEqual({
				id: "generated-id",
				title: "Task",
			});
		});
	});
});
