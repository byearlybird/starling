import { describe, expect, test } from "bun:test";
import { makeResource } from "@byearlybird/starling";
import { createTestDb, makeTaskDocument } from "./test-helpers";

describe("Collection merge", () => {
	describe("adding resources", () => {
		test("adds new resources from document", () => {
			const db = createTestDb();

			const doc = makeTaskDocument([
				{ id: "task-1", title: "Buy milk", completed: false },
				{ id: "task-2", title: "Walk dog", completed: true },
			]);

			db.tasks.merge(doc);

			expect(db.tasks.get("task-1")?.title).toBe("Buy milk");
			expect(db.tasks.get("task-1")?.completed).toBe(false);
			expect(db.tasks.get("task-2")?.title).toBe("Walk dog");
			expect(db.tasks.get("task-2")?.completed).toBe(true);
		});

		test("merges multiple resources at once", () => {
			const db = createTestDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

			const doc = makeTaskDocument(
				[
					{ id: "task-1", title: "Buy milk", completed: true },
					{ id: "task-2", title: "Walk dog", completed: true },
					{ id: "task-3", title: "Read book", completed: false },
				],
				"2099-01-01T00:05:00.000Z|0001|c3d4",
			);

			db.tasks.merge(doc);

			expect(db.tasks.get("task-1")?.completed).toBe(true);
			expect(db.tasks.get("task-2")?.title).toBe("Walk dog");
			expect(db.tasks.get("task-3")?.title).toBe("Read book");
		});
	});

	describe("updating resources", () => {
		test("applies field-level LWW with newer eventstamps", () => {
			const db = createTestDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

			const doc = makeTaskDocument(
				[{ id: "task-1", title: "Buy milk", completed: true }],
				"2099-01-01T00:05:00.000Z|0001|c3d4",
			);

			db.tasks.merge(doc);

			const task = db.tasks.get("task-1");
			expect(task?.completed).toBe(true);
			expect(task?.title).toBe("Buy milk");
		});
	});

	describe("soft deletion", () => {
		test("handles soft-deleted resources", () => {
			const db = createTestDb();
			db.tasks.add({ id: "task-1", title: "Buy milk", completed: false });

			const doc = makeTaskDocument([], "2099-01-01T00:05:00.000Z|0001|c3d4");
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

			expect(db.tasks.get("task-1")).toBeNull();
			expect(db.tasks.get("task-1", { includeDeleted: true })).toBeDefined();
		});
	});

	describe("transaction integration", () => {
		test("merges within transaction", () => {
			const db = createTestDb();

			db.begin((tx) => {
				const doc = makeTaskDocument([
					{ id: "task-1", title: "Buy milk", completed: false },
				]);

				tx.tasks.merge(doc);

				const task = tx.tasks.get("task-1");
				expect(task?.title).toBe("Buy milk");
			});

			expect(db.tasks.get("task-1")?.title).toBe("Buy milk");
		});

		test("rolls back merge on transaction rollback", () => {
			const db = createTestDb();

			db.begin((tx) => {
				const doc = makeTaskDocument([
					{ id: "task-1", title: "Buy milk", completed: false },
				]);

				tx.tasks.merge(doc);
				tx.rollback();
			});

			expect(db.tasks.get("task-1")).toBeNull();
		});
	});
});
