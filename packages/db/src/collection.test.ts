import { describe, expect, test } from "bun:test";
import { DuplicateIdError, IdNotFoundError } from "./collection";
import { createTestDb, makeTask } from "./test-helpers";

describe("Collection", () => {
	describe("add", () => {
		test("adds new item and returns validated result", () => {
			const db = createTestDb();

			const task = db.tasks.add({
				id: "1",
				title: "Learn Starling",
				completed: false,
			});

			expect(task.id).toBe("1");
			expect(task.title).toBe("Learn Starling");
			expect(task.completed).toBe(false);
		});

		test("throws on duplicate id", () => {
			const db = createTestDb();
			const task = makeTask({ id: "1" });

			db.tasks.add(task);

			expect(() => db.tasks.add(task)).toThrow(DuplicateIdError);
		});
	});

	describe("get", () => {
		test("retrieves existing item", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Test", completed: false });

			const task = db.tasks.get("1");

			expect(task?.title).toBe("Test");
		});

		test("returns null for non-existent item", () => {
			const db = createTestDb();

			expect(db.tasks.get("missing")).toBeNull();
		});

		test("excludes soft-deleted items by default", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Test", completed: false });
			db.tasks.remove("1");

			expect(db.tasks.get("1")).toBeNull();
		});

		test("includes soft-deleted items with includeDeleted flag", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Test", completed: false });
			db.tasks.remove("1");

			const task = db.tasks.get("1", { includeDeleted: true });

			expect(task?.title).toBe("Test");
		});
	});

	describe("update", () => {
		test("updates existing item with partial data", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Learn Starling", completed: false });

			db.tasks.update("1", { completed: true });

			const task = db.tasks.get("1");
			expect(task?.completed).toBe(true);
			expect(task?.title).toBe("Learn Starling");
		});

		test("throws on non-existent item", () => {
			const db = createTestDb();

			expect(() => db.tasks.update("missing", { completed: true })).toThrow(
				IdNotFoundError,
			);
		});
	});

	describe("remove", () => {
		test("soft-deletes item", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Test", completed: false });

			db.tasks.remove("1");

			expect(db.tasks.get("1")).toBeNull();
			expect(db.tasks.get("1", { includeDeleted: true })).toBeDefined();
		});

		test("throws on non-existent item", () => {
			const db = createTestDb();

			expect(() => db.tasks.remove("missing")).toThrow(IdNotFoundError);
		});
	});

	describe("getAll", () => {
		test("returns all non-deleted items", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: true });
			db.tasks.add({ id: "3", title: "Task 3", completed: false });

			const allTasks = db.tasks.getAll();

			expect(allTasks).toHaveLength(3);
		});

		test("excludes soft-deleted items by default", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: true });
			db.tasks.remove("2");

			const allTasks = db.tasks.getAll();

			expect(allTasks).toHaveLength(1);
			expect(allTasks[0].id).toBe("1");
		});
	});

	describe("find", () => {
		test("filters items with predicate", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "Task 1", completed: false });
			db.tasks.add({ id: "2", title: "Task 2", completed: true });
			db.tasks.add({ id: "3", title: "Task 3", completed: false });

			const incomplete = db.tasks.find((task) => !task.completed);

			expect(incomplete).toHaveLength(2);
			expect(incomplete[0].id).toBe("1");
			expect(incomplete[1].id).toBe("3");
		});

		test("supports map and sort options", () => {
			const db = createTestDb();
			db.tasks.add({ id: "1", title: "C Task", completed: false });
			db.tasks.add({ id: "2", title: "A Task", completed: false });
			db.tasks.add({ id: "3", title: "B Task", completed: false });

			const titles = db.tasks.find(
				() => true,
				{
					map: (task) => task.title,
					sort: (a, b) => a.localeCompare(b),
				},
			);

			expect(titles).toEqual(["A Task", "B Task", "C Task"]);
		});
	});
});
