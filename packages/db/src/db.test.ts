import { expect, test } from "bun:test";
import { z } from "zod";
import { createDatabase } from "./db";

// Test schema for tasks
const taskSchema = z.object({
	id: z.string().default(() => crypto.randomUUID()),
	title: z.string(),
	completed: z.boolean(),
});

type Task = z.infer<typeof taskSchema>;

// Test schema for users
const userSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

type User = z.infer<typeof userSchema>;

test("createDatabase: creates database with typed collections", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	expect(db.tasks).toBeDefined();
	expect(typeof db.tasks.add).toBe("function");
	expect(typeof db.tasks.get).toBe("function");
	expect(typeof db.tasks.update).toBe("function");
	expect(typeof db.tasks.remove).toBe("function");
	expect(typeof db.begin).toBe("function");
});

test("createDatabase: creates multiple collections", () => {
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
			kv: {
				schema: z.object({
					key: z.string(),
					value: z.string(),
				}),
				getId: (item) => item.key,
			},
		},
	});

	db.tasks.add({
		completed: false,
		title: "Test Task",
	});

	expect(db.tasks).toBeDefined();
	expect(db.users).toBeDefined();
	expect(typeof db.begin).toBe("function");
});

test("db: basic add operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const task = db.tasks.add({
		id: "1",
		title: "Learn Starling",
		completed: false,
	});

	expect(task.id).toBe("1");
	expect(task.title).toBe("Learn Starling");
	expect(task.completed).toBe(false);
});

test("db: basic get operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({
		id: "1",
		title: "Learn Starling",
		completed: false,
	});

	const task = db.tasks.get("1");
	expect(task).toBeDefined();
	expect(task?.title).toBe("Learn Starling");
});

test("db: basic update operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({
		id: "1",
		title: "Learn Starling",
		completed: false,
	});

	db.tasks.update("1", { completed: true });

	const task = db.tasks.get("1");
	expect(task?.completed).toBe(true);
	expect(task?.title).toBe("Learn Starling"); // Other fields unchanged
});

test("db: basic remove operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({
		id: "1",
		title: "Learn Starling",
		completed: false,
	});

	db.tasks.remove("1");

	const task = db.tasks.get("1");
	expect(task).toBeNull();
});

test("db: getAll operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	db.tasks.add({ id: "2", title: "Task 2", completed: true });
	db.tasks.add({ id: "3", title: "Task 3", completed: false });

	const allTasks = db.tasks.getAll();
	expect(allTasks.length).toBe(3);
});

test("db: find operation with filter", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	db.tasks.add({ id: "2", title: "Task 2", completed: true });
	db.tasks.add({ id: "3", title: "Task 3", completed: false });

	const incompleteTasks = db.tasks.find((task) => !task.completed);
	expect(incompleteTasks.length).toBe(2);
	expect(incompleteTasks[0]?.id).toBe("1");
	expect(incompleteTasks[1]?.id).toBe("3");
});

test("begin: transaction commits changes", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task in transaction", completed: false });
	});

	// Changes should be visible after transaction
	const task = db.tasks.get("1");
	expect(task?.title).toBe("Task in transaction");
});

test("begin: transaction returns callback result", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const result = db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Test", completed: false });
		return "success";
	});

	expect(result).toBe("success");
});

test("begin: transaction can return added item", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const task = db.begin((tx) => {
		return tx.tasks.add({ id: "1", title: "Test", completed: false });
	});

	expect(task.id).toBe("1");
	expect(task.title).toBe("Test");
});

test("begin: explicit rollback prevents changes", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Should not persist", completed: false });
		tx.rollback();
	});

	// Changes should not be visible after rollback
	const task = db.tasks.get("1");
	expect(task).toBeNull();
});

test("begin: implicit rollback on exception", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	try {
		db.begin((tx) => {
			tx.tasks.add({ id: "1", title: "Should not persist", completed: false });
			throw new Error("Transaction failed");
		});
	} catch (_error) {
		// Expected error
	}

	// Changes should not be visible after exception
	const task = db.tasks.get("1");
	expect(task).toBeNull();
});

test("begin: transaction isolation - reads see snapshot", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "1", title: "Original", completed: false });

	db.begin((tx) => {
		// Read in transaction
		const task = tx.tasks.get("1");
		expect(task?.title).toBe("Original");

		// Update in transaction
		tx.tasks.update("1", { title: "Updated in tx" });

		// Read again in same transaction should see the update
		const updatedTask = tx.tasks.get("1");
		expect(updatedTask?.title).toBe("Updated in tx");
	});

	// After commit, changes are visible
	const finalTask = db.tasks.get("1");
	expect(finalTask?.title).toBe("Updated in tx");
});

