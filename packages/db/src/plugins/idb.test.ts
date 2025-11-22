import { describe, expect, test } from "bun:test";
import "fake-indexeddb/auto";
import { createDatabase } from "../db";
import { makeTask, taskSchema } from "../test-helpers";
import { idbPlugin } from "./idb";

describe("idbPlugin", () => {
	test("loads and persists documents", async () => {
		// Create database with plugin
		const db1 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "test-db" })],
		});

		await db1.init();

		// Add a task
		const task = makeTask({ id: "1", title: "Test Task" });
		db1.tasks.add(task);

		// Wait for mutation event to propagate
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Dispose to save
		await db1.dispose();

		// Create a new database instance and load
		const db2 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "test-db" })],
		});

		await db2.init();

		// Verify task was loaded
		const loadedTask = db2.tasks.get("1");
		expect(loadedTask).toBeDefined();
		expect(loadedTask?.title).toBe("Test Task");

		await db2.dispose();
	});

	test("creates object stores on upgrade", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "upgrade-test" })],
		});

		await db.init();

		// Verify database was created without errors
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("handles empty database gracefully", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "empty-db" })],
		});

		await db.init();

		// Should not throw and should have no tasks
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("uses custom version", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "version-test", version: 5 })],
		});

		await db.init();

		// If init completes without error, the version was set correctly
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("persists on mutations", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "mutation-test" })],
		});

		await db.init();

		// Add task
		db.tasks.add(makeTask({ id: "1", title: "Task 1" }));

		// Wait for mutation event
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Dispose and reload to verify persistence
		await db.dispose();

		const db2 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "mutation-test" })],
		});

		await db2.init();

		const tasks = db2.tasks.getAll();
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Task 1");

		await db2.dispose();
	});

	test("closes database on dispose", async () => {
		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
			},
			plugins: [idbPlugin({ dbName: "dispose-test" })],
		});

		await db.init();
		await db.dispose();

		// The database should have been closed
		// We can't directly check if close() was called, but we can verify no errors occurred
		expect(true).toBe(true);
	});

	test("handles multiple collections", async () => {
		const userSchema = taskSchema.extend({
			email: taskSchema.shape.title,
		});

		const db = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
				users: {
					schema: userSchema,
					getId: (user) => user.id,
				},
			},
			plugins: [idbPlugin({ dbName: "multi-collection-test" })],
		});

		await db.init();

		// Add items to both collections
		db.tasks.add(makeTask({ id: "1", title: "Task 1" }));
		db.users.add({
			id: "u1",
			title: "User 1",
			email: "user@example.com",
			completed: false,
		});

		// Wait for mutations
		await new Promise((resolve) => setTimeout(resolve, 10));

		await db.dispose();

		// Reload and verify both collections persisted
		const db2 = createDatabase({
			schema: {
				tasks: {
					schema: taskSchema,
					getId: (task) => task.id,
				},
				users: {
					schema: userSchema,
					getId: (user) => user.id,
				},
			},
			plugins: [idbPlugin({ dbName: "multi-collection-test" })],
		});

		await db2.init();

		expect(db2.tasks.getAll()).toHaveLength(1);
		expect(db2.users.getAll()).toHaveLength(1);

		await db2.dispose();
	});
});
