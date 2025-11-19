import { expect, test } from "bun:test";
import { makeDocument, makeResource } from "@byearlybird/starling";
import { z } from "zod";
import { createDatabase } from "./db";

// Test schema
const taskSchema = z.object({
	id: z.string(),
	title: z.string(),
	completed: z.boolean(),
});

type Task = z.infer<typeof taskSchema>;

test("merge: adds new resources from document", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Create a document with new resources
	const doc = makeDocument<Task>("2025-01-01T00:00:00.000Z|0001|a1b2");
	doc.data.push(
		makeResource(
			"tasks",
			"task-1",
			{ id: "task-1", title: "Buy milk", completed: false },
			"2025-01-01T00:00:00.000Z|0001|a1b2",
		),
		makeResource(
			"tasks",
			"task-2",
			{ id: "task-2", title: "Walk dog", completed: true },
			"2025-01-01T00:00:00.000Z|0001|a1b2",
		),
	);

	db.tasks.merge(doc);

	const task1 = db.tasks.get("task-1");
	const task2 = db.tasks.get("task-2");

	expect(task1?.title).toBe("Buy milk");
	expect(task1?.completed).toBe(false);
	expect(task2?.title).toBe("Walk dog");
	expect(task2?.completed).toBe(true);
});

test("merge: updates existing resources with field-level LWW", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

	// Merge with newer eventstamp - use far future timestamp to ensure it wins
	const doc = makeDocument<Task>("2099-01-01T00:05:00.000Z|0001|c3d4");
	const resource = makeResource(
		"tasks",
		"task-1",
		{ id: "task-1", title: "Buy milk", completed: true },
		"2099-01-01T00:05:00.000Z|0001|c3d4",
	);
	doc.data.push(resource);

	db.tasks.merge(doc);

	const task = db.tasks.get("task-1");
	expect(task?.completed).toBe(true);
	expect(task?.title).toBe("Buy milk");
});

test("merge: handles soft deletions", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

	// Merge with deleted resource - use far future timestamp to ensure it wins
	const doc = makeDocument<Task>("2099-01-01T00:05:00.000Z|0001|c3d4");
	const resource = makeResource(
		"tasks",
		"task-1",
		{ id: "task-1", title: "Buy milk", completed: false },
		"2099-01-01T00:00:00.000Z|0001|a1b2",
	);
	resource.meta.deletedAt = "2099-01-01T00:05:00.000Z|0001|c3d4";
	resource.meta.latest = "2099-01-01T00:05:00.000Z|0001|c3d4";
	doc.data.push(resource);

	db.tasks.merge(doc);

	// Should be soft-deleted (not visible)
	const task = db.tasks.get("task-1");
	expect(task).toBeNull();

	// But still accessible with includeDeleted flag
	const deletedTask = db.tasks.get("task-1", { includeDeleted: true });
	expect(deletedTask?.title).toBe("Buy milk");
});

test("merge: emits add events for new resources", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	const doc = makeDocument<Task>("2025-01-01T00:00:00.000Z|0001|a1b2");
	doc.data.push(
		makeResource(
			"tasks",
			"task-1",
			{ id: "task-1", title: "Buy milk", completed: false },
			"2025-01-01T00:00:00.000Z|0001|a1b2",
		),
	);

	db.tasks.merge(doc);

	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(1);
	expect(events[0].added[0].id).toBe("task-1");
	expect(events[0].added[0].item.title).toBe("Buy milk");
	expect(events[0].updated).toHaveLength(0);
	expect(events[0].removed).toHaveLength(0);
});

test("merge: emits update events for changed resources", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	// Merge with update - use far future timestamp to ensure it wins
	const doc = makeDocument<Task>("2099-01-01T00:05:00.000Z|0001|c3d4");
	const resource = makeResource(
		"tasks",
		"task-1",
		{ id: "task-1", title: "Buy milk", completed: true },
		"2099-01-01T00:05:00.000Z|0001|c3d4",
	);
	doc.data.push(resource);

	db.tasks.merge(doc);

	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(0);
	expect(events[0].updated).toHaveLength(1);
	expect(events[0].updated[0].id).toBe("task-1");
	expect(events[0].updated[0].before.completed).toBe(false);
	expect(events[0].updated[0].after.completed).toBe(true);
	expect(events[0].removed).toHaveLength(0);
});

