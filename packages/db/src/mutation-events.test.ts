import { expect, test } from "bun:test";
import z from "zod";
import { createDatabase } from "./db";

// Test schema for tasks
const taskSchema = z.object({
	id: z.string().default(() => crypto.randomUUID()),
	title: z.string(),
	completed: z.boolean(),
});

// Test schema for users
const userSchema = z.object({
	id: z.string(),
	name: z.string(),
	email: z.string(),
});

test("collection mutation event: add operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.tasks.add({ id: "1", title: "Buy milk", completed: false });

	expect(events).toHaveLength(1);
	expect(events[0]).toEqual({
		added: [
			{ id: "1", item: { id: "1", title: "Buy milk", completed: false } },
		],
		updated: [],
		removed: [],
	});
});

test("collection mutation event: update operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Buy milk", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.tasks.update("1", { completed: true });

	expect(events).toHaveLength(1);
	expect(events[0].added).toEqual([]);
	expect(events[0].removed).toEqual([]);
	expect(events[0].updated).toHaveLength(1);
	expect(events[0].updated[0].id).toBe("1");
	expect(events[0].updated[0].before).toEqual({
		id: "1",
		title: "Buy milk",
		completed: false,
	});
	expect(events[0].updated[0].after).toEqual({
		id: "1",
		title: "Buy milk",
		completed: true,
	});
});

test("collection mutation event: remove operation", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	db.tasks.add({ id: "1", title: "Buy milk", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.tasks.remove("1");

	expect(events).toHaveLength(1);
	expect(events[0]).toEqual({
		added: [],
		updated: [],
		removed: [
			{ id: "1", item: { id: "1", title: "Buy milk", completed: false } },
		],
	});
});

test("transaction batches mutation events", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.tasks.add({ id: "2", title: "Task 2", completed: false });
		tx.tasks.add({ id: "3", title: "Task 3", completed: false });
	});

	// Should emit a single batched event with all 3 adds
	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(3);
	expect(events[0].added[0]).toEqual({
		id: "1",
		item: { id: "1", title: "Task 1", completed: false },
	});
	expect(events[0].added[1]).toEqual({
		id: "2",
		item: { id: "2", title: "Task 2", completed: false },
	});
	expect(events[0].added[2]).toEqual({
		id: "3",
		item: { id: "3", title: "Task 3", completed: false },
	});
	expect(events[0].updated).toEqual([]);
	expect(events[0].removed).toEqual([]);
});

test("transaction batches mixed mutation events", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add some initial data
	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	db.tasks.add({ id: "2", title: "Task 2", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "3", title: "Task 3", completed: false });
		tx.tasks.update("1", { completed: true });
		tx.tasks.remove("2");
	});

	// Should emit a single batched event with all mutations
	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(1);
	expect(events[0].updated).toHaveLength(1);
	expect(events[0].removed).toHaveLength(1);

	expect(events[0].added[0].id).toBe("3");
	expect(events[0].updated[0].id).toBe("1");
	expect(events[0].updated[0].after.completed).toBe(true);
	expect(events[0].removed[0].id).toBe("2");
});

test("transaction rollback does not emit events", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.tasks.add({ id: "2", title: "Task 2", completed: false });
		tx.rollback();
	});

	// No events should be emitted
	expect(events).toHaveLength(0);

	// Data should not be persisted
	expect(db.tasks.getAll()).toEqual([]);
});

test("transaction exception does not emit events", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	try {
		db.begin((tx) => {
			tx.tasks.add({ id: "1", title: "Task 1", completed: false });
			throw new Error("Oops!");
		});
	} catch (e) {
		// Expected
	}

	// No events should be emitted
	expect(events).toHaveLength(0);

	// Data should not be persisted
	expect(db.tasks.getAll()).toEqual([]);
});

test("database-level mutation events", () => {
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

	const dbEvents: any[] = [];
	db.on("mutation", (event) => {
		dbEvents.push(event);
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });

	expect(dbEvents).toHaveLength(1);
	expect(dbEvents[0]).toHaveLength(1);
	expect(dbEvents[0][0].collection).toBe("tasks");
	expect(dbEvents[0][0].added).toHaveLength(1);
	expect(dbEvents[0][0].added[0]).toEqual({
		id: "1",
		item: { id: "1", title: "Task 1", completed: false },
	});
});

test("database-level events include collection name for multiple collections", () => {
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

	const dbEvents: any[] = [];
	db.on("mutation", (event) => {
		dbEvents.push(event);
	});

	db.begin((tx) => {
		tx.tasks.add({ id: "1", title: "Task 1", completed: false });
		tx.tasks.add({ id: "2", title: "Task 2", completed: false });
		tx.users.add({ id: "u1", name: "Alice", email: "alice@example.com" });
	});

	// Should emit a single database event
	expect(dbEvents).toHaveLength(2); // One event per collection

	// Find the tasks event
	const tasksEvent = dbEvents.find((e) => e[0].collection === "tasks");
	expect(tasksEvent).toBeDefined();
	expect(tasksEvent[0].added).toHaveLength(2);

	// Find the users event
	const usersEvent = dbEvents.find((e) => e[0].collection === "users");
	expect(usersEvent).toBeDefined();
	expect(usersEvent[0].added).toHaveLength(1);
});

test("can unsubscribe from mutation events", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	const unsubscribe = db.tasks.on("mutation", (event) => {
		events.push(event);
	});

	db.tasks.add({ id: "1", title: "Task 1", completed: false });
	expect(events).toHaveLength(1);

	// Unsubscribe
	unsubscribe();

	db.tasks.add({ id: "2", title: "Task 2", completed: false });

	// No new events should be received
	expect(events).toHaveLength(1);
});
