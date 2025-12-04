import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import "fake-indexeddb/auto";
import { z } from "zod";
import { createClock } from "../core";
import { createIDBCollection, type IDBCollection } from "./idb-collection";

// Test schema
const taskSchema = z.object({
	id: z.string(),
	title: z.string(),
	completed: z.boolean().default(false),
});

type Task = z.output<typeof taskSchema>;

describe("IDBCollection", () => {
	let idb: IDBDatabase;
	let collection: IDBCollection<typeof taskSchema>;
	const dbName = `test-db-${Date.now()}`;
	const clock = createClock();

	beforeEach(async () => {
		// Open IndexedDB
		idb = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(dbName, 1);

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				db.createObjectStore("tasks", { keyPath: "id" });
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});

		// Create collection
		collection = createIDBCollection(
			idb,
			"tasks",
			taskSchema,
			(task) => task.id,
			() => clock.now(),
		);
	});

	afterEach(async () => {
		idb.close();

		// Delete database
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.deleteDatabase(dbName);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	});

	describe("add", () => {
		test("adds a new resource", async () => {
			const task = await collection.add({
				id: "task-1",
				title: "Learn Starling",
			});

			expect(task).toEqual({
				id: "task-1",
				title: "Learn Starling",
				completed: false,
			});

			// Verify it's in IDB
			const retrieved = await collection.get("task-1");
			expect(retrieved).toEqual(task);
		});

		test("throws on duplicate ID", async () => {
			await collection.add({ id: "task-1", title: "First" });

			await expect(
				collection.add({ id: "task-1", title: "Duplicate" }),
			).rejects.toThrow("already exists");
		});

		test("emits mutation event", async () => {
			const mutations: any[] = [];
			collection.on("mutation", (event) => mutations.push(event));

			await collection.add({ id: "task-1", title: "Test" });

			expect(mutations).toHaveLength(1);
			expect(mutations[0].added).toHaveLength(1);
			expect(mutations[0].added[0].id).toBe("task-1");
		});
	});

	describe("get", () => {
		test("returns null for non-existent resource", async () => {
			const task = await collection.get("missing");
			expect(task).toBeNull();
		});

		test("returns resource by ID", async () => {
			await collection.add({ id: "task-1", title: "Test" });
			const task = await collection.get("task-1");

			expect(task).toEqual({
				id: "task-1",
				title: "Test",
				completed: false,
			});
		});

		test("excludes deleted resources by default", async () => {
			await collection.add({ id: "task-1", title: "Test" });
			await collection.remove("task-1");

			const task = await collection.get("task-1");
			expect(task).toBeNull();
		});

		test("includes deleted resources with option", async () => {
			await collection.add({ id: "task-1", title: "Test" });
			await collection.remove("task-1");

			const task = await collection.get("task-1", { includeDeleted: true });
			expect(task).not.toBeNull();
		});
	});

	describe("getAll", () => {
		test("returns empty array when no resources", async () => {
			const tasks = await collection.getAll();
			expect(tasks).toEqual([]);
		});

		test("returns all resources", async () => {
			await collection.add({ id: "task-1", title: "First" });
			await collection.add({ id: "task-2", title: "Second" });

			const tasks = await collection.getAll();
			expect(tasks).toHaveLength(2);
		});

		test("excludes deleted resources by default", async () => {
			await collection.add({ id: "task-1", title: "First" });
			await collection.add({ id: "task-2", title: "Second" });
			await collection.remove("task-1");

			const tasks = await collection.getAll();
			expect(tasks).toHaveLength(1);
			expect(tasks[0].id).toBe("task-2");
		});

		test("includes deleted resources with option", async () => {
			await collection.add({ id: "task-1", title: "First" });
			await collection.remove("task-1");

			const tasks = await collection.getAll({ includeDeleted: true });
			expect(tasks).toHaveLength(1);
		});
	});

	describe("find", () => {
		beforeEach(async () => {
			await collection.add({ id: "task-1", title: "First", completed: false });
			await collection.add({ id: "task-2", title: "Second", completed: true });
			await collection.add({ id: "task-3", title: "Third", completed: false });
		});

		test("filters resources", async () => {
			const completed = await collection.find((task) => task.completed);
			expect(completed).toHaveLength(1);
			expect(completed[0].id).toBe("task-2");
		});

		test("returns all matching resources", async () => {
			const incomplete = await collection.find((task) => !task.completed);
			expect(incomplete).toHaveLength(2);
		});

		test("supports mapping", async () => {
			const titles = await collection.find(
				(task) => !task.completed,
				{ map: (task) => task.title },
			);
			expect(titles).toEqual(["First", "Third"]);
		});

		test("supports sorting", async () => {
			const sorted = await collection.find(
				(task) => !task.completed,
				{ sort: (a, b) => b.title.localeCompare(a.title) },
			);
			expect(sorted[0].title).toBe("Third");
			expect(sorted[1].title).toBe("First");
		});
	});

	describe("update", () => {
		test("updates existing resource", async () => {
			await collection.add({ id: "task-1", title: "Old", completed: false });
			await collection.update("task-1", { completed: true });

			const task = await collection.get("task-1");
			expect(task?.completed).toBe(true);
			expect(task?.title).toBe("Old"); // Unchanged
		});

		test("throws on non-existent resource", async () => {
			await expect(
				collection.update("missing", { completed: true }),
			).rejects.toThrow("not found");
		});

		test("emits mutation event", async () => {
			await collection.add({ id: "task-1", title: "Test", completed: false });

			const mutations: any[] = [];
			collection.on("mutation", (event) => mutations.push(event));

			await collection.update("task-1", { completed: true });

			expect(mutations).toHaveLength(1);
			expect(mutations[0].updated).toHaveLength(1);
			expect(mutations[0].updated[0].before.completed).toBe(false);
			expect(mutations[0].updated[0].after.completed).toBe(true);
		});
	});

	describe("remove", () => {
		test("soft deletes resource", async () => {
			await collection.add({ id: "task-1", title: "Test" });
			await collection.remove("task-1");

			// Not visible by default
			const task = await collection.get("task-1");
			expect(task).toBeNull();

			// Still exists with includeDeleted
			const deleted = await collection.get("task-1", { includeDeleted: true });
			expect(deleted).not.toBeNull();
		});

		test("throws on non-existent resource", async () => {
			await expect(collection.remove("missing")).rejects.toThrow("not found");
		});

		test("emits mutation event", async () => {
			await collection.add({ id: "task-1", title: "Test" });

			const mutations: any[] = [];
			collection.on("mutation", (event) => mutations.push(event));

			await collection.remove("task-1");

			expect(mutations).toHaveLength(1);
			expect(mutations[0].removed).toHaveLength(1);
			expect(mutations[0].removed[0].id).toBe("task-1");
		});
	});

	describe("merge", () => {
		test("adds new resources from remote", async () => {
			const remoteDoc = {
				jsonapi: { version: "1.1" as const },
				meta: { latest: clock.now() },
				data: [
					{
						type: "tasks",
						id: "task-1",
						attributes: { id: "task-1", title: "Remote", completed: false },
						meta: {
							eventstamps: { id: clock.now(), title: clock.now(), completed: clock.now() },
							latest: clock.now(),
							deletedAt: null,
						},
					},
				],
			};

			await collection.merge(remoteDoc);

			const task = await collection.get("task-1");
			expect(task?.title).toBe("Remote");
		});

		test("updates existing resources", async () => {
			await collection.add({ id: "task-1", title: "Local", completed: false });

			const laterTime = clock.now();
			const remoteDoc = {
				jsonapi: { version: "1.1" as const },
				meta: { latest: laterTime },
				data: [
					{
						type: "tasks",
						id: "task-1",
						attributes: { id: "task-1", title: "Updated", completed: true },
						meta: {
							eventstamps: { id: laterTime, title: laterTime, completed: laterTime },
							latest: laterTime,
							deletedAt: null,
						},
					},
				],
			};

			await collection.merge(remoteDoc);

			const task = await collection.get("task-1");
			expect(task?.title).toBe("Updated");
			expect(task?.completed).toBe(true);
		});

		test("does not affect local-only resources", async () => {
			await collection.add({ id: "task-1", title: "Local" });
			await collection.add({ id: "task-2", title: "Also Local" });

			const remoteDoc = {
				jsonapi: { version: "1.1" as const },
				meta: { latest: clock.now() },
				data: [
					{
						type: "tasks",
						id: "task-1",
						attributes: { id: "task-1", title: "Updated", completed: false },
						meta: {
							eventstamps: { id: clock.now(), title: clock.now(), completed: clock.now() },
							latest: clock.now(),
							deletedAt: null,
						},
					},
				],
			};

			await collection.merge(remoteDoc);

			// task-2 should still exist unchanged
			const task2 = await collection.get("task-2");
			expect(task2?.title).toBe("Also Local");
		});

		test("emits correct mutation events", async () => {
			await collection.add({ id: "task-1", title: "Existing" });

			const mutations: any[] = [];
			collection.on("mutation", (event) => mutations.push(event));

			const laterTime = clock.now();
			const remoteDoc = {
				jsonapi: { version: "1.1" as const },
				meta: { latest: laterTime },
				data: [
					{
						type: "tasks",
						id: "task-1",
						attributes: { id: "task-1", title: "Updated", completed: false },
						meta: {
							eventstamps: { id: laterTime, title: laterTime, completed: laterTime },
							latest: laterTime,
							deletedAt: null,
						},
					},
					{
						type: "tasks",
						id: "task-2",
						attributes: { id: "task-2", title: "New", completed: false },
						meta: {
							eventstamps: { id: laterTime, title: laterTime, completed: laterTime },
							latest: laterTime,
							deletedAt: null,
						},
					},
				],
			};

			await collection.merge(remoteDoc);

			expect(mutations).toHaveLength(1);
			expect(mutations[0].added).toHaveLength(1);
			expect(mutations[0].updated).toHaveLength(1);
		});
	});

	describe("toDocument", () => {
		test("returns empty document when no resources", async () => {
			const doc = await collection.toDocument();

			expect(doc.jsonapi.version).toBe("1.1");
			expect(doc.data).toHaveLength(0);
		});

		test("returns all resources including deleted", async () => {
			await collection.add({ id: "task-1", title: "Active" });
			await collection.add({ id: "task-2", title: "Deleted" });
			await collection.remove("task-2");

			const doc = await collection.toDocument();

			expect(doc.data).toHaveLength(2);
		});

		test("includes correct metadata", async () => {
			await collection.add({ id: "task-1", title: "Test" });

			const doc = await collection.toDocument();

			expect(doc.jsonapi.version).toBe("1.1");
			expect(doc.meta.latest).toBeTruthy();
		});
	});

	describe("on", () => {
		test("subscribes to mutation events", async () => {
			const events: any[] = [];
			const unsubscribe = collection.on("mutation", (event) => {
				events.push(event);
			});

			await collection.add({ id: "task-1", title: "Test" });
			await collection.update("task-1", { completed: true });

			expect(events).toHaveLength(2);

			unsubscribe();
		});

		test("unsubscribe stops receiving events", async () => {
			const events: any[] = [];
			const unsubscribe = collection.on("mutation", (event) => {
				events.push(event);
			});

			await collection.add({ id: "task-1", title: "Test" });
			unsubscribe();
			await collection.update("task-1", { completed: true });

			expect(events).toHaveLength(1); // Only the add event
		});
	});
});