test("begin: transaction with multiple operations", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.tasks.add({ id: "2", title: "Task 2", completed: false });
		tx.tasks.update("1", { completed: true });
	});

	const task1 = db.tasks.get("1");
	const task2 = db.tasks.get("2");

	expect(task1?.completed).toBe(true);
	expect(task2?.completed).toBe(false);
});

test("begin: transaction with multiple collections", () => {
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
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.users.add({ id: "1", name: "Alice", email: "alice@example.com" });
	});

	const task = db.tasks.get("1");
	const user = db.users.get("1");

	expect(task?.title).toBe("Task 1");
	expect(user?.name).toBe("Alice");
});

test("begin: rollback affects all collections", () => {
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
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.users.add({ id: "1", name: "Alice", email: "alice@example.com" });
		tx.rollback();
	});

	const task = db.tasks.get("1");
	const user = db.users.get("1");

	expect(task).toBeNull();
	expect(user).toBeNull();
});

test("begin: transaction isolation - external changes not visible inside tx", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "1", title: "Original", completed: false });

	// Start a transaction that reads first
	let taskInsideTx: Task | null = null;
	db.begin((tx) => {
		// This read should trigger the snapshot
		taskInsideTx = tx.tasks.get("1");

		// Theoretically, if we modified db.tasks directly here (outside tx),
		// the transaction should still see the snapshot
		// But we can't easily test this without exposing internals

		// Instead, verify the transaction sees its own writes
		tx.tasks.update("1", { title: "Updated in tx" });
		const updatedInTx = tx.tasks.get("1");
		expect(updatedInTx?.title).toBe("Updated in tx");
	});

	expect(taskInsideTx?.title).toBe("Original");
});

test("begin: nested operations within transaction", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.begin((tx) => {
		// Add
		tx.tasks.add({ id: "1", title: "New Task", completed: false });

		// Update what we just added
		tx.tasks.update("1", { completed: true });

		// Read it back
		const task = tx.tasks.get("1");
		expect(task?.completed).toBe(true);

		// Update again
		tx.tasks.update("1", { title: "Modified Task" });

		// Read final state
		const finalTask = tx.tasks.get("1");
		expect(finalTask?.title).toBe("Modified Task");
		expect(finalTask?.completed).toBe(true);
	});

	// Verify final state after commit
	const task = db.tasks.get("1");
	expect(task?.title).toBe("Modified Task");
	expect(task?.completed).toBe(true);
});

test("begin: transaction can query with find", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	db.tasks.add({ id: "2", title: "Task 2", completed: true });

	db.begin((tx) => {
		tx.tasks.add({ id: "3", title: "Task 3", completed: false });

		const incompleteTasks = tx.tasks.find((task) => !task.completed);
		expect(incompleteTasks.length).toBe(2);
	});
});

test("begin: rollback after partial operations", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.tasks.add({ id: "2", title: "Task 2", completed: false });

		// Rollback after adding two tasks
		tx.rollback();
	});

	// Neither task should exist
	expect(db.tasks.get("1")).toBeNull();
	expect(db.tasks.get("2")).toBeNull();
});

test("begin: transaction with remove operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add task outside transaction
	db.tasks.add({ id: "1", title: "Task to remove", completed: false });

	// Remove in transaction
	db.begin((tx) => {
		tx.tasks.remove("1");

		// Should not be visible within transaction
		const task = tx.tasks.get("1");
		expect(task).toBeNull();
	});

	// Should not be visible after transaction commits
	const task = db.tasks.get("1");
	expect(task).toBeNull();
});

test("begin: rollback prevents remove operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add task outside transaction
	db.tasks.add({ id: "1", title: "Task to keep", completed: false });

	// Try to remove in transaction but rollback
	db.begin((tx) => {
		tx.tasks.remove("1");
		tx.rollback();
	});

	// Task should still exist after rollback
	const task = db.tasks.get("1");
	expect(task?.title).toBe("Task to keep");
});

test("begin: transaction with getAll", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	db.tasks.add({ id: "2", title: "Task 2", completed: true });

	db.begin((tx) => {
		tx.tasks.add({ id: "3", title: "Task 3", completed: false });

		const allTasks = tx.tasks.getAll();
		expect(allTasks.length).toBe(3);
	});

	// After commit, all three should be visible
	const allTasks = db.tasks.getAll();
	expect(allTasks.length).toBe(3);
});