test("merge: emits delete events for newly deleted resources", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add initial task
	db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	// Merge with deletion - use far future timestamp to ensure it wins
	const doc = makeDocument<Task>("2099-01-01T00:05:00.000Z|0001|c3d4");
	const resource = makeResource(
		"tasks",
		"task-1",
		{ id: "task-1", title: "Buy milk", completed: false },
		"2099-01-01T00:00:00.000Z|0001|a1b2",
	);
	resource.meta.deletedAt = "2099-01-01T00:05:00.000Z|0001|c3d4";
	resource.meta.latest = "2099-01-01T00:05:00.000Z|0001|c3d4";
	doc.data.push(resource);

	db.tasks.merge(doc);

	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(0);
	expect(events[0].updated).toHaveLength(0);
	expect(events[0].removed).toHaveLength(1);
	expect(events[0].removed[0].id).toBe("task-1");
	expect(events[0].removed[0].item.title).toBe("Buy milk");
});

test("merge: works in transactions", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	// Merge in transaction
	db.begin((tx) => {
		const doc = makeDocument<Task>("2025-01-01T00:00:00.000Z|0001|a1b2");
		doc.data.push(
			makeResource(
				"tasks",
				"task-1",
				{ id: "task-1", title: "Buy milk", completed: false },
				"2025-01-01T00:00:00.000Z|0001|a1b2",
			),
		);

		tx.tasks.merge(doc);

		// Inside transaction, data is visible
		const task = tx.tasks.get("task-1");
		expect(task?.title).toBe("Buy milk");
	});

	// After transaction, data is committed
	const task = db.tasks.get("task-1");
	expect(task?.title).toBe("Buy milk");

	// Events are emitted after commit
	expect(events).toHaveLength(1);
	expect(events[0].added).toHaveLength(1);
});

test("merge: transaction rollback discards merge", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	// Merge in transaction with rollback
	db.begin((tx) => {
		const doc = makeDocument<Task>("2025-01-01T00:00:00.000Z|0001|a1b2");
		doc.data.push(
			makeResource(
				"tasks",
				"task-1",
				{ id: "task-1", title: "Buy milk", completed: false },
				"2025-01-01T00:00:00.000Z|0001|a1b2",
			),
		);

		tx.tasks.merge(doc);
		tx.rollback();
	});

	// Merge was rolled back
	const task = db.tasks.get("task-1");
	expect(task).toBeNull();

	// No events emitted
	expect(events).toHaveLength(0);
});

test("merge: database-level mutation event includes collection name", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	const dbEvents: any[] = [];
	db.on("mutation", (e) => dbEvents.push(e));

	const doc = makeDocument<Task>("2025-01-01T00:00:00.000Z|0001|a1b2");
	doc.data.push(
		makeResource(
			"tasks",
			"task-1",
			{ id: "task-1", title: "Buy milk", completed: false },
			"2025-01-01T00:00:00.000Z|0001|a1b2",
		),
	);

	db.tasks.merge(doc);

	expect(dbEvents).toHaveLength(1);
	expect(dbEvents[0]).toHaveLength(1);
	expect(dbEvents[0][0].collection).toBe("tasks");
	expect(dbEvents[0][0].added).toHaveLength(1);
});

test("merge: merges multiple resources at once", () => {
	const db = createDatabase({
		schema: {
			tasks: {
				schema: taskSchema,
				getId: (task) => task.id,
			},
		},
	});

	// Add one initial task
	db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

	const events: any[] = [];
	db.tasks.on("mutation", (e) => events.push(e));

	// Merge document with:
	// - task-1 updated (completed = true)
	// - task-2 added
	// - task-3 added
	// Use far future timestamp to ensure it wins
	const doc = makeDocument<Task>("2099-01-01T00:05:00.000Z|0001|c3d4");

	doc.data.push(
		makeResource(
			"tasks",
			"task-1",
			{ id: "task-1", title: "Buy milk", completed: true },
			"2099-01-01T00:05:00.000Z|0001|c3d4",
		),
		makeResource(
			"tasks",
			"task-2",
			{ id: "task-2", title: "Walk dog", completed: true },
			"2099-01-01T00:05:00.000Z|0001|c3d4",
		),
		makeResource(
			"tasks",
			"task-3",
			{ id: "task-3", title: "Read book", completed: false },
			"2099-01-01T00:05:00.000Z|0001|c3d4",
		),
	);

	db.tasks.merge(doc);

	// Verify all changes applied
	expect(db.tasks.get("task-1")?.completed).toBe(true);
	expect(db.tasks.get("task-2")?.title).toBe("Walk dog");
	expect(db.tasks.get("task-3")?.title).toBe("Read book");

	// All changes in one event
	expect(events).toHaveLength(1);
	expect(events[0].updated).toHaveLength(1);
	expect(events[0].added).toHaveLength(2);
	expect(events[0].removed).toHaveLength(0);
});
