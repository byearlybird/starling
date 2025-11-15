import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createResource } from "../crdt/resource";
import { createDB, createMemoryDriver, ValidationError } from "./index";

// Test schemas
const taskSchema = z.object({
	id: z.uuid().default(() => crypto.randomUUID()),
	title: z.string().min(1),
	completed: z.boolean().default(false),
	createdAt: z.iso.datetime().default(() => new Date().toISOString()),
});

const noteSchema = z.object({
	id: z.uuid().default(() => crypto.randomUUID()),
	content: z.string(),
	tags: z.array(z.string()).default([]),
});

type Task = z.infer<typeof taskSchema>;
type Note = z.infer<typeof noteSchema>;

describe("DB", () => {
	test("should initialize and dispose", async () => {
		const db = createDB({
			driver: createMemoryDriver(),
			types: {
				task: {
					schema: taskSchema,
					getId: (task: Task) => task.id,
				},
			},
		});

		await db.init();
		expect(db).toBeDefined();

		await db.dispose();
	});

	test("should expose CRUD helpers via property access", async () => {
		const db = createDB({
			driver: createMemoryDriver(),
			types: {
				task: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
				note: {
					schema: noteSchema,
					getId: (note: Note) => note.id,
				},
			},
		});

		await db.init();

		expect(typeof db.task.add).toBe("function");
		expect(typeof db.task.update).toBe("function");
		expect(typeof db.task.getAll).toBe("function");
		expect(typeof db.note.add).toBe("function");
	});

	describe("add()", () => {
		test("should add a resource with schema defaults", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Learn Standard Schema" });

			expect(id).toBeDefined();
			expect(typeof id).toBe("string");

			const task = await db.task.get(id);
			expect(task).toBeDefined();
			expect(task?.title).toBe("Learn Standard Schema");
			expect(task?.completed).toBe(false); // default
			expect(task?.createdAt).toBeDefined();
		});

		test("should validate against schema", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			// Invalid: title is required and must be non-empty
			await expect(db.task.add({ title: "" })).rejects.toThrow(ValidationError);
		});

		test("should persist to driver", async () => {
			const driver = createMemoryDriver();
			const db = createDB({
				driver,
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Test persistence" });

			// Check that driver has the resource
			const snapshot = await driver.load();
			const document = snapshot.task;
			expect(document).toBeDefined();
			const resource = document?.data.find((item) => item.id === id);
			expect(resource).toBeDefined();
			expect(resource?.type).toBe("task");
			expect(resource?.id).toBe(id);
		});
	});

	describe("update()", () => {
		test("should update a resource with partial data", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Original title" });
			await db.task.update(id, { completed: true });

			const task = await db.task.get(id);
			expect(task?.title).toBe("Original title");
			expect(task?.completed).toBe(true);
		});

		test("should validate merged result", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Valid title" });

			// Invalid: title cannot be empty
			await expect(db.task.update(id, { title: "" })).rejects.toThrow(
				ValidationError,
			);
		});

		test("should throw if resource not found", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			await expect(
				db.task.update("nonexistent", { completed: true }),
			).rejects.toThrow('Resource "task:nonexistent" not found');
		});
	});

	describe("get()", () => {
		test("should return resource by id", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Get me" });
			const task = await db.task.get(id);

			expect(task).toBeDefined();
			expect(task?.id).toBe(id);
			expect(task?.title).toBe("Get me");
		});

		test("should return null if not found", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const task = await db.task.get("nonexistent");
			expect(task).toBeNull();
		});

		test("should read existing driver data after reinitialization", async () => {
			const driver = createMemoryDriver();
			const firstDb = createDB({
				driver,
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await firstDb.init();
			const id = await firstDb.task.add({ title: "Persisted task" });
			await firstDb.dispose();

			const secondDb = createDB({
				driver,
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await secondDb.init();
			const task = await secondDb.task.get(id);
			expect(task?.title).toBe("Persisted task");
		});
	});

	describe("getAll()", () => {
		test("should return all resources as [id, data] tuples", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id1 = await db.task.add({ title: "Task 1" });
			const id2 = await db.task.add({ title: "Task 2" });

			const tasks = await db.task.getAll();

			expect(tasks.length).toBe(2);
			expect(tasks.map(([id]) => id).sort()).toEqual([id1, id2].sort());
			expect(tasks.map(([, task]) => task.title).sort()).toEqual([
				"Task 1",
				"Task 2",
			]);
		});

		test("should not include deleted resources", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id1 = await db.task.add({ title: "Task 1" });
			const id2 = await db.task.add({ title: "Task 2" });

			await db.task.remove(id1);

			const tasks = await db.task.getAll();

			expect(tasks.length).toBe(1);
			expect(tasks[0]?.[0]).toBe(id2);
		});
	});

	describe("remove()", () => {
		test("should soft-delete a resource", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const id = await db.task.add({ title: "Delete me" });
			await db.task.remove(id);

			const task = await db.task.get(id);
			expect(task).toBeNull();
		});
	});

	describe("merge()", () => {
		test("should merge external resource with validation", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			// Add a task via normal API
			const id1 = await db.task.add({ title: "Task 1" });

			// Create an external resource object to merge
			const externalId = crypto.randomUUID();
			const externalResource = createResource(
				"task",
				externalId,
				{
					id: externalId,
					title: "External task",
					completed: false,
					createdAt: new Date().toISOString(),
				},
				"2025-01-01T00:00:00.000Z|0001|a1b2",
			);

			// Merge it
			await db.merge(externalResource);

			// Both tasks should exist
			const tasks = await db.task.getAll();
			expect(tasks.length).toBe(2);
			expect(tasks.map(([id]) => id).sort()).toEqual([id1, externalId].sort());
		});

		test("should apply field-level LWW semantics", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
				},
			});

			await db.init();

			const taskId = crypto.randomUUID();

			// Add initial task
			await db.task.add({
				id: taskId,
				title: "Original title",
				completed: false,
			});

			// Update title locally
			await db.task.update(taskId, { title: "Updated title" });

			// Small delay to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Create external resource with newer completed field
			const externalResource = createResource(
				"task",
				taskId,
				{
					id: taskId,
					title: "Original title", // older
					completed: true, // newer
					createdAt: new Date().toISOString(),
				},
				"2099-01-01T00:00:00.000Z|0001|c3d4", // much newer eventstamp
			);

			// Merge it
			await db.merge(externalResource);

			// External eventstamp is newer, so its values should win
			const task = await db.task.get(taskId);
			expect(task?.title).toBe("Original title"); // external won
			expect(task?.completed).toBe(true); // external won
		});
	});

	describe("multi-type support", () => {
		test("should handle multiple resource types", async () => {
			const db = createDB({
				driver: createMemoryDriver(),
				types: {
					task: {
						schema: taskSchema,
						getId: (task) => task.id,
					},
					note: {
						schema: noteSchema,
						getId: (note) => note.id,
					},
				},
			});

			await db.init();

			const taskId = await db.task.add({ title: "Task 1" });
			const noteId = await db.note.add({ content: "Note 1" });

			const task = await db.task.get(taskId);
			const note = await db.note.get(noteId);

			expect(task?.title).toBe("Task 1");
			expect(note?.content).toBe("Note 1");

			const tasks = await db.task.getAll();
			const notes = await db.note.getAll();

			expect(tasks.length).toBe(1);
			expect(notes.length).toBe(1);
		});
	});
});
