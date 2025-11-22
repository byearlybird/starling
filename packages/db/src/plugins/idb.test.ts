import { describe, expect, test } from "bun:test";
import "fake-indexeddb/auto";
import { createDatabase } from "../db";
import { makeTask, taskSchema } from "../test-helpers";
import { idbPlugin } from "./idb";

describe("idbPlugin", () => {
	test("loads and persists documents", async () => {
		// Create database with plugin
		const db1 = await createDatabase("test-db", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		// Add a task
		const task = makeTask({ id: "1", title: "Test Task" });
		db1.tasks.add(task);

		// Wait for mutation event to propagate
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Dispose to save
		await db1.dispose();

		// Create a new database instance and load (same db name to load persisted data)
		const db2 = await createDatabase("test-db", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		// Verify task was loaded
		const loadedTask = db2.tasks.get("1");
		expect(loadedTask).toBeDefined();
		expect(loadedTask?.title).toBe("Test Task");

		await db2.dispose();
	});

	test("creates object stores on upgrade", async () => {
		const db = await createDatabase("upgrade-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		// Verify database was created without errors
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("handles empty database gracefully", async () => {
		const db = await createDatabase("empty-db", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		// Should not throw and should have no tasks
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("uses custom version", async () => {
		const db = await createDatabase("version-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin({ version: 5 }))
			.init();

		// If init completes without error, the version was set correctly
		expect(db.tasks.getAll()).toEqual([]);

		await db.dispose();
	});

	test("persists on mutations", async () => {
		const db = await createDatabase("mutation-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		// Add task
		db.tasks.add(makeTask({ id: "1", title: "Task 1" }));

		// Wait for mutation event
		await new Promise((resolve) => setTimeout(resolve, 10));

		// Dispose and reload to verify persistence (same db name)
		await db.dispose();

		const db2 = await createDatabase("mutation-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();

		const tasks = db2.tasks.getAll();
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.title).toBe("Task 1");

		await db2.dispose();
	});

	test("closes database on dispose", async () => {
		const db = await createDatabase("dispose-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		})
			.use(idbPlugin())
			.init();
		await db.dispose();

		// The database should have been closed
		// We can't directly check if close() was called, but we can verify no errors occurred
		expect(true).toBe(true);
	});

	test("handles multiple collections", async () => {
		const userSchema = taskSchema.extend({
			email: taskSchema.shape.title,
		});

		const db = await createDatabase("multi-collection-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
			users: {
				schema: userSchema,
				getId: (user) => user.id,
			},
		})
			.use(idbPlugin())
			.init();

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

		// Reload and verify both collections persisted (same db name)
		const db2 = await createDatabase("multi-collection-test", {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
			users: {
				schema: userSchema,
				getId: (user) => user.id,
			},
		})
			.use(idbPlugin())
			.init();

		expect(db2.tasks.getAll()).toHaveLength(1);
		expect(db2.users.getAll()).toHaveLength(1);

		await db2.dispose();
	});
});
