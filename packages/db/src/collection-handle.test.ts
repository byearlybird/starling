import { describe, expect, test } from "bun:test";
import { createCollection } from "./collection";
import { createCollectionHandle } from "./collection-handle";
import { taskSchema } from "./test-helpers";

describe("createCollectionHandle", () => {
	function createTestCollection() {
		let counter = 0;
		return createCollection(
			"tasks",
			taskSchema,
			(task) => task.id,
			() => `2099-01-01T00:00:00.000Z|000${++counter}|a1b2`,
		);
	}

	describe("add", () => {
		test("delegates to collection.add", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			const result = handle.add({ id: "1", title: "Test", completed: false });

			expect(result.id).toBe("1");
			expect(result.title).toBe("Test");
			expect(collection.get("1")).toEqual(result);
		});
	});

	describe("update", () => {
		test("delegates to collection.update", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Original", completed: false });
			handle.update("1", { title: "Updated" });

			expect(collection.get("1")?.title).toBe("Updated");
		});
	});

	describe("remove", () => {
		test("delegates to collection.remove", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Test", completed: false });
			handle.remove("1");

			expect(collection.get("1")).toBeNull();
			expect(collection.get("1", { includeDeleted: true })).toBeDefined();
		});
	});

	describe("merge", () => {
		test("delegates to collection.merge", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			const doc = {
				jsonapi: { version: "1.1" as const },
				meta: { latest: "2099-01-01T00:00:00.000Z|0001|a1b2" },
				data: [
					{
						type: "tasks",
						id: "task-1",
						attributes: { id: "task-1", title: "Merged", completed: false },
						meta: {
							eventstamps: {
								id: "2099-01-01T00:00:00.000Z|0001|a1b2",
								title: "2099-01-01T00:00:00.000Z|0001|a1b2",
								completed: "2099-01-01T00:00:00.000Z|0001|a1b2",
							},
							latest: "2099-01-01T00:00:00.000Z|0001|a1b2",
							deletedAt: null,
						},
					},
				],
			};

			handle.merge(doc);

			expect(collection.get("task-1")?.title).toBe("Merged");
		});
	});

	describe("get", () => {
		test("delegates to collection.get", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Test", completed: false });

			expect(handle.get("1")?.title).toBe("Test");
			expect(handle.get("missing")).toBeNull();
		});

		test("passes options to collection.get", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Test", completed: false });
			collection.remove("1");

			expect(handle.get("1")).toBeNull();
			expect(handle.get("1", { includeDeleted: true })?.title).toBe("Test");
		});
	});

	describe("getAll", () => {
		test("delegates to collection.getAll", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Task 1", completed: false });
			collection.add({ id: "2", title: "Task 2", completed: true });

			const all = handle.getAll();

			expect(all).toHaveLength(2);
		});

		test("passes options to collection.getAll", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Task 1", completed: false });
			collection.add({ id: "2", title: "Task 2", completed: true });
			collection.remove("2");

			expect(handle.getAll()).toHaveLength(1);
			expect(handle.getAll({ includeDeleted: true })).toHaveLength(2);
		});
	});

	describe("find", () => {
		test("delegates to collection.find", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Task 1", completed: false });
			collection.add({ id: "2", title: "Task 2", completed: true });
			collection.add({ id: "3", title: "Task 3", completed: false });

			const incomplete = handle.find((task) => !task.completed);

			expect(incomplete).toHaveLength(2);
		});

		test("passes options to collection.find", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "C Task", completed: false });
			collection.add({ id: "2", title: "A Task", completed: false });
			collection.add({ id: "3", title: "B Task", completed: false });

			const titles = handle.find(() => true, {
				map: (task) => task.title,
				sort: (a, b) => a.localeCompare(b),
			});

			expect(titles).toEqual(["A Task", "B Task", "C Task"]);
		});
	});

	describe("toDocument", () => {
		test("delegates to collection.toDocument", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			collection.add({ id: "1", title: "Test", completed: false });

			const doc = handle.toDocument();

			expect(doc.jsonapi.version).toBe("1.1");
			expect(doc.data).toHaveLength(1);
			expect(doc.data[0]?.attributes.title).toBe("Test");
		});
	});

	describe("on", () => {
		test("delegates to collection.on and returns unsubscribe", () => {
			const collection = createTestCollection();
			const handle = createCollectionHandle(collection);

			const events: any[] = [];
			const unsubscribe = handle.on("mutation", (e) => events.push(e));

			handle.add({ id: "1", title: "Test", completed: false });

			expect(events).toHaveLength(1);
			expect(events[0].added).toHaveLength(1);

			unsubscribe();

			handle.add({ id: "2", title: "Test 2", completed: false });

			expect(events).toHaveLength(1);
		});
	});
});
