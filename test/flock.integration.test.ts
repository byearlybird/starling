import { describe, expect, mock, test } from "bun:test";
import memoryDriver from "unstorage/drivers/memory";
import { z } from "zod";
import { Flock } from "../lib/flock";

const taskSchema = z.object({
	id: z
		.string()
		.uuid()
		.default(() => crypto.randomUUID()),
	title: z.string().min(1),
	complete: z.boolean().default(false),
});

describe("Flock integration tests", () => {
	test("insert, get, and update a task", async () => {
		// Initialize Flock with task schema
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		// Test insert operation
		const taskId = await tasks.insert({
			title: "Do this thing",
		});

		expect(taskId).toBeDefined();

		// Test get operation
		const task = await tasks.get(taskId);

		// Assert the task exists and has correct structure w/ default values
		expect(task).not.toBeNull();
		expect(task).toBeDefined();
		expect(task!.id).toBe(taskId);
		expect(task!.title).toBe("Do this thing");
		expect(task!.complete).toBe(false);

		// Test update operation
		await tasks.update(taskId, {
			complete: true,
		});

		// Retrieve the updated task
		const updatedTask = await tasks.get(taskId);

		// Assert the task was updated correctly
		expect(updatedTask).not.toBeNull();
		expect(updatedTask).toBeDefined();
		expect(updatedTask!.id).toBe(taskId);
		expect(updatedTask!.title).toBe("Do this thing"); // Should remain unchanged
		expect(updatedTask!.complete).toBe(true); // Should be updated
	});

	test("get returns null for non-existent key", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		const nonExistentId = crypto.randomUUID();
		const result = await tasks.get(nonExistentId);

		expect(result).toBeNull();
	});

	test("update throws error for non-existent key", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		const nonExistentId = crypto.randomUUID();

		expect(
			tasks.update(nonExistentId, { title: "Test", complete: true }),
		).rejects.toThrow(`Key Not Found - ${nonExistentId}`);
	});

	test("insert applies default values from schema", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		const taskId = await tasks.insert({
			title: "Task with defaults",
		});

		const task = await tasks.get(taskId);

		expect(task).not.toBeNull();
		if (task) {
			// Check that defaults were applied
			expect(task.id).toBeDefined();
			expect(task.id).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
			expect(task.complete).toBe(false);
		}
	});

	test("partial update preserves other fields", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		// Insert a task
		const taskId = await tasks.insert({
			title: "Original Title",
		});

		// Update only the complete field
		await tasks.update(taskId, {
			complete: true,
		});

		const task = await tasks.get(taskId);

		expect(task).not.toBeNull();
		expect(task!.title).toBe("Original Title"); // Should be preserved
		expect(task!.complete).toBe(true); // Should be updated

		// Update only the title
		await tasks.update(taskId, {
			title: "Updated Title",
		});

		const taskAfterSecondUpdate = await tasks.get(taskId);

		expect(taskAfterSecondUpdate).not.toBeNull();
		expect(taskAfterSecondUpdate!.title).toBe("Updated Title"); // Should be updated
		expect(taskAfterSecondUpdate!.complete).toBe(true); // Should be preserved
	});

	test("watch runs callback once per insert and update", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});
		const callback = mock();
		const unwatch = await tasks.watch(callback);
		const taskId = await tasks.insert({
			title: "some title",
		});
		expect(callback).toBeCalledTimes(1);
		await tasks.update(taskId, { complete: true });
		expect(callback).toBeCalledTimes(2);
		await unwatch();
	});

	test("unwatch removes listener", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});
		const callback = mock();
		const unwatch = await tasks.watch(callback);
		const taskId = await tasks.insert({
			title: "some title",
		});
		expect(callback).toBeCalledTimes(1);
		await unwatch();
		await tasks.update(taskId, { complete: true });
		expect(callback).toBeCalledTimes(1);
	});

	test("insertAll inserts multiple tasks at once", async () => {
		const tasks = new Flock({
			schema: taskSchema,
			getKey: (e) => e.id,
			driver: memoryDriver(),
		});

		const explicitId1 = crypto.randomUUID();
		const explicitId2 = crypto.randomUUID();
		const explicitId3 = crypto.randomUUID();

		const tasksWithIds = [
			{ id: explicitId1, title: "Task 1" },
			{ id: explicitId2, title: "Task 2" },
			{ id: explicitId3, title: "Task 3", complete: true },
		];

		await tasks.insertAll(tasksWithIds);

		// Retrieve and verify each task
		const task1 = await tasks.get(explicitId1);
		expect(task1).not.toBeNull();
		expect(task1!.id).toBe(explicitId1);
		expect(task1!.title).toBe("Task 1");
		expect(task1!.complete).toBe(false);

		const task2 = await tasks.get(explicitId2);
		expect(task2).not.toBeNull();
		expect(task2!.id).toBe(explicitId2);
		expect(task2!.title).toBe("Task 2");
		expect(task2!.complete).toBe(false);

		const task3 = await tasks.get(explicitId3);
		expect(task3).not.toBeNull();
		expect(task3!.id).toBe(explicitId3);
		expect(task3!.title).toBe("Task 3");
		expect(task3!.complete).toBe(true);
	});
});
